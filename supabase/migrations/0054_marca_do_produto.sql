-- Marca do produto. A toxina tem preço diferente conforme a marca; o mesmo
-- vale para preenchedores e bioestimuladores. A marca é uma opção do
-- procedimento, independente da região (a toxina usa região para a área do
-- rosto). Na meta, todas as marcas do procedimento contam juntas; o
-- relatório de vendas mostra a marca.

create table procedimento_marca (
  id               uuid primary key default gen_random_uuid(),
  procedimento_id  uuid not null references procedimento(id) on delete cascade,
  nome             text not null check (length(trim(nome)) > 0),
  valor_sessao     numeric(12,2) not null check (valor_sessao >= 0),
  valor_parcelado  numeric(12,2) check (valor_parcelado >= 0),
  ativo            boolean not null default true,
  ordem            int not null default 0,
  created_at       timestamptz not null default now(),
  unique (procedimento_id, nome)
);
alter table procedimento_marca enable row level security;
create policy proc_marca_leitura on procedimento_marca for select using (auth.uid() is not null);
create policy proc_marca_admin on procedimento_marca for all using (e_admin()) with check (e_admin());
create policy proc_marca_gestao on procedimento_marca for all using (e_gestao()) with check (e_gestao());
create trigger procedimento_marca_auditoria after insert or update or delete on procedimento_marca
  for each row execute function registrar_auditoria();

alter table pacote add column marca_id uuid references procedimento_marca(id) on delete restrict;
alter table agendamento add column marca_id uuid references procedimento_marca(id) on delete restrict;

-- ── Agendamento com marca (assinatura nova: drop + create) ─────────────────
drop function criar_agendamento(uuid, uuid, timestamptz, uuid, uuid[], uuid[], uuid, text, numeric, uuid, numeric, integer);
create function criar_agendamento(p_paciente uuid, p_procedimento uuid, p_inicio timestamp with time zone, p_sala uuid, p_equipamentos uuid[] DEFAULT '{}'::uuid[], p_profissionais uuid[] DEFAULT '{}'::uuid[], p_pacote uuid DEFAULT NULL::uuid, p_observacoes text DEFAULT NULL::text, p_valor_avulso numeric DEFAULT NULL::numeric, p_regiao uuid DEFAULT NULL::uuid, p_quantidade numeric DEFAULT NULL::numeric, p_duracao integer DEFAULT NULL::integer, p_marca uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_prot        record;
  v_fim         timestamptz;
  v_agendamento uuid;
  v_usadas      int;
  v_pacote      pacote%rowtype;
  v_numero      int;
  v_marca       uuid := p_marca;
begin
  select * into v_prot from protocolo_efetivo(p_procedimento, p_regiao);
  if not found then
    raise exception 'Procedimento inexistente' using errcode = '23503';
  end if;

  -- RF-43 · duração ajustável na hora de agendar; o preparo segue o do procedimento.
  if p_duracao is not null and p_duracao <= 0 then
    raise exception 'Duração deve ser maior que zero' using errcode = '23514';
  end if;
  v_fim := p_inicio + make_interval(mins => coalesce(p_duracao, v_prot.duracao_min) + v_prot.buffer_min);

  if p_pacote is not null then
    select * into v_pacote from pacote where id = p_pacote for update;
    if not found then
      raise exception 'Pacote inexistente' using errcode = '23503';
    end if;
    if v_pacote.status <> 'ativo' then
      raise exception 'Pacote nao esta ativo (status: %)', v_pacote.status
        using errcode = '23514';
    end if;
    if v_pacote.validade is not null and v_pacote.validade < (now() at time zone tz_clinica())::date then
      raise exception 'Pacote vencido em %', v_pacote.validade using errcode = '23514';
    end if;

    -- O saldo é por região: pacote de papada não cobre o 1/3 superior.
    if v_pacote.regiao_id is not null
       and p_regiao is not null
       and v_pacote.regiao_id <> p_regiao then
      raise exception 'Este pacote e de outra regiao' using errcode = '23514';
    end if;

    select count(*) into v_usadas
      from agendamento
     where pacote_id = p_pacote and status <> 'cancelado';

    if v_usadas >= v_pacote.quantidade_sessoes then
      raise exception 'Pacote sem saldo: % de % sessoes ja utilizadas',
        v_usadas, v_pacote.quantidade_sessoes using errcode = '23514';
    end if;
    v_numero := v_usadas + 1;
    -- Sessão de pacote é da marca vendida.
    v_marca := coalesce(v_marca, v_pacote.marca_id);
  end if;

  if v_marca is not null and not exists (
       select 1 from procedimento_marca where id = v_marca and procedimento_id = p_procedimento) then
    raise exception 'Esta marca não é deste procedimento' using errcode = '23514';
  end if;

  perform set_config('app.suspender_reservas', 'on', true);

  insert into agendamento (paciente_id, procedimento_id, pacote_id, sala_id,
                           inicio, fim, numero_sessao, valor_avulso,
                           observacoes, criado_por, marca_id)
  values (p_paciente, p_procedimento, p_pacote, p_sala,
          p_inicio, v_fim, v_numero, p_valor_avulso,
          p_observacoes, auth.uid(), v_marca)
  returning id into v_agendamento;

  insert into agendamento_equipamento (agendamento_id, equipamento_id)
  select v_agendamento, unnest(p_equipamentos);

  insert into agendamento_profissional (agendamento_id, profissional_id)
  select v_agendamento, unnest(p_profissionais);

  if p_regiao is not null then
    insert into agendamento_regiao (agendamento_id, regiao_id, quantidade, unidade)
    values (v_agendamento, p_regiao,
            coalesce(p_quantidade, v_prot.quantidade_padrao), v_prot.unidade);
  end if;

  perform set_config('app.suspender_reservas', 'off', true);
  perform rebuild_reservas(v_agendamento);

  return v_agendamento;
end $function$
;
revoke execute on function criar_agendamento(uuid, uuid, timestamptz, uuid, uuid[], uuid[], uuid, text, numeric, uuid, numeric, integer, uuid) from public, anon;
grant execute on function criar_agendamento(uuid, uuid, timestamptz, uuid, uuid[], uuid[], uuid, text, numeric, uuid, numeric, integer, uuid) to authenticated;

drop function registrar_upsell(uuid, uuid, timestamptz, uuid, uuid[], uuid[], uuid, text, numeric, integer, uuid);
create function registrar_upsell(p_origem uuid, p_procedimento uuid, p_inicio timestamp with time zone, p_sala uuid, p_equipamentos uuid[] DEFAULT '{}'::uuid[], p_profissionais uuid[] DEFAULT '{}'::uuid[], p_pacote uuid DEFAULT NULL::uuid, p_observacoes text DEFAULT NULL::text, p_valor_avulso numeric DEFAULT NULL::numeric, p_duracao integer DEFAULT NULL::integer, p_regiao uuid DEFAULT NULL::uuid, p_marca uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_origem agendamento%rowtype;
  v_id     uuid;
begin
  select * into v_origem from agendamento where id = p_origem;
  if not found or v_origem.status = 'cancelado' then
    raise exception 'Atendimento de origem não encontrado' using errcode = '23503';
  end if;

  if not (
    perfil_atual() = 'admin' or e_atendimento()
    or (perfil_atual() = 'profissional' and exists (
          select 1 from agendamento_profissional ap
            join profissional p on p.id = ap.profissional_id
           where ap.agendamento_id = p_origem and p.usuario_id = auth.uid()))
  ) then
    raise exception 'Sem permissão para registrar upsell neste atendimento' using errcode = '42501';
  end if;

  perform set_config('app.upsell_origem', p_origem::text, true);
  v_id := criar_agendamento(v_origem.paciente_id, p_procedimento, p_inicio, p_sala,
                            p_equipamentos, p_profissionais, p_pacote, p_observacoes,
                            p_valor_avulso, p_regiao, null, p_duracao, p_marca);
  perform set_config('app.upsell_origem', '', true);
  return v_id;
end $function$
;
revoke execute on function registrar_upsell(uuid, uuid, timestamptz, uuid, uuid[], uuid[], uuid, text, numeric, integer, uuid, uuid) from public, anon;
grant execute on function registrar_upsell(uuid, uuid, timestamptz, uuid, uuid[], uuid[], uuid, text, numeric, integer, uuid, uuid) to authenticated;

drop function vender_pacote(uuid, uuid, integer, numeric, numeric, date, uuid, integer, date, text, boolean);
create function vender_pacote(p_paciente uuid, p_procedimento uuid, p_sessoes integer, p_valor_total numeric, p_desconto numeric, p_validade date, p_regiao uuid, p_parcelas integer, p_primeiro_vencimento date, p_forma text, p_primeira_paga boolean, p_marca uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pacote  uuid;
  v_liquido numeric := p_valor_total - coalesce(p_desconto, 0);
  v_parcela numeric;
  v_nome    text;
  i         integer;
begin
  -- Quem vende: admin, recepção, SDR, closer (como antes, pelo RLS) e agora a
  -- profissional, para paciente que ela atende — a venda feita no consultório.
  if not (
    perfil_atual() = 'admin' or e_atendimento()
    or (perfil_atual() = 'profissional' and exists (
          select 1 from agendamento a
            join agendamento_profissional ap on ap.agendamento_id = a.id
            join profissional p on p.id = ap.profissional_id
           where a.paciente_id = p_paciente and a.status <> 'cancelado'
             and p.usuario_id = auth.uid()))
  ) then
    raise exception 'Sem permissão para vender pacote a este paciente' using errcode = '42501';
  end if;

  if p_parcelas < 1 or p_parcelas > 24 then
    raise exception 'Parcelas devem ficar entre 1 e 24' using errcode = '23514';
  end if;

  if p_marca is not null and not exists (
       select 1 from procedimento_marca where id = p_marca and procedimento_id = p_procedimento) then
    raise exception 'Esta marca não é deste procedimento' using errcode = '23514';
  end if;

  insert into pacote (paciente_id, procedimento_id, quantidade_sessoes, valor_total,
                      desconto, validade, regiao_id, vendido_por, marca_id)
  values (p_paciente, p_procedimento, p_sessoes, p_valor_total,
          coalesce(p_desconto, 0), p_validade, p_regiao, auth.uid(), p_marca)
  returning id into v_pacote;

  select nome into v_nome from procedimento where id = p_procedimento;

  -- Centavos que não dividem por igual vão na última parcela.
  v_parcela := trunc(v_liquido / p_parcelas, 2);
  for i in 1 .. p_parcelas loop
    insert into lancamento (tipo, origem_tipo, origem_id, categoria, descricao, valor,
                            vencimento, parcela_num, parcela_total, forma_pagamento,
                            status, data_pagamento)
    values ('receita', 'pacote', v_pacote, 'pacote',
            format('Pacote %s — %s/%s', v_nome, i, p_parcelas),
            case when i = p_parcelas then v_liquido - v_parcela * (p_parcelas - 1)
                 else v_parcela end,
            (p_primeiro_vencimento + make_interval(months => i - 1))::date,
            i, p_parcelas, p_forma,
            case when i = 1 and p_primeira_paga then 'pago'::status_lancamento
                 else 'pendente'::status_lancamento end,
            case when i = 1 and p_primeira_paga then (now() at time zone tz_clinica())::date end);
  end loop;

  return v_pacote;
end $function$
;
revoke execute on function vender_pacote(uuid, uuid, integer, numeric, numeric, date, uuid, integer, date, text, boolean, uuid) from public, anon;
grant execute on function vender_pacote(uuid, uuid, integer, numeric, numeric, date, uuid, integer, date, text, boolean, uuid) to authenticated;

-- ── Relatório de vendas com a marca ─────────────────────────────────────────
drop function vendas_periodo(date, date);
create function vendas_periodo(p_de date, p_ate date)
returns table (
  tipo text, id uuid, dia date, valor numeric,
  paciente_id uuid, paciente_nome text, procedimento_id uuid, procedimento_nome text,
  regioes uuid[], marca_nome text,
  vendedor_id uuid, vendedor_nome text, vendedor_perfil text, canal text
) language sql stable security invoker as $$
  select 'pacote', pc.id, pc.data_venda, pc.valor_total - pc.desconto,
         pa.id, pa.nome, pr.id, pr.nome,
         case when pc.regiao_id is null then '{}'::uuid[] else array[pc.regiao_id] end,
         (select m.nome from procedimento_marca m where m.id = pc.marca_id),
         u.id, u.nome, u.perfil::text,
         case when u.perfil in ('sdr', 'closer') then 'comercial'
              when u.perfil = 'profissional' then 'clinica'
              else 'recepcao' end
    from pacote pc
    join paciente pa on pa.id = pc.paciente_id
    join procedimento pr on pr.id = pc.procedimento_id
    left join usuario u on u.id = pc.vendido_por
   where pc.status <> 'cancelado'
     and pc.data_venda between p_de and p_ate
  union all
  select 'avulsa', a.id, (a.created_at at time zone tz_clinica())::date, a.valor_avulso,
         pa.id, pa.nome, pr.id, pr.nome,
         coalesce((select array_agg(ar.regiao_id) from agendamento_regiao ar
                    where ar.agendamento_id = a.id), '{}'::uuid[]),
         (select m.nome from procedimento_marca m where m.id = a.marca_id),
         u.id, u.nome, u.perfil::text,
         case when a.origem = 'comercial' then 'comercial'
              when a.origem = 'upsell' then 'clinica'
              else 'recepcao' end
    from agendamento a
    join paciente pa on pa.id = a.paciente_id
    join procedimento pr on pr.id = a.procedimento_id
    left join usuario u on u.id = coalesce(a.vendido_por, a.criado_por)
   where a.pacote_id is null
     and coalesce(a.valor_avulso, 0) > 0
     and not pr.avaliacao
     and a.status <> 'cancelado'
     and (a.created_at at time zone tz_clinica())::date between p_de and p_ate
$$;

revoke execute on function vendas_periodo(date, date) from public, anon;
grant execute on function vendas_periodo(date, date) to authenticated;
