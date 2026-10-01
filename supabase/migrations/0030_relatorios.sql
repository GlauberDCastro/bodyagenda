-- 0030 · Relatórios que a auditoria do PRD apontou como parciais ou ausentes
--
--   RF-19d painel_ocupacao: recurso inativado continua no painel dos períodos
--          em que teve atendimento. Filtrar só por `ativo` apagava o histórico.
--   RF-95  passivo_entrega: só realizado (ou falta, RN-06) é sessão entregue.
--          Sessão apenas agendada ainda é dívida com o paciente.
--   RF-66  pacotes_pendentes(): a lista por paciente por trás do passivo.
--   RF-101 retorno_equipamentos(): receita e margem do aparelho no período,
--          contra o custo de aquisição.
--   RF-75  serie_ocupacao(): ocupação efetiva dia a dia, para comparar com o
--          período anterior.

-- ── RF-19d ──────────────────────────────────────────────────────────────────
create or replace function painel_ocupacao(p_tipo tipo_recurso, p_inicio timestamptz, p_fim timestamptz)
returns table (recurso_id uuid, nome text, agrupador text, capacidade_h numeric,
               agendadas_h numeric, realizadas_h numeric, taxa_agendada numeric,
               taxa_efetiva numeric, ociosidade_h numeric, atendimentos integer,
               faltas integer, receita numeric, receita_por_hora numeric)
language sql stable as $$
  with usados as (
    -- Recurso com reserva no período entra mesmo inativo hoje.
    select distinct r.recurso_id as id
      from reserva r
     where r.recurso_tipo = p_tipo and r.ativo
       and r.periodo && tstzrange(p_inicio, p_fim, '[)')
  ),
  recursos as (
    select s.id, 'Sala ' || s.numero || ' — ' || s.nome as nome, 'Salas' as agrupador
      from sala s
     where p_tipo = 'sala' and (s.ativo or s.id in (select id from usados))
    union all
    select e.id, e.nome, e.modelo from equipamento e
     where p_tipo = 'equipamento' and (e.ativo or e.id in (select id from usados))
    union all
    select pf.id, pf.nome, coalesce(pf.especialidade, 'Sem especialidade')
      from profissional pf
     where p_tipo = 'profissional' and (pf.ativo or pf.id in (select id from usados))
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
      coalesce(sum(case when a.pacote_id is not null
                        then round((pc.valor_total - pc.desconto) / pc.quantidade_sessoes, 2)
                        else coalesce(a.valor_avulso, 0) end)
               filter (where a.status = 'realizado'), 0) as receita
    from reserva r
    join agendamento a on a.id = r.agendamento_id
    left join pacote pc on pc.id = a.pacote_id
    cross join lateral (select r.periodo * tstzrange(p_inicio, p_fim, '[)') as p) x
    where r.recurso_tipo = p_tipo and r.ativo
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
    case when cap.horas > 0 then round(coalesce(uso.receita, 0) / cap.horas::numeric, 2) end
  from cap
  left join uso on uso.recurso_id = cap.id
  order by cap.agrupador, cap.nome;
$$;

-- ── RF-95 ───────────────────────────────────────────────────────────────────
create or replace function passivo_entrega()
returns table (procedimento_id uuid, nome text, pacotes integer, sessoes_devidas integer,
               horas_devidas numeric, valor_devido numeric)
language sql stable as $$
  with saldo as (
    select
      pc.id, pc.procedimento_id,
      (pc.valor_total - pc.desconto) / pc.quantidade_sessoes as por_sessao,
      pc.quantidade_sessoes - coalesce((
        select count(*) from agendamento a
         where a.pacote_id = pc.id and a.status in ('realizado', 'falta')
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

-- ── RF-66 ───────────────────────────────────────────────────────────────────
create or replace function pacotes_pendentes()
returns table (pacote_id uuid, paciente_id uuid, paciente text, procedimento text,
               sessoes integer, realizadas integer, agendadas integer, pendentes integer,
               valor_devido numeric, validade date)
language sql stable security invoker as $$
  select pc.id, pa.id, pa.nome, p.nome, pc.quantidade_sessoes,
         count(*) filter (where a.status in ('realizado', 'falta'))::int,
         count(*) filter (where a.status in ('agendado', 'confirmado', 'em_atendimento'))::int,
         (pc.quantidade_sessoes
            - count(*) filter (where a.status in ('realizado', 'falta')))::int,
         round((pc.quantidade_sessoes
            - count(*) filter (where a.status in ('realizado', 'falta')))
            * (pc.valor_total - pc.desconto) / pc.quantidade_sessoes, 2),
         pc.validade
    from pacote pc
    join paciente pa on pa.id = pc.paciente_id
    join procedimento p on p.id = pc.procedimento_id
    left join agendamento a on a.pacote_id = pc.id
   where pc.status = 'ativo'
   group by pc.id, pa.id, pa.nome, p.nome
  having pc.quantidade_sessoes - count(*) filter (where a.status in ('realizado', 'falta')) > 0
   order by pc.validade nulls last, pa.nome
$$;

-- ── RF-101 ──────────────────────────────────────────────────────────────────
-- Sessão com dois aparelhos divide a receita entre eles: somar a receita
-- inteira em cada um contaria o mesmo dinheiro duas vezes.
create or replace function retorno_equipamentos(p_inicio timestamptz, p_fim timestamptz)
returns table (equipamento_id uuid, nome text, modelo text, sessoes integer, horas numeric,
               receita numeric, custo_uso numeric, margem numeric, custo_aquisicao numeric,
               pct_aquisicao numeric)
language sql stable security invoker as $$
  with sessoes as (
    select s.sessao_id, s.horas, s.receita,
           (select count(*) from agendamento_equipamento x where x.agendamento_id = s.sessao_id) as n
      from sessoes_realizadas(p_inicio, p_fim) s
  ),
  por_equip as (
    select ae.equipamento_id,
           count(*)::int as sessoes,
           sum(s.horas) as horas,
           sum(s.receita / nullif(s.n, 0)) as receita
      from sessoes s
      join agendamento_equipamento ae on ae.agendamento_id = s.sessao_id
     group by ae.equipamento_id
  )
  select e.id, e.nome, e.modelo,
         coalesce(pe.sessoes, 0),
         round(coalesce(pe.horas, 0)::numeric, 2),
         round(coalesce(pe.receita, 0), 2),
         round(coalesce(pe.horas, 0) * coalesce(ec.custo_hora, 0), 2),
         round(coalesce(pe.receita, 0) - coalesce(pe.horas, 0) * coalesce(ec.custo_hora, 0), 2),
         e.custo_aquisicao,
         case when coalesce(e.custo_aquisicao, 0) > 0
              then round(coalesce(pe.receita, 0) / e.custo_aquisicao, 4) end
    from equipamento e
    left join por_equip pe on pe.equipamento_id = e.id
    left join equipamento_custo ec on ec.equipamento_id = e.id
   where e.ativo or pe.equipamento_id is not null
   order by 6 desc
$$;

-- ── RF-75 ───────────────────────────────────────────────────────────────────
create or replace function serie_ocupacao(p_tipo tipo_recurso, p_inicio date, p_fim date)
returns table (dia date, capacidade_h numeric, realizadas_h numeric)
language sql stable security invoker as $$
  with dias as (
    select d::date as dia,
           timezone(tz_clinica(), d::timestamp) as ini,
           timezone(tz_clinica(), (d + interval '1 day')::timestamp) as fim
      from generate_series(p_inicio, p_fim, interval '1 day') d
  ),
  recursos as (
    select id from sala where p_tipo = 'sala' and ativo
    union all select id from equipamento where p_tipo = 'equipamento' and ativo
    union all select id from profissional where p_tipo = 'profissional' and ativo
  )
  select d.dia,
         round(coalesce((
           select sum(extract(epoch from capacidade_recurso(p_tipo, r.id, d.ini, d.fim)))
             from recursos r), 0) / 3600.0, 2),
         round(coalesce((
           select sum(extract(epoch from (upper(x) - lower(x))))
             from reserva rs
             join agendamento a on a.id = rs.agendamento_id and a.status = 'realizado'
             cross join lateral (select rs.periodo * tstzrange(d.ini, d.fim, '[)') as x) y
            where rs.recurso_tipo = p_tipo and rs.ativo
              and rs.periodo && tstzrange(d.ini, d.fim, '[)')), 0) / 3600.0, 2)
    from dias d
   order by d.dia
$$;

revoke execute on function pacotes_pendentes() from public, anon;
revoke execute on function retorno_equipamentos(timestamptz, timestamptz) from public, anon;
revoke execute on function serie_ocupacao(tipo_recurso, date, date) from public, anon;
grant execute on function pacotes_pendentes() to authenticated;
grant execute on function retorno_equipamentos(timestamptz, timestamptz) to authenticated;
grant execute on function serie_ocupacao(tipo_recurso, date, date) to authenticated;
