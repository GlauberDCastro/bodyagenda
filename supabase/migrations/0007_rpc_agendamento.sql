-- 0007 · RPC transacional de agendamento
-- SPEC §6.1 · RF-42, RF-46, RF-48, RF-63
--
-- Criar o agendamento e depois inserir equipamentos e profissionais em chamadas
-- separadas do Next.js deixaria janela para um agendamento existir sem seus
-- recursos, caso a segunda chamada falhasse. Tudo numa função, uma transação.

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
      raise exception 'Pacote não está ativo (status: %)', v_pacote.status
        using errcode = '23514';
    end if;
    if v_pacote.validade is not null and v_pacote.validade < current_date then
      raise exception 'Pacote vencido em %', v_pacote.validade using errcode = '23514';
    end if;

    select count(*) into v_usadas
      from agendamento
     where pacote_id = p_pacote and status <> 'cancelado';

    if v_usadas >= v_pacote.quantidade_sessoes then
      raise exception 'Pacote sem saldo: % de % sessões já utilizadas',
        v_usadas, v_pacote.quantidade_sessoes using errcode = '23514';
    end if;
    v_numero := v_usadas + 1;
  end if;

  insert into agendamento (paciente_id, procedimento_id, pacote_id, sala_id,
                           inicio, fim, numero_sessao, valor_avulso,
                           observacoes, criado_por)
  values (p_paciente, p_procedimento, p_pacote, p_sala,
          p_inicio, v_fim, v_numero, p_valor_avulso,
          p_observacoes, auth.uid())
  returning id into v_agendamento;

  -- Os triggers de reserva disparam a cada insert aqui; a constraint de
  -- exclusão rejeita o primeiro recurso em conflito e aborta a transação
  -- inteira (RN-01).
  insert into agendamento_equipamento (agendamento_id, equipamento_id)
  select v_agendamento, unnest(p_equipamentos);

  insert into agendamento_profissional (agendamento_id, profissional_id)
  select v_agendamento, unnest(p_profissionais);

  return v_agendamento;
end $$;

-- Traduz um 23P01 em texto legível para a recepção (SPEC §6.2).
-- Chamada pela aplicação depois que o insert falhou, para descobrir quem colidiu.
create or replace function detalhar_conflito(
  p_inicio        timestamptz,
  p_fim           timestamptz,
  p_sala          uuid,
  p_equipamentos  uuid[] default '{}',
  p_profissionais uuid[] default '{}'
) returns table (
  recurso_tipo  tipo_recurso,
  recurso_nome  text,
  conflito_com  text,
  inicio        timestamptz,
  fim           timestamptz
) language sql stable as $$
  with alvo as (
    select 'sala'::tipo_recurso as t, p_sala as id
    union all select 'equipamento'::tipo_recurso, unnest(p_equipamentos)
    union all select 'profissional'::tipo_recurso, unnest(p_profissionais)
  )
  select
    r.recurso_tipo,
    case r.recurso_tipo
      when 'sala'         then (select 'Sala ' || s.numero || ' — ' || s.nome
                                  from sala s where s.id = r.recurso_id)
      when 'equipamento'  then (select e.nome from equipamento e where e.id = r.recurso_id)
      when 'profissional' then (select pr.nome from profissional pr where pr.id = r.recurso_id)
    end,
    pac.nome,
    lower(r.periodo),
    upper(r.periodo)
  from reserva r
  join alvo on alvo.t = r.recurso_tipo and alvo.id = r.recurso_id
  join agendamento a on a.id = r.agendamento_id
  join paciente pac  on pac.id = a.paciente_id
  where r.ativo
    and r.periodo && tstzrange(p_inicio, p_fim, '[)');
$$;

-- RF-48 · horários em que TODOS os recursos exigidos estão livres ao mesmo tempo.
-- Varre a janela em passos de p_passo_min e devolve os inícios viáveis.
create or replace function horarios_livres(
  p_procedimento  uuid,
  p_de            timestamptz,
  p_ate           timestamptz,
  p_sala          uuid   default null,
  p_equipamentos  uuid[] default '{}',
  p_profissionais uuid[] default '{}',
  p_passo_min     int    default 15
) returns table (inicio timestamptz, fim timestamptz)
language sql stable as $$
  with proc as (
    select duracao_min + buffer_min as total from procedimento where id = p_procedimento
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
