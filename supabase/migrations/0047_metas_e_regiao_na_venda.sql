-- 0047 · Metas do mês e região na venda
--
-- Meta de ocupação do mês (outubro/2026: 20%) e metas diárias de venda por
-- procedimento — por região quando o procedimento tem regiões (Ultraformer
-- olhos, papada, 1/3 superior e inferior são regiões do Ultraformer MPT).
-- "1 pacote a cada 2 dias" é guardado como 0,5 por dia.
--
-- Para contar por região, a venda passa a carregar a região: vendas_periodo
-- devolve as regiões de cada venda, e registrar_upsell aceita a região como
-- o criar_agendamento já aceitava.

-- ── Metas ───────────────────────────────────────────────────────────────────
create table meta_mes (
  id         uuid primary key default gen_random_uuid(),
  mes        text not null unique check (mes ~ '^\d{4}-\d{2}$'),
  ocupacao   numeric(5,4) check (ocupacao > 0 and ocupacao <= 1),
  updated_at timestamptz not null default now()
);

create table meta_venda (
  id              uuid primary key default gen_random_uuid(),
  mes             text not null check (mes ~ '^\d{4}-\d{2}$'),
  rotulo          text not null check (length(trim(rotulo)) > 0),
  procedimento_id uuid not null references procedimento(id),
  -- Vazio = qualquer região (ou procedimento sem região).
  regioes         uuid[] not null default '{}',
  -- 'venda' conta pacote e sessão avulsa; 'pacote' conta só pacote.
  contagem        text not null default 'venda' check (contagem in ('venda', 'pacote')),
  por_dia_min     numeric(6,3) not null check (por_dia_min > 0),
  por_dia_max     numeric(6,3) check (por_dia_max >= por_dia_min),
  ordem           int not null default 0,
  created_at      timestamptz not null default now()
);
create index on meta_venda (mes, ordem);

create trigger meta_mes_updated_at before update on meta_mes
  for each row execute function set_updated_at();
create trigger meta_mes_auditoria after insert or update or delete on meta_mes
  for each row execute function registrar_auditoria();
create trigger meta_venda_auditoria after insert or update or delete on meta_venda
  for each row execute function registrar_auditoria();

alter table meta_mes enable row level security;
alter table meta_venda enable row level security;
-- O time inteiro vê a meta; só admin e gestão definem.
create policy meta_mes_leitura on meta_mes for select using (auth.uid() is not null);
create policy meta_mes_gestao on meta_mes for all using (e_gestao()) with check (e_gestao());
create policy meta_venda_leitura on meta_venda for select using (auth.uid() is not null);
create policy meta_venda_gestao on meta_venda for all using (e_gestao()) with check (e_gestao());

-- ── Vendas com procedimento e regiões ───────────────────────────────────────
drop function if exists vendas_periodo(date, date);

create function vendas_periodo(p_de date, p_ate date)
returns table (
  tipo text, id uuid, dia date, valor numeric,
  paciente_id uuid, paciente_nome text, procedimento_id uuid, procedimento_nome text,
  regioes uuid[],
  vendedor_id uuid, vendedor_nome text, vendedor_perfil text, canal text
) language sql stable security invoker as $$
  select 'pacote', pc.id, pc.data_venda, pc.valor_total - pc.desconto,
         pa.id, pa.nome, pr.id, pr.nome,
         case when pc.regiao_id is null then '{}'::uuid[] else array[pc.regiao_id] end,
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

-- ── Upsell com região ────────────────────────────────────────────────────────
drop function if exists registrar_upsell(uuid, uuid, timestamptz, uuid, uuid[], uuid[], uuid, text, numeric, integer);

create function registrar_upsell(
  p_origem        uuid,
  p_procedimento  uuid,
  p_inicio        timestamptz,
  p_sala          uuid,
  p_equipamentos  uuid[] default '{}',
  p_profissionais uuid[] default '{}',
  p_pacote        uuid default null,
  p_observacoes   text default null,
  p_valor_avulso  numeric default null,
  p_duracao       integer default null,
  p_regiao        uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
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
                            p_valor_avulso, p_regiao, null, p_duracao);
  perform set_config('app.upsell_origem', '', true);
  return v_id;
end $$;

revoke execute on function registrar_upsell(uuid, uuid, timestamptz, uuid, uuid[], uuid[], uuid, text, numeric, integer, uuid) from public, anon;
grant execute on function registrar_upsell(uuid, uuid, timestamptz, uuid, uuid[], uuid[], uuid, text, numeric, integer, uuid) to authenticated;

-- ── Catálogo: Fotona Íntimo + PRP (valor, duração e aparelho a completar) ───
insert into procedimento (nome, descricao, duracao_min, valor_sessao, sessoes_padrao)
select 'Fotona Íntimo + PRP', 'Cadastrado para a meta de outubro/2026. Complete valor, duração e aparelho.', 30, 0, 1
 where not exists (select 1 from procedimento where nome = 'Fotona Íntimo + PRP');

-- ── Metas de outubro/2026, como desenhadas pela gestão ──────────────────────
insert into meta_mes (mes, ocupacao) values ('2026-10', 0.20);

with p as (select id, nome from procedimento),
     r as (select id, nome from regiao)
insert into meta_venda (mes, rotulo, procedimento_id, regioes, contagem, por_dia_min, por_dia_max, ordem)
select '2026-10', m.rotulo, (select id from p where nome = m.proc),
       coalesce((select array_agg(r.id) from r where r.nome = any(m.regs)), '{}'),
       m.contagem, m.minimo, m.maximo, m.ordem
  from (values
    ('Toxina 50 UI',              'Toxina Botulínica 50 UI', '{}'::text[], 'venda',  9.0,   9.0,  1),
    ('Ultraformer Olhos',         'Ultraformer MPT', '{"Pálpebra superior","Pálpebra inferior"}', 'venda', 7.0, 7.0, 2),
    ('Ultraformer Papada',        'Ultraformer MPT', '{"Papada"}',           'venda',  7.0,   7.0,  3),
    ('CM Slim',                   'CM Slim',                 '{}',           'pacote', 0.5,   0.5,  4),
    ('Onda',                      'Onda Coolwaves',          '{}',           'pacote', 0.5,   0.5,  5),
    ('Fotona',                    'Fotona 1D',               '{}',           'venda',  9.0,   9.0,  6),
    ('Ultraformer 1/3 superior',  'Ultraformer MPT', '{"Terço superior"}',   'venda',  3.0,   4.0,  7),
    ('Ultraformer 1/3 inferior',  'Ultraformer MPT', '{"Terço inferior"}',   'venda',  3.0,   4.0,  8),
    ('Melasma',                   'Fotona Melasma',          '{}',           'venda',  9.0,   9.0,  9),
    ('Fotona Íntimo + PRP',       'Fotona Íntimo + PRP',     '{}',           'venda',  4.0,   5.0, 10),
    ('Capilar',                   'Tricologia',              '{}',           'venda',  0.333, 0.333, 11)
  ) as m(rotulo, proc, regs, contagem, minimo, maximo, ordem);
