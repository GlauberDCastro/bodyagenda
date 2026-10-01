-- 0028 · Caixa: contas a receber, recebimentos, estorno e pacote concluído
--
-- Até aqui `lancamento` existia, mas nada o preenchia: vender pacote não gerava
-- cobrança e não havia como registrar pagamento. Sem isso o aging, a
-- inadimplência e a receita realizada ficavam sempre zerados.
--
--   RF-80  vender_pacote()          pacote + parcelas numa transação só
--   RF-81  registrar_recebimento()  pagamento total ou parcial, com forma
--   RF-82  marcar_atrasados()       pendente vencido vira atrasado
--   RF-65  cancelar_pacote()        cancela parcelas em aberto e apura o saldo
--   RF-64  pacote concluído quando a última sessão é realizada
--   avulsa realizada gera a cobrança da sessão

-- ── RF-80 · vender pacote com parcelas ──────────────────────────────────────
create or replace function vender_pacote(
  p_paciente           uuid,
  p_procedimento       uuid,
  p_sessoes            integer,
  p_valor_total        numeric,
  p_desconto           numeric,
  p_validade           date,
  p_regiao             uuid,
  p_parcelas           integer,
  p_primeiro_vencimento date,
  p_forma              text,
  p_primeira_paga      boolean
) returns uuid language plpgsql security invoker as $$
declare
  v_pacote  uuid;
  v_liquido numeric := p_valor_total - coalesce(p_desconto, 0);
  v_parcela numeric;
  v_nome    text;
  i         integer;
begin
  if p_parcelas < 1 or p_parcelas > 24 then
    raise exception 'Parcelas devem ficar entre 1 e 24' using errcode = '23514';
  end if;

  insert into pacote (paciente_id, procedimento_id, quantidade_sessoes, valor_total,
                      desconto, validade, regiao_id, vendido_por)
  values (p_paciente, p_procedimento, p_sessoes, p_valor_total,
          coalesce(p_desconto, 0), p_validade, p_regiao, auth.uid())
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
end $$;

-- ── RF-81 · recebimento, inclusive parcial ──────────────────────────────────
-- Parcial divide a linha: a parte paga fica `pago`, o resto vira uma linha
-- nova em aberto com o mesmo vencimento. Assim o aging continua contando só
-- o que falta, e cada pagamento tem sua data e forma.
create or replace function registrar_recebimento(
  p_lancamento uuid,
  p_valor      numeric,
  p_data       date,
  p_forma      text
) returns uuid language plpgsql security invoker as $$
declare
  l       lancamento%rowtype;
  v_resto uuid;
begin
  select * into l from lancamento where id = p_lancamento for update;
  if not found then
    raise exception 'Lançamento não encontrado' using errcode = '42501';
  end if;
  if l.tipo <> 'receita' or l.status not in ('pendente', 'atrasado') then
    raise exception 'Só se recebe uma cobrança em aberto' using errcode = '23514';
  end if;
  if p_valor is null or p_valor <= 0 or p_valor > l.valor then
    raise exception 'Valor recebido deve ser maior que zero e até %', l.valor
      using errcode = '23514';
  end if;

  if p_valor < l.valor then
    insert into lancamento (tipo, origem_tipo, origem_id, categoria, descricao, valor,
                            vencimento, parcela_num, parcela_total, forma_pagamento, status)
    values (l.tipo, l.origem_tipo, l.origem_id, l.categoria,
            l.descricao || ' (restante)', l.valor - p_valor, l.vencimento,
            l.parcela_num, l.parcela_total, l.forma_pagamento, l.status)
    returning id into v_resto;
  end if;

  update lancamento
     set valor = p_valor, status = 'pago', data_pagamento = p_data, forma_pagamento = p_forma
   where id = p_lancamento;

  return v_resto;
end $$;

-- ── RF-82 · atrasados ───────────────────────────────────────────────────────
-- Chamada na abertura das telas de cobrança, em vez de um job: o que venceu
-- ontem aparece atrasado hoje sem depender de rotina agendada. DEFINER porque
-- a recepção vê a cobrança mas não atualiza status de lançamento que não é
-- dela; a função só faz esta transição e nada mais.
create or replace function marcar_atrasados() returns integer
language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  update lancamento set status = 'atrasado'
   where status = 'pendente'
     and tipo = 'receita'
     and vencimento < (now() at time zone tz_clinica())::date;
  get diagnostics v = row_count;
  return v;
end $$;

-- ── RF-65 · cancelar pacote ─────────────────────────────────────────────────
-- Cancela as parcelas em aberto e compara o que foi pago com o que foi
-- consumido (sessões realizadas ou faltas, RN-06). Pago a mais = estorno a
-- devolver (lançamento de despesa); pago a menos = saldo a cobrar.
-- DEFINER porque o estorno é uma despesa, que a recepção não lança; a
-- permissão de cancelar é checada aqui dentro.
create or replace function cancelar_pacote(p_pacote uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p           pacote%rowtype;
  v_por_sessao numeric;
  v_consumidas integer;
  v_pago      numeric;
  v_consumido numeric;
  v_saldo     numeric;
  v_nome      text;
begin
  if perfil_atual() not in ('admin', 'recepcao') then
    raise exception 'Seu perfil não pode cancelar pacote' using errcode = '42501';
  end if;

  select * into p from pacote where id = p_pacote for update;
  if not found then
    raise exception 'Pacote não encontrado' using errcode = '23503';
  end if;
  if p.status = 'cancelado' then
    raise exception 'Pacote já está cancelado' using errcode = '23514';
  end if;

  update pacote set status = 'cancelado' where id = p_pacote;

  update lancamento set status = 'cancelado'
   where origem_tipo = 'pacote' and origem_id = p_pacote
     and status in ('pendente', 'atrasado');

  v_por_sessao := round((p.valor_total - p.desconto) / p.quantidade_sessoes, 2);
  select count(*) into v_consumidas
    from agendamento where pacote_id = p_pacote and status in ('realizado', 'falta');
  select coalesce(sum(valor), 0) into v_pago
    from lancamento where origem_tipo = 'pacote' and origem_id = p_pacote and status = 'pago';

  v_consumido := v_por_sessao * v_consumidas;
  v_saldo := v_pago - v_consumido;
  select nome into v_nome from procedimento where id = p.procedimento_id;

  if v_saldo > 0 then
    insert into lancamento (tipo, origem_tipo, origem_id, categoria, descricao, valor, vencimento)
    values ('despesa', 'pacote', p_pacote, 'estorno',
            format('Estorno do pacote %s cancelado', v_nome), v_saldo,
            (now() at time zone tz_clinica())::date);
  elsif v_saldo < 0 then
    insert into lancamento (tipo, origem_tipo, origem_id, categoria, descricao, valor, vencimento)
    values ('receita', 'pacote', p_pacote, 'pacote',
            format('Saldo do pacote %s cancelado', v_nome), -v_saldo,
            (now() at time zone tz_clinica())::date);
  end if;

  return jsonb_build_object('pago', v_pago, 'consumido', v_consumido, 'saldo', v_saldo,
                            'sessoes_consumidas', v_consumidas);
end $$;

-- ── Status do atendimento: cobrança da avulsa e conclusão do pacote ─────────
-- DEFINER pelo mesmo motivo da comissão (0010): quem marca "realizado" pode ser
-- o profissional, que não lança nem lê o caixa.
create or replace function trg_caixa_ao_mudar_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nome   text;
  v_usadas integer;
  v_total  integer;
begin
  -- Avulsa realizada → cobrança da sessão, uma só por atendimento.
  if new.pacote_id is null and coalesce(new.valor_avulso, 0) > 0 then
    if new.status = 'realizado' and old.status is distinct from 'realizado'
       and not exists (select 1 from lancamento
                        where origem_tipo = 'agendamento' and origem_id = new.id
                          and status <> 'cancelado') then
      select nome into v_nome from procedimento where id = new.procedimento_id;
      insert into lancamento (tipo, origem_tipo, origem_id, categoria, descricao, valor, vencimento)
      values ('receita', 'agendamento', new.id, 'avulsa',
              format('Sessão avulsa — %s', v_nome), new.valor_avulso,
              (new.inicio at time zone tz_clinica())::date);
    elsif new.status <> 'realizado' and old.status = 'realizado' then
      -- Desfazer o realizado cancela a cobrança ainda não paga.
      update lancamento set status = 'cancelado'
       where origem_tipo = 'agendamento' and origem_id = new.id
         and status in ('pendente', 'atrasado');
    end if;
  end if;

  -- RF-64 · pacote concluído quando todas as sessões foram consumidas.
  if new.pacote_id is not null then
    select quantidade_sessoes into v_total from pacote where id = new.pacote_id;
    select count(*) into v_usadas
      from agendamento where pacote_id = new.pacote_id and status in ('realizado', 'falta');
    update pacote set status = case when v_usadas >= v_total then 'concluido'::status_pacote
                                    else 'ativo'::status_pacote end
     where id = new.pacote_id and status in ('ativo', 'concluido');
  end if;

  return null;
end $$;

create trigger agendamento_caixa
  after update of status on agendamento
  for each row when (old.status is distinct from new.status)
  execute function trg_caixa_ao_mudar_status();

-- ── Quem está pagando: a lista de cobranças precisa do paciente ─────────────
-- O lançamento aponta para a origem (pacote ou atendimento); o paciente vem
-- dela. INVOKER: cada perfil vê só os lançamentos que o RLS já lhe mostra.
create or replace function cobrancas(p_paciente uuid default null)
returns table (
  id uuid, tipo tipo_lancamento, origem_tipo text, origem_id uuid, categoria text,
  descricao text, valor numeric, vencimento date, data_pagamento date,
  forma_pagamento text, status status_lancamento, parcela_num integer,
  parcela_total integer, paciente_id uuid, paciente_nome text
) language sql stable security invoker as $$
  select l.id, l.tipo, l.origem_tipo, l.origem_id, l.categoria, l.descricao, l.valor,
         l.vencimento, l.data_pagamento, l.forma_pagamento, l.status, l.parcela_num,
         l.parcela_total, pa.id, pa.nome
    from lancamento l
    left join pacote pc on l.origem_tipo = 'pacote' and pc.id = l.origem_id
    left join agendamento ag on l.origem_tipo = 'agendamento' and ag.id = l.origem_id
    left join paciente pa on pa.id = coalesce(pc.paciente_id, ag.paciente_id)
   where l.tipo = 'receita'
     and (p_paciente is null or pa.id = p_paciente)
$$;

-- ── RF-94 · receita realizada × prevista, e por forma de pagamento ──────────
create or replace function receita_periodo(p_de date, p_ate date)
returns table (forma text, prevista numeric, realizada numeric)
language sql stable security invoker as $$
  select coalesce(forma_pagamento, 'Não informada'),
         coalesce(sum(valor) filter (where vencimento between p_de and p_ate
                                       and status <> 'cancelado'), 0),
         coalesce(sum(valor) filter (where status = 'pago'
                                       and data_pagamento between p_de and p_ate), 0)
    from lancamento
   where tipo = 'receita'
     and ((vencimento between p_de and p_ate) or (data_pagamento between p_de and p_ate))
   group by 1
   order by 3 desc
$$;

revoke execute on function vender_pacote(uuid, uuid, integer, numeric, numeric, date, uuid, integer, date, text, boolean) from public, anon;
revoke execute on function registrar_recebimento(uuid, numeric, date, text) from public, anon;
revoke execute on function marcar_atrasados() from public, anon;
revoke execute on function cancelar_pacote(uuid) from public, anon;
revoke execute on function cobrancas(uuid) from public, anon;
revoke execute on function receita_periodo(date, date) from public, anon;
grant execute on function vender_pacote(uuid, uuid, integer, numeric, numeric, date, uuid, integer, date, text, boolean) to authenticated;
grant execute on function registrar_recebimento(uuid, numeric, date, text) to authenticated;
grant execute on function marcar_atrasados() to authenticated;
grant execute on function cancelar_pacote(uuid) to authenticated;
grant execute on function cobrancas(uuid) to authenticated;
grant execute on function receita_periodo(date, date) to authenticated;
