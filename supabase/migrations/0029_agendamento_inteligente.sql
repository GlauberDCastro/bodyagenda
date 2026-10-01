-- 0029 · Agendamento inteligente: duração ajustável e habilitação garantida
--
-- RF-43  criar_agendamento e horarios_livres ganham p_duracao (default null =
--        a duração do procedimento). Assinatura nova = função nova: as antigas
--        são REMOVIDAS antes, senão o PostgREST fica com duas candidatas e
--        recusa a chamada (PGRST203) — o bug que a 0021 corrigiu.
-- RF-23a o profissional precisa estar habilitado no procedimento. A tela já
--        filtra; o banco garante, inclusive para quem chama a API direto.

drop function if exists criar_agendamento(
  uuid, uuid, timestamptz, uuid, uuid[], uuid[], uuid, text, numeric, uuid, numeric
);
drop function if exists horarios_livres(uuid, timestamptz, timestamptz, uuid, uuid[], uuid[], integer);

create function criar_agendamento(p_paciente uuid, p_procedimento uuid, p_inicio timestamp with time zone, p_sala uuid, p_equipamentos uuid[] DEFAULT '{}'::uuid[], p_profissionais uuid[] DEFAULT '{}'::uuid[], p_pacote uuid DEFAULT NULL::uuid, p_observacoes text DEFAULT NULL::text, p_valor_avulso numeric DEFAULT NULL::numeric, p_regiao uuid DEFAULT NULL::uuid, p_quantidade numeric DEFAULT NULL::numeric, p_duracao integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
AS $$
declare
  v_prot        record;
  v_fim         timestamptz;
  v_agendamento uuid;
  v_usadas      int;
  v_pacote      pacote%rowtype;
  v_numero      int;
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
    if v_pacote.validade is not null and v_pacote.validade < current_date then
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
  end if;

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

  if p_regiao is not null then
    insert into agendamento_regiao (agendamento_id, regiao_id, quantidade, unidade)
    values (v_agendamento, p_regiao,
            coalesce(p_quantidade, v_prot.quantidade_padrao), v_prot.unidade);
  end if;

  perform set_config('app.suspender_reservas', 'off', true);
  perform rebuild_reservas(v_agendamento);

  return v_agendamento;
end $$;

create function horarios_livres(p_procedimento uuid, p_de timestamp with time zone, p_ate timestamp with time zone, p_sala uuid DEFAULT NULL::uuid, p_equipamentos uuid[] DEFAULT '{}'::uuid[], p_profissionais uuid[] DEFAULT '{}'::uuid[], p_passo_min integer DEFAULT 15, p_duracao integer DEFAULT NULL::integer)
 RETURNS TABLE(inicio timestamp with time zone, fim timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $$
  with proc as (
    select coalesce(p_duracao, duracao_min) + buffer_min as total from procedimento where id = p_procedimento
  ),
  candidatos as (
    select generate_series(p_de, p_ate, make_interval(mins => p_passo_min)) as ini
  ),
  janelas as (
    select c.ini, c.ini + make_interval(mins => (select total from proc)) as f
    from candidatos c
  ),
  recursos as (
    select 'sala'::tipo_recurso as t, p_sala as id where p_sala is not null
    union all select 'equipamento'::tipo_recurso, unnest(p_equipamentos)
    union all select 'profissional'::tipo_recurso, unnest(p_profissionais)
  )
  select j.ini, j.f
  from janelas j
  where j.f <= p_ate
    -- todo recurso exigido precisa ter a janela inteira disponível…
    and not exists (
      select 1 from recursos r
      where not (tstzrange(j.ini, j.f, '[)')
                 <@ janela_util_multirange(r.t, r.id, j.ini, j.f))
    )
    -- …e nenhum pode já estar reservado no período
    and not exists (
      select 1 from recursos r
      join reserva res
        on res.recurso_tipo = r.t and res.recurso_id = r.id and res.ativo
      where res.periodo && tstzrange(j.ini, j.f, '[)')
    )
  order by j.ini;
$$;

create or replace function trg_profissional_habilitado() returns trigger
language plpgsql as $$
begin
  if not exists (
    select 1
      from agendamento a
      join profissional_habilitacao h
        on h.procedimento_id = a.procedimento_id and h.profissional_id = new.profissional_id
     where a.id = new.agendamento_id
  ) then
    raise exception 'Profissional não habilitado para este procedimento'
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger agendamento_profissional_habilitado
  before insert or update of profissional_id on agendamento_profissional
  for each row execute function trg_profissional_habilitado();

revoke execute on function criar_agendamento(uuid, uuid, timestamptz, uuid, uuid[], uuid[], uuid, text, numeric, uuid, numeric, integer) from public, anon;
grant execute on function criar_agendamento(uuid, uuid, timestamptz, uuid, uuid[], uuid[], uuid, text, numeric, uuid, numeric, integer) to authenticated;
revoke execute on function horarios_livres(uuid, timestamptz, timestamptz, uuid, uuid[], uuid[], integer, integer) from public, anon;
grant execute on function horarios_livres(uuid, timestamptz, timestamptz, uuid, uuid[], uuid[], integer, integer) to authenticated;
