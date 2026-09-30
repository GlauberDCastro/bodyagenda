-- 0005 · Janelas de disponibilidade e capacidade
-- SPEC §4.1 · RN-02, RN-10
--
-- Estas duas funções são a fonte única de "quando este recurso pode ser usado".
-- São consumidas tanto pelo cálculo de ocupação quanto pela validação de
-- agendamento (0006), para que as duas nunca possam divergir.

-- Multirange das janelas de atendimento do recurso dentro do período,
-- já recortado pela vigência (RN-10).
create or replace function disponibilidade_multirange(
  p_tipo   tipo_recurso,
  p_id     uuid,
  p_inicio timestamptz,
  p_fim    timestamptz
) returns tstzmultirange language sql stable as $$
  with vig as (
    select vi, vf from recurso_vigencia(p_tipo, p_id)
  ),
  dias as (
    -- um dia a mais de folga em cada ponta: uma janela que cruza a meia-noite
    -- em horário local precisa do dia vizinho para ser montada corretamente
    select generate_series(
             (p_inicio at time zone tz_clinica())::date - 1,
             (p_fim    at time zone tz_clinica())::date + 1,
             interval '1 day')::date as dia
  ),
  janelas as (
    select tstzrange(
             timezone(tz_clinica(), d.dia + a.hora_inicio),
             timezone(tz_clinica(), d.dia + a.hora_fim),
             '[)') as r
    from dias d
    join recurso_disponibilidade a
      on  a.recurso_tipo = p_tipo
      and a.recurso_id   = p_id
      and a.dia_semana   = extract(dow from d.dia)::smallint
    cross join vig
    where d.dia >= vig.vi and d.dia <= vig.vf
  ),
  recortadas as (
    select r * tstzrange(p_inicio, p_fim, '[)') as r from janelas
  )
  select coalesce(range_agg(r), '{}'::tstzmultirange)
  from recortadas where not isempty(r);
$$;

-- Multirange dos bloqueios (manutenção, férias, folga) no período.
create or replace function bloqueio_multirange(
  p_tipo   tipo_recurso,
  p_id     uuid,
  p_inicio timestamptz,
  p_fim    timestamptz
) returns tstzmultirange language sql stable as $$
  select coalesce(range_agg(periodo * tstzrange(p_inicio, p_fim, '[)')),
                  '{}'::tstzmultirange)
  from recurso_bloqueio
  where recurso_tipo = p_tipo
    and recurso_id   = p_id
    and periodo && tstzrange(p_inicio, p_fim, '[)')
    and not isempty(periodo * tstzrange(p_inicio, p_fim, '[)'));
$$;

-- Janela efetivamente utilizável: disponibilidade menos bloqueios.
-- A subtração de multirange resolve de uma vez bloqueios sobrepostos e
-- parcialmente fora da janela, sem laço nem condicional.
create or replace function janela_util_multirange(
  p_tipo   tipo_recurso,
  p_id     uuid,
  p_inicio timestamptz,
  p_fim    timestamptz
) returns tstzmultirange language sql stable as $$
  select disponibilidade_multirange(p_tipo, p_id, p_inicio, p_fim)
       - bloqueio_multirange(p_tipo, p_id, p_inicio, p_fim);
$$;

-- RN-02 · capacidade do recurso no período.
-- Bloqueio fora da janela de atendimento não subtrai nada: não se perde
-- capacidade que não existia.
create or replace function capacidade_recurso(
  p_tipo   tipo_recurso,
  p_id     uuid,
  p_inicio timestamptz,
  p_fim    timestamptz
) returns interval language sql stable as $$
  select coalesce(
    (select sum(upper(x) - lower(x))
     from unnest(janela_util_multirange(p_tipo, p_id, p_inicio, p_fim)) as x),
    interval '0');
$$;
