-- 0034 · Editar o atendimento inteiro
--
-- Até aqui só dava para remarcar (horário, ou trocar um recurso arrastando).
-- Trocar procedimento, duração, sala, aparelhos, profissionais ou observações
-- exigia cancelar e agendar de novo, perdendo o histórico do atendimento.
--
-- Tudo muda na MESMA transação e as reservas são reconstruídas uma vez, no
-- fim (como em criar_agendamento): validar no meio checaria uma mistura do
-- estado antigo com o novo e acusaria conflito que o resultado não tem.
--
-- SECURITY INVOKER: valem as políticas de quem edita. O profissional, que só
-- muda status (0023), não encontra a linha e a função recusa.
--
-- Atendimento finalizado (realizado, falta, cancelado) não se edita: já gerou
-- cobrança, comissão ou baixa de pacote. Volta-se o status antes.

create function editar_agendamento(
  p_agendamento   uuid,
  p_procedimento  uuid,
  p_inicio        timestamptz,
  p_sala          uuid,
  p_equipamentos  uuid[] default '{}',
  p_profissionais uuid[] default '{}',
  p_observacoes   text default null,
  p_valor_avulso  numeric default null,
  p_duracao       integer default null
) returns void language plpgsql security invoker as $$
declare
  v_ag     agendamento%rowtype;
  v_regiao uuid;
  v_prot   record;
begin
  select * into v_ag from agendamento where id = p_agendamento for update;
  if not found then
    raise exception 'Sem permissão para editar este atendimento' using errcode = '42501';
  end if;
  if v_ag.status in ('realizado', 'falta', 'cancelado') then
    raise exception 'Atendimento com status % não pode ser editado. Volte o status antes.',
      v_ag.status using errcode = '23514';
  end if;

  -- Sessão de pacote é do procedimento do pacote: trocar mudaria o que foi vendido.
  if v_ag.pacote_id is not null and p_procedimento is distinct from
     (select procedimento_id from pacote where id = v_ag.pacote_id) then
    raise exception 'Esta é uma sessão de pacote: o procedimento é o do pacote'
      using errcode = '23514';
  end if;

  select regiao_id into v_regiao from agendamento_regiao where agendamento_id = p_agendamento limit 1;
  select * into v_prot from protocolo_efetivo(p_procedimento, v_regiao);
  if not found then
    raise exception 'Procedimento inexistente' using errcode = '23503';
  end if;
  if p_duracao is not null and p_duracao <= 0 then
    raise exception 'Duração deve ser maior que zero' using errcode = '23514';
  end if;

  perform set_config('app.suspender_reservas', 'on', true);

  update agendamento
     set procedimento_id = p_procedimento,
         sala_id         = p_sala,
         inicio          = p_inicio,
         fim             = p_inicio + make_interval(
                             mins => coalesce(p_duracao, v_prot.duracao_min) + v_prot.buffer_min),
         observacoes     = p_observacoes,
         valor_avulso    = case when v_ag.pacote_id is null then p_valor_avulso end
   where id = p_agendamento;

  -- Recria as junções: o trigger de habilitação (0029) revalida cada profissional
  -- contra o procedimento novo.
  delete from agendamento_equipamento where agendamento_id = p_agendamento;
  insert into agendamento_equipamento (agendamento_id, equipamento_id)
  select p_agendamento, unnest(p_equipamentos);

  delete from agendamento_profissional where agendamento_id = p_agendamento;
  insert into agendamento_profissional (agendamento_id, profissional_id)
  select p_agendamento, unnest(p_profissionais);

  perform set_config('app.suspender_reservas', 'off', true);
  perform rebuild_reservas(p_agendamento);
end $$;

revoke execute on function editar_agendamento(uuid, uuid, timestamptz, uuid, uuid[], uuid[], text, numeric, integer) from public, anon;
grant execute on function editar_agendamento(uuid, uuid, timestamptz, uuid, uuid[], uuid[], text, numeric, integer) to authenticated;

-- Ao editar, o próprio atendimento ainda ocupa os recursos antigos: sem
-- ignorá-lo, o detalhe do conflito diria "reservado para a própria paciente".
drop function if exists detalhar_conflito(timestamptz, timestamptz, uuid, uuid[], uuid[]);

create function detalhar_conflito(
  p_inicio        timestamptz,
  p_fim           timestamptz,
  p_sala          uuid,
  p_equipamentos  uuid[] default '{}',
  p_profissionais uuid[] default '{}',
  p_ignorar       uuid default null
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
    and r.periodo && tstzrange(p_inicio, p_fim, '[)')
    and (p_ignorar is null or r.agendamento_id <> p_ignorar);
$$;

revoke execute on function detalhar_conflito(timestamptz, timestamptz, uuid, uuid[], uuid[], uuid) from public, anon;
grant execute on function detalhar_conflito(timestamptz, timestamptz, uuid, uuid[], uuid[], uuid) to authenticated;
