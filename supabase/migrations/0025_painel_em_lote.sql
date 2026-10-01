-- 0025 · Painel e relatórios em lote (M8.2, RNF-04)
--
-- Medido com 6 meses de agenda cheia (11,6 mil agendamentos, 8,1 mil
-- realizados) como admin autenticado:
--
--   rentabilidade_procedimentos  semestre 5,9 s · mês 1,1 s
--   painel_ocupacao (salas)      semestre 2,9 s · mês 0,7 s
--   dre_competencia              mês 1,1 s
--
-- Causa: receita_sessao() e custo_direto_sessao() chamadas UMA VEZ POR
-- SESSÃO, cada uma com suas subconsultas. E o painel lia todas as reservas
-- do tipo, de qualquer data, para só depois recortar o período — sem usar o
-- GiST.
--
-- As fórmulas não mudam (RN-04): sessoes_realizadas() faz o mesmo cálculo
-- das funções por sessão, só que em lote. receita_sessao, custo_direto_sessao
-- e margem_sessao continuam existindo para a consulta de uma sessão só.

create or replace function sessoes_realizadas(p_inicio timestamptz, p_fim timestamptz)
returns table (sessao_id uuid, procedimento_id uuid, horas numeric,
               receita numeric, custo numeric, comissao_total numeric)
language sql stable as $$
  with rz as (
    select a.id, a.procedimento_id,
           extract(epoch from (a.fim - a.inicio)) / 3600.0 as h,
           -- = receita_sessao()
           case when a.pacote_id is not null
                then round((pc.valor_total - pc.desconto) / pc.quantidade_sessoes, 2)
                else coalesce(a.valor_avulso, 0)
           end as r
      from agendamento a
      left join pacote pc on pc.id = a.pacote_id
     where a.status = 'realizado'
       and a.inicio >= p_inicio and a.inicio < p_fim
  ),
  insumo as (
    select pc.procedimento_id, sum(pc.valor_unitario * pc.quantidade) as v
      from procedimento_custo pc
     group by pc.procedimento_id
  ),
  equip as (
    select ae.agendamento_id, sum(ec.custo_hora) as custo_hora
      from rz
      join agendamento_equipamento ae on ae.agendamento_id = rz.id
      join equipamento_custo ec on ec.equipamento_id = ae.equipamento_id
     group by ae.agendamento_id
  ),
  prof as (
    select ap.agendamento_id, sum(pr.custo_hora) as custo_hora
      from rz
      join agendamento_profissional ap on ap.agendamento_id = rz.id
      join profissional_remuneracao pr on pr.profissional_id = ap.profissional_id
     group by ap.agendamento_id
  ),
  com as (
    select c.agendamento_id, sum(c.valor) as v
      from rz
      join comissao c on c.agendamento_id = rz.id
     group by c.agendamento_id
  )
  select
    rz.id, rz.procedimento_id, rz.h, rz.r,
    -- = custo_direto_sessao(): insumo + custo/hora de aparelhos e profissionais
    round(coalesce(i.v, 0)
          + coalesce(e.custo_hora, 0) * rz.h
          + coalesce(p.custo_hora, 0) * rz.h, 2),
    coalesce(k.v, 0)
  from rz
  left join insumo i on i.procedimento_id = rz.procedimento_id
  left join equip  e on e.agendamento_id  = rz.id
  left join prof   p on p.agendamento_id  = rz.id
  left join com    k on k.agendamento_id  = rz.id;
$$;

create or replace function rentabilidade_procedimentos(p_inicio timestamptz, p_fim timestamptz)
returns table (procedimento_id uuid, nome text, sessoes integer, horas numeric,
               receita numeric, custo_direto numeric, comissao numeric, margem numeric,
               margem_pct numeric, margem_por_hora numeric)
language sql stable as $$
  with realizados as (
    select s.sessao_id as id, s.procedimento_id, s.horas as h,
           s.receita as r, s.custo as c, s.comissao_total as k
      from sessoes_realizadas(p_inicio, p_fim) s
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

create or replace function dre_competencia(p_competencia text)
returns table (receita_realizada numeric, custos_diretos numeric, comissoes numeric,
               margem_contrib numeric, despesas_fixas numeric, resultado numeric,
               custo_hora_estr numeric)
language sql stable as $$
  with periodo as (
    select timezone(tz_clinica(), (p_competencia || '-01')::timestamp) as ini,
           timezone(tz_clinica(), ((p_competencia || '-01')::date
             + interval '1 month')::timestamp) as fim
  ),
  sessoes as (
    select coalesce(sum(s.receita), 0) as r,
           coalesce(sum(s.custo), 0) as c
      from periodo p, sessoes_realizadas(p.ini, p.fim) s
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

create or replace function painel_ocupacao(p_tipo tipo_recurso, p_inicio timestamptz, p_fim timestamptz)
returns table (recurso_id uuid, nome text, agrupador text, capacidade_h numeric,
               agendadas_h numeric, realizadas_h numeric, taxa_agendada numeric,
               taxa_efetiva numeric, ociosidade_h numeric, atendimentos integer,
               faltas integer, receita numeric, receita_por_hora numeric)
language sql stable as $$
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
      -- = receita_sessao(), sem uma consulta por linha
      coalesce(sum(case when a.pacote_id is not null
                        then round((pc.valor_total - pc.desconto) / pc.quantidade_sessoes, 2)
                        else coalesce(a.valor_avulso, 0) end)
               filter (where a.status = 'realizado'), 0) as receita
    from reserva r
    join agendamento a on a.id = r.agendamento_id
    left join pacote pc on pc.id = a.pacote_id
    cross join lateral (select r.periodo * tstzrange(p_inicio, p_fim, '[)') as p) x
    where r.recurso_tipo = p_tipo and r.ativo
      -- Sobreposição explícita: é o que deixa o GiST recortar o período.
      and r.periodo && tstzrange(p_inicio, p_fim, '[)')
      and not isempty(x.p)
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
