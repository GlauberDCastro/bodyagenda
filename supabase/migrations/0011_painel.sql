-- 0011 · Agregados do painel e relatórios
-- RF-70 a RF-78, RF-90 a RF-101 · RN-08

-- ── Painel de ocupação, todos os recursos de um tipo de uma vez ─────────────
-- Uma chamada por tipo em vez de N chamadas a ocupacao_recurso(): o painel
-- precisa carregar em 2s (RNF-04) e a clínica tem dezenas de recursos.
create or replace function painel_ocupacao(
  p_tipo   tipo_recurso,
  p_inicio timestamptz,
  p_fim    timestamptz
) returns table (
  recurso_id       uuid,
  nome             text,
  agrupador        text,
  capacidade_h     numeric,
  agendadas_h      numeric,
  realizadas_h     numeric,
  taxa_agendada    numeric,
  taxa_efetiva     numeric,
  ociosidade_h     numeric,
  atendimentos     int,
  faltas           int,
  receita          numeric,
  receita_por_hora numeric
) language sql stable as $$
  with recursos as (
    select s.id, 'Sala ' || s.numero || ' — ' || s.nome as nome, 'Salas' as agrupador
      from sala s where p_tipo = 'sala' and s.ativo
    union all
    select e.id, e.nome, e.modelo from equipamento e
      where p_tipo = 'equipamento' and e.ativo
    union all
    select pf.id, pf.nome, coalesce(pf.especialidade, 'Sem especialidade')
      from profissional pf where p_tipo = 'profissional' and pf.ativo
  ),
  cap as (
    select r.id, r.nome, r.agrupador,
           extract(epoch from capacidade_recurso(p_tipo, r.id, p_inicio, p_fim)) / 3600.0 as horas
    from recursos r
  ),
  uso as (
    select
      r.recurso_id,
      coalesce(sum(extract(epoch from (upper(x.p) - lower(x.p))) / 3600.0)
               filter (where a.status <> 'cancelado'), 0) as ag,
      coalesce(sum(extract(epoch from (upper(x.p) - lower(x.p))) / 3600.0)
               filter (where a.status = 'realizado'), 0) as re,
      count(*) filter (where a.status = 'realizado')::int as n_realizados,
      count(*) filter (where a.status = 'falta')::int as n_faltas,
      coalesce(sum(receita_sessao(a.id)) filter (where a.status = 'realizado'), 0) as receita
    from reserva r
    join agendamento a on a.id = r.agendamento_id
    cross join lateral (select r.periodo * tstzrange(p_inicio, p_fim, '[)') as p) x
    where r.recurso_tipo = p_tipo and r.ativo and not isempty(x.p)
    group by r.recurso_id
  )
  select
    cap.id, cap.nome, cap.agrupador,
    round(cap.horas::numeric, 2),
    round(coalesce(uso.ag, 0)::numeric, 2),
    round(coalesce(uso.re, 0)::numeric, 2),
    case when cap.horas > 0 then round((coalesce(uso.ag, 0) / cap.horas)::numeric, 4) end,
    case when cap.horas > 0 then round((coalesce(uso.re, 0) / cap.horas)::numeric, 4) end,
    round(greatest(0, cap.horas - coalesce(uso.re, 0))::numeric, 2),
    coalesce(uso.n_realizados, 0),
    coalesce(uso.n_faltas, 0),
    round(coalesce(uso.receita, 0), 2),
    -- RN-08 · o indicador que a taxa de ocupação esconde. Uma sala 90% cheia
    -- de procedimento barato rende menos que uma 60% cheia de caro.
    case when cap.horas > 0 then round(coalesce(uso.receita, 0) / cap.horas::numeric, 2) end
  from cap
  left join uso on uso.recurso_id = cap.id
  order by cap.agrupador, cap.nome;
$$;

-- ── RF-73 · mapa de calor: dia × faixa horária ──────────────────────────────
create or replace function mapa_calor_ocupacao(
  p_tipo   tipo_recurso,
  p_inicio timestamptz,
  p_fim    timestamptz
) returns table (dia_semana int, hora int, atendimentos int, horas numeric)
language sql stable as $$
  select
    extract(dow from a.inicio at time zone tz_clinica())::int,
    extract(hour from a.inicio at time zone tz_clinica())::int,
    count(*)::int,
    round(sum(extract(epoch from (a.fim - a.inicio)) / 3600.0)::numeric, 2)
  from reserva r
  join agendamento a on a.id = r.agendamento_id
  where r.recurso_tipo = p_tipo
    and r.ativo
    and a.status <> 'cancelado'
    and a.inicio >= p_inicio and a.inicio < p_fim
  group by 1, 2
  order by 1, 2;
$$;

-- ── RF-91 · janelas vagas, ordenadas por tamanho ────────────────────────────
-- Insumo direto para ação comercial: onde exatamente há capacidade livre.
create or replace function janelas_vagas(
  p_tipo   tipo_recurso,
  p_id     uuid,
  p_inicio timestamptz,
  p_fim    timestamptz,
  p_min_minutos int default 30
) returns table (inicio timestamptz, fim timestamptz, minutos int)
language sql stable as $$
  with util as (
    select unnest(janela_util_multirange(p_tipo, p_id, p_inicio, p_fim)) as r
  ),
  ocupado as (
    select coalesce(range_agg(res.periodo), '{}'::tstzmultirange) as m
    from reserva res
    join agendamento a on a.id = res.agendamento_id
    where res.recurso_tipo = p_tipo and res.recurso_id = p_id and res.ativo
      and a.status <> 'cancelado'
      and res.periodo && tstzrange(p_inicio, p_fim, '[)')
  ),
  vagas as (
    select unnest(
      coalesce((select range_agg(r) from util), '{}'::tstzmultirange)
      - (select m from ocupado)
    ) as r
  )
  select lower(r), upper(r),
         (extract(epoch from (upper(r) - lower(r))) / 60)::int
  from vagas
  where extract(epoch from (upper(r) - lower(r))) / 60 >= p_min_minutos
  order by (upper(r) - lower(r)) desc, lower(r);
$$;

-- ── RF-96 · rentabilidade por procedimento ──────────────────────────────────
create or replace function rentabilidade_procedimentos(
  p_inicio timestamptz,
  p_fim    timestamptz
) returns table (
  procedimento_id uuid,
  nome            text,
  sessoes         int,
  horas           numeric,
  receita         numeric,
  custo_direto    numeric,
  comissao        numeric,
  margem          numeric,
  margem_pct      numeric,
  margem_por_hora numeric
) language sql stable as $$
  with realizados as (
    select a.id, a.procedimento_id,
           extract(epoch from (a.fim - a.inicio)) / 3600.0 as h,
           receita_sessao(a.id) as r,
           custo_direto_sessao(a.id) as c,
           coalesce((select sum(valor) from comissao where agendamento_id = a.id), 0) as k
    from agendamento a
    where a.status = 'realizado'
      and a.inicio >= p_inicio and a.inicio < p_fim
  )
  select
    p.id, p.nome,
    count(rz.id)::int,
    round(coalesce(sum(rz.h), 0)::numeric, 2),
    round(coalesce(sum(rz.r), 0), 2),
    round(coalesce(sum(rz.c), 0), 2),
    round(coalesce(sum(rz.k), 0), 2),
    round(coalesce(sum(rz.r - rz.c - rz.k), 0), 2),
    case when coalesce(sum(rz.r), 0) > 0
         then round(sum(rz.r - rz.c - rz.k) / sum(rz.r), 4) end,
    case when coalesce(sum(rz.h), 0) > 0
         then round((sum(rz.r - rz.c - rz.k) / sum(rz.h))::numeric, 2) end
  from procedimento p
  left join realizados rz on rz.procedimento_id = p.id
  where p.ativo
  group by p.id, p.nome
  order by 9 desc nulls last;
$$;

-- ── RF-95 · passivo de entrega ──────────────────────────────────────────────
-- Sessões vendidas e não executadas. Em clínica que vende pacote, o dinheiro
-- entra antes do serviço sair: sem este número o caixa parece melhor que o
-- resultado. Cada pacote de 8 sessões de 30 min compromete 4 horas de agenda.
create or replace function passivo_entrega()
returns table (
  procedimento_id uuid,
  nome            text,
  pacotes         int,
  sessoes_devidas int,
  horas_devidas   numeric,
  valor_devido    numeric
) language sql stable as $$
  with saldo as (
    select
      pc.id, pc.procedimento_id, pc.quantidade_sessoes,
      (pc.valor_total - pc.desconto) / pc.quantidade_sessoes as por_sessao,
      pc.quantidade_sessoes - coalesce((
        select count(*) from agendamento a
        where a.pacote_id = pc.id and a.status <> 'cancelado'
      ), 0) as restantes
    from pacote pc
    where pc.status = 'ativo'
  )
  select
    p.id, p.nome,
    count(*)::int,
    sum(s.restantes)::int,
    round((sum(s.restantes) * (p.duracao_min + p.buffer_min) / 60.0)::numeric, 2),
    round(sum(s.restantes * s.por_sessao), 2)
  from saldo s
  join procedimento p on p.id = s.procedimento_id
  where s.restantes > 0
  group by p.id, p.nome, p.duracao_min, p.buffer_min
  order by 6 desc;
$$;

-- ── RF-99 · DRE simplificado ────────────────────────────────────────────────
create or replace function dre_competencia(p_competencia text)
returns table (
  receita_realizada numeric,
  custos_diretos    numeric,
  comissoes         numeric,
  margem_contrib    numeric,
  despesas_fixas    numeric,
  resultado         numeric,
  custo_hora_estr   numeric
) language sql stable as $$
  with periodo as (
    select timezone(tz_clinica(), (p_competencia || '-01')::timestamp) as ini,
           timezone(tz_clinica(), ((p_competencia || '-01')::date
             + interval '1 month')::timestamp) as fim
  ),
  sessoes as (
    select
      coalesce(sum(receita_sessao(a.id)), 0) as r,
      coalesce(sum(custo_direto_sessao(a.id)), 0) as c
    from agendamento a, periodo p
    where a.status = 'realizado' and a.inicio >= p.ini and a.inicio < p.fim
  ),
  com as (
    select coalesce(sum(valor), 0) as k from comissao where competencia = p_competencia
  ),
  des as (
    select coalesce(sum(valor), 0) as d from despesa_fixa where competencia = p_competencia
  )
  select
    round(s.r, 2), round(s.c, 2), round(com.k, 2),
    round(s.r - s.c - com.k, 2),
    round(des.d, 2),
    round(s.r - s.c - com.k - des.d, 2),
    custo_hora_estrutura(p_competencia)
  from sessoes s, com, des;
$$;

-- ── RF-78 · alerta de gargalo ───────────────────────────────────────────────
-- Modelo de equipamento que atende mais de um procedimento e está acima do
-- limiar. É o número que justifica (ou não) comprar o segundo aparelho.
create or replace function gargalos_equipamento(
  p_inicio timestamptz,
  p_fim    timestamptz,
  p_limiar numeric default 0.75
) returns table (
  modelo        text,
  unidades      int,
  procedimentos int,
  taxa_media    numeric,
  horas_livres  numeric
) language sql stable as $$
  with por_modelo as (
    select e.modelo, count(*)::int as unidades, array_agg(e.id) as ids
    from equipamento e where e.ativo group by e.modelo
  ),
  usos as (
    select pm.modelo,
           avg(po.taxa_agendada) as taxa,
           sum(po.capacidade_h - po.agendadas_h) as livres
    from por_modelo pm
    join lateral (
      select * from painel_ocupacao('equipamento', p_inicio, p_fim) x
      where x.recurso_id = any (pm.ids)
    ) po on true
    group by pm.modelo
  ),
  procs as (
    select pr.modelo, count(distinct pr.procedimento_id)::int as n
    from procedimento_requisito pr
    where pr.recurso_tipo = 'equipamento' and pr.modelo is not null
    group by pr.modelo
  )
  select pm.modelo, pm.unidades, coalesce(pc.n, 0),
         round(coalesce(u.taxa, 0), 4), round(coalesce(u.livres, 0), 2)
  from por_modelo pm
  left join usos u on u.modelo = pm.modelo
  left join procs pc on pc.modelo = pm.modelo
  where coalesce(pc.n, 0) > 1 and coalesce(u.taxa, 0) >= p_limiar
  order by u.taxa desc;
$$;
