-- 0010 · Financeiro: recebimentos, comissões e despesas
-- SPEC §3.6 · RF-80 a RF-88 · RN-04, RN-05, RN-07

create table lancamento (
  id              uuid primary key default gen_random_uuid(),
  tipo            tipo_lancamento not null,
  origem_tipo     text not null check (origem_tipo in ('pacote','agendamento','despesa_fixa','outro')),
  origem_id       uuid,
  categoria       text,
  descricao       text,
  valor           numeric(12,2) not null check (valor >= 0),
  vencimento      date not null,
  data_pagamento  date,
  forma_pagamento text,
  status          status_lancamento not null default 'pendente',
  parcela_num     int,
  parcela_total   int,
  created_at      timestamptz not null default now(),
  constraint parcela_coerente
    check ((parcela_num is null) = (parcela_total is null)
           and (parcela_num is null or parcela_num between 1 and parcela_total))
);
create index on lancamento (status, vencimento);
create index on lancamento (origem_tipo, origem_id);

create table comissao (
  id              uuid primary key default gen_random_uuid(),
  agendamento_id  uuid not null references agendamento(id) on delete cascade,
  profissional_id uuid not null references profissional(id),
  base_calculo    numeric(12,2) not null,
  percentual      numeric(6,3),
  valor           numeric(12,2) not null check (valor >= 0),
  status          status_comissao not null default 'prevista',
  competencia     text not null check (competencia ~ '^\d{4}-\d{2}$'),
  created_at      timestamptz not null default now(),
  unique (agendamento_id, profissional_id)
);
create index on comissao (profissional_id, competencia);

create table despesa_fixa (
  id          uuid primary key default gen_random_uuid(),
  descricao   text not null,
  categoria   text,
  valor       numeric(12,2) not null check (valor >= 0),
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  recorrente  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on despesa_fixa (competencia);

-- ── RN-04 · receita da sessão ───────────────────────────────────────────────
-- Pacote vendido congela o preço (RN-09): a receita vem do valor gravado no
-- pacote, nunca da tabela atual do procedimento.
create or replace function receita_sessao(p_agendamento uuid)
returns numeric language sql stable as $$
  select case
    when a.pacote_id is not null
      then round((pc.valor_total - pc.desconto) / pc.quantidade_sessoes, 2)
    else coalesce(a.valor_avulso, 0)
  end
  from agendamento a
  left join pacote pc on pc.id = a.pacote_id
  where a.id = p_agendamento;
$$;

-- ── RN-04 · custo direto da sessão ──────────────────────────────────────────
-- Insumos do procedimento + custo/hora de cada equipamento e de cada
-- profissional envolvidos, proporcional à duração.
create or replace function custo_direto_sessao(p_agendamento uuid)
returns numeric language sql stable as $$
  with ag as (
    select a.id, a.procedimento_id,
           extract(epoch from (a.fim - a.inicio)) / 3600.0 as horas
    from agendamento a where a.id = p_agendamento
  ),
  insumos as (
    select coalesce(sum(pc.valor_unitario * pc.quantidade), 0) as v
    from ag join procedimento_custo pc on pc.procedimento_id = ag.procedimento_id
  ),
  equip as (
    select coalesce(sum(ec.custo_hora * ag.horas), 0) as v
    from ag
    join agendamento_equipamento ae on ae.agendamento_id = ag.id
    join equipamento_custo ec on ec.equipamento_id = ae.equipamento_id
  ),
  prof as (
    select coalesce(sum(pr.custo_hora * ag.horas), 0) as v
    from ag
    join agendamento_profissional ap on ap.agendamento_id = ag.id
    join profissional_remuneracao pr on pr.profissional_id = ap.profissional_id
  )
  select round((select v from insumos) + (select v from equip) + (select v from prof), 2);
$$;

-- ── RN-05 · comissão ────────────────────────────────────────────────────────
-- Com mais de um profissional, cada um calcula pela sua própria regra sobre a
-- base RATEADA (receita ÷ nº de profissionais). Aplicar a regra de cada um
-- sobre a receita cheia pagaria comissão sobre dinheiro que não existe.
create or replace function gerar_comissoes(p_agendamento uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_receita numeric;
  v_n       int;
  v_comp    text;
begin
  select count(*) into v_n
    from agendamento_profissional where agendamento_id = p_agendamento;
  if v_n = 0 then return; end if;

  v_receita := receita_sessao(p_agendamento);
  select to_char(inicio at time zone tz_clinica(), 'YYYY-MM') into v_comp
    from agendamento where id = p_agendamento;

  insert into comissao (agendamento_id, profissional_id, base_calculo,
                        percentual, valor, status, competencia)
  select
    p_agendamento,
    ap.profissional_id,
    round(v_receita / v_n, 2),
    case when pr.comissao_tipo = 'percentual' then pr.comissao_valor end,
    case pr.comissao_tipo
      when 'percentual' then round(v_receita / v_n * pr.comissao_valor / 100, 2)
      when 'valor_fixo' then pr.comissao_valor
      else 0
    end,
    'prevista',
    v_comp
  from agendamento_profissional ap
  join profissional_remuneracao pr on pr.profissional_id = ap.profissional_id
  where ap.agendamento_id = p_agendamento
    and pr.comissao_tipo <> 'nenhuma'
  on conflict (agendamento_id, profissional_id) do update
    set base_calculo = excluded.base_calculo,
        valor        = excluded.valor,
        competencia  = excluded.competencia;
end $$;

-- RF-83 · comissão nasce quando a sessão é marcada como realizada.
-- RN-06 · falta NÃO gera comissão: o profissional não atendeu ninguém.
create or replace function trg_comissao_ao_realizar() returns trigger
language plpgsql as $$
begin
  if new.status = 'realizado' and old.status is distinct from 'realizado' then
    perform gerar_comissoes(new.id);
  elsif new.status <> 'realizado' and old.status = 'realizado' then
    -- Reverter o realizado cancela comissão ainda não paga. A já paga fica,
    -- e o estorno é decisão humana registrada na auditoria (RN-05).
    delete from comissao
     where agendamento_id = new.id and status <> 'paga';
  end if;
  return null;
end $$;

create trigger agendamento_comissao
  after update of status on agendamento
  for each row execute function trg_comissao_ao_realizar();

-- ── RN-07 · rateio de despesa fixa ──────────────────────────────────────────
-- O denominador usa capacidade de SALAS, não de equipamentos nem de
-- profissionais: a mesma hora física seria contada várias vezes.
create or replace function custo_hora_estrutura(p_competencia text)
returns numeric language sql stable as $$
  with periodo as (
    select (p_competencia || '-01')::date as ini,
           ((p_competencia || '-01')::date + interval '1 month')::date as fim
  ),
  despesas as (
    select coalesce(sum(valor), 0) as total
    from despesa_fixa where competencia = p_competencia
  ),
  capacidade as (
    select coalesce(sum(extract(epoch from capacidade_recurso(
             'sala', s.id,
             timezone(tz_clinica(), p.ini::timestamp),
             timezone(tz_clinica(), p.fim::timestamp)))) / 3600.0, 0) as horas
    from sala s, periodo p
  )
  select case when (select horas from capacidade) > 0
              then round((select total from despesas) / (select horas from capacidade), 2)
         end;
$$;

-- ── RN-04 · margem consolidada da sessão ────────────────────────────────────
create or replace function margem_sessao(p_agendamento uuid)
returns table (
  receita         numeric,
  custo_direto    numeric,
  comissao        numeric,
  margem_contrib  numeric,
  margem_pct      numeric,
  margem_por_hora numeric
) language sql stable as $$
  with base as (
    select
      receita_sessao(p_agendamento) as r,
      custo_direto_sessao(p_agendamento) as c,
      coalesce((select sum(valor) from comissao where agendamento_id = p_agendamento), 0) as k,
      (select extract(epoch from (fim - inicio)) / 3600.0
         from agendamento where id = p_agendamento) as h
  )
  select
    r, c, k,
    round(r - c - k, 2),
    case when r > 0 then round((r - c - k) / r, 4) end,
    case when h > 0 then round((r - c - k) / h::numeric, 2) end
  from base;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table lancamento   enable row level security;
alter table comissao     enable row level security;
alter table despesa_fixa enable row level security;

create policy lancamento_admin on lancamento for all
  using (e_admin()) with check (e_admin());

-- RF-88 · a recepção registra e consulta RECEBIMENTOS, nunca despesas.
create policy lancamento_recepcao_leitura on lancamento for select
  using (perfil_atual() = 'recepcao' and tipo = 'receita');
create policy lancamento_recepcao_insert on lancamento for insert
  with check (perfil_atual() = 'recepcao' and tipo = 'receita');
create policy lancamento_recepcao_update on lancamento for update
  using (perfil_atual() = 'recepcao' and tipo = 'receita')
  with check (perfil_atual() = 'recepcao' and tipo = 'receita');

create policy comissao_admin on comissao for all
  using (e_admin()) with check (e_admin());

-- CA-11 · o profissional vê a própria comissão, jamais a dos colegas.
create policy comissao_propria on comissao for select
  using (profissional_id = profissional_atual());

-- Despesa é só do admin: nem recepção nem profissional alcançam.
create policy despesa_admin on despesa_fixa for all
  using (e_admin()) with check (e_admin());
