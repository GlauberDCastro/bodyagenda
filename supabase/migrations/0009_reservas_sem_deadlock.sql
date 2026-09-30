-- 0009 · Elimina deadlock na criação concorrente de agendamento
--
-- SINTOMA
-- O teste de concorrência (CA-13) passou a alternar entre `23P01`
-- (exclusion_violation, o correto) e `deadlock detected` entre execuções.
-- Nenhuma reserva duplicada foi criada em momento algum — a garantia
-- anti-duplo-booking sempre valeu. O que quebrou foi a QUALIDADE do erro: a
-- recepção via "deadlock detected" em vez de "o Ultraformer #2 já está
-- reservado das 14:00 às 14:20 para Maria Silva".
--
-- CAUSA
-- criar_agendamento() faz três inserts: agendamento, agendamento_equipamento
-- e agendamento_profissional. Cada um dispara rebuild_reservas(), que APAGA
-- todas as reservas do agendamento e as recria.
--
-- O `delete` libera a trava de predicado da sala no meio da transação. Uma
-- transação concorrente que estava esperando por aquela linha é acordada e a
-- toma. Quando a primeira reinsere a sala e segue para o equipamento, encontra
-- a linha da segunda — e a segunda está esperando a sala da primeira. Ciclo
-- fechado, deadlock.
--
-- CORREÇÃO (duas partes, ambas necessárias)
--
-- 1. Suspender os triggers durante criar_agendamento() e reconstruir UMA vez,
--    ao final, quando equipamentos e profissionais já estão todos gravados.
--    Sem o delete/reinsert no meio, a trava nunca é solta.
--
-- 2. Inserir as reservas em ordem determinística (recurso_tipo, recurso_id).
--    Com todas as transações adquirindo travas na mesma sequência, o ciclo de
--    espera deixa de ser possível — é a prevenção clássica de deadlock.

-- ── 1. Ordem determinística ─────────────────────────────────────────────────
create or replace function rebuild_reservas(p_agendamento uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v record;
begin
  delete from reserva where agendamento_id = p_agendamento;

  select a.*, (a.status <> 'cancelado') as vigente
    into v
    from agendamento a
   where a.id = p_agendamento;

  if not found then return; end if;

  insert into reserva (agendamento_id, recurso_tipo, recurso_id, periodo, ativo)
  select p_agendamento, r.tipo, r.id, tstzrange(v.inicio, v.fim, '[)'), v.vigente
  from (
    select 'sala'::tipo_recurso as tipo, v.sala_id as id
    union all
    select 'equipamento'::tipo_recurso, ae.equipamento_id
      from agendamento_equipamento ae where ae.agendamento_id = p_agendamento
    union all
    select 'profissional'::tipo_recurso, ap.profissional_id
      from agendamento_profissional ap where ap.agendamento_id = p_agendamento
  ) r
  -- A ordenação é o que previne o deadlock: toda transação adquire as travas
  -- de predicado na mesma sequência.
  order by r.tipo, r.id;
end $$;

-- ── 2. Suspensão dos triggers durante a criação ─────────────────────────────
-- Flag local à transação (o `true` em set_config), então não vaza entre
-- conexões do pool nem sobrevive a um rollback.
create or replace function reservas_suspensas() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.suspender_reservas', true), 'off') = 'on'
$$;

create or replace function trg_rebuild_reservas() returns trigger
language plpgsql as $$
begin
  if reservas_suspensas() then return null; end if;
  perform rebuild_reservas(coalesce(new.agendamento_id, old.agendamento_id));
  return null;
end $$;

create or replace function trg_rebuild_reservas_agendamento() returns trigger
language plpgsql as $$
begin
  if reservas_suspensas() then return null; end if;
  perform rebuild_reservas(new.id);
  return null;
end $$;

-- ── 3. criar_agendamento monta as reservas uma única vez ────────────────────
create or replace function criar_agendamento(
  p_paciente        uuid,
  p_procedimento    uuid,
  p_inicio          timestamptz,
  p_sala            uuid,
  p_equipamentos    uuid[]  default '{}',
  p_profissionais   uuid[]  default '{}',
  p_pacote          uuid    default null,
  p_observacoes     text    default null,
  p_valor_avulso    numeric default null
) returns uuid language plpgsql security invoker as $$
declare
  v_proc        procedimento%rowtype;
  v_fim         timestamptz;
  v_agendamento uuid;
  v_usadas      int;
  v_pacote      pacote%rowtype;
  v_numero      int;
begin
  select * into v_proc from procedimento where id = p_procedimento and ativo;
  if not found then
    raise exception 'Procedimento inexistente ou inativo' using errcode = '23503';
  end if;

  -- A agenda reserva duração + buffer de preparo (A-09).
  v_fim := p_inicio + make_interval(mins => v_proc.duracao_min + v_proc.buffer_min);

  -- RF-63 · pacote precisa estar ativo e com saldo
  if p_pacote is not null then
    select * into v_pacote from pacote where id = p_pacote for update;
    if not found then
      raise exception 'Pacote inexistente' using errcode = '23503';
    end if;
    if v_pacote.status <> 'ativo' then
      raise exception 'Pacote nao esta ativo (status: %)', v_pacote.status
        using errcode = '23514';
    end if;
    if v_pacote.validade is not null and v_pacote.validade < current_date then
      raise exception 'Pacote vencido em %', v_pacote.validade using errcode = '23514';
    end if;

    select count(*) into v_usadas
      from agendamento
     where pacote_id = p_pacote and status <> 'cancelado';

    if v_usadas >= v_pacote.quantidade_sessoes then
      raise exception 'Pacote sem saldo: % de % sessoes ja utilizadas',
        v_usadas, v_pacote.quantidade_sessoes using errcode = '23514';
    end if;
    v_numero := v_usadas + 1;
  end if;

  -- Suspende os triggers: sem isto cada insert abaixo apagaria e recriaria as
  -- reservas, soltando a trava de predicado no meio do caminho.
  perform set_config('app.suspender_reservas', 'on', true);

  insert into agendamento (paciente_id, procedimento_id, pacote_id, sala_id,
                           inicio, fim, numero_sessao, valor_avulso,
                           observacoes, criado_por)
  values (p_paciente, p_procedimento, p_pacote, p_sala,
          p_inicio, v_fim, v_numero, p_valor_avulso,
          p_observacoes, auth.uid())
  returning id into v_agendamento;

  insert into agendamento_equipamento (agendamento_id, equipamento_id)
  select v_agendamento, unnest(p_equipamentos);

  insert into agendamento_profissional (agendamento_id, profissional_id)
  select v_agendamento, unnest(p_profissionais);

  perform set_config('app.suspender_reservas', 'off', true);

  -- Agora sim, uma única construção, com o conjunto completo de recursos e em
  -- ordem determinística. É aqui que a constraint de exclusão rejeita conflito.
  perform rebuild_reservas(v_agendamento);

  return v_agendamento;
end $$;
