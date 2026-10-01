-- 0027 · Remarcar trocando equipamento ou profissional (arraste entre colunas)
--
-- Na visão por equipamentos ou por profissionais, arrastar o atendimento para
-- outra coluna troca AQUELE recurso pelo da coluna de destino — a coluna de
-- origem diz qual dos recursos do atendimento está sendo trocado.
--
-- Horário e recurso mudam na MESMA transação: se o novo horário conflita, a
-- troca de recurso também é desfeita, e vice-versa. As reservas são
-- reconstruídas UMA vez, no fim (como em criar_agendamento, 0009): validar no
-- meio do caminho checaria o recurso antigo no horário novo e acusaria
-- conflito que o resultado final não tem.
--
-- SECURITY INVOKER: valem as mesmas políticas de quem arrasta. Se o RLS
-- esconder a linha (perfil sem permissão), nenhum update acontece e a função
-- recusa em vez de devolver sucesso silencioso.

create or replace function remarcar_trocando_recurso(
  p_agendamento uuid,
  p_inicio      timestamptz,
  p_tipo        tipo_recurso,
  p_de          uuid,
  p_para        uuid
) returns void language plpgsql security invoker as $$
declare
  v_procedimento uuid;
  v_linhas       int;
begin
  if p_tipo = 'sala' then
    raise exception 'Use remarcar com nova sala para trocar de sala' using errcode = '22023';
  end if;

  perform set_config('app.suspender_reservas', 'on', true);

  update agendamento
     set inicio = p_inicio,
         fim    = p_inicio + (fim - inicio)
   where id = p_agendamento
  returning procedimento_id into v_procedimento;
  if not found then
    raise exception 'Sem permissão para remarcar este atendimento' using errcode = '42501';
  end if;

  if p_tipo = 'equipamento' then
    -- Outra unidade do mesmo modelo: trocar de modelo mudaria o procedimento.
    if (select modelo from equipamento where id = p_de)
       is distinct from (select modelo from equipamento where id = p_para) then
      raise exception 'Troque por outra unidade do mesmo modelo de aparelho'
        using errcode = '23514';
    end if;
    if exists (select 1 from agendamento_equipamento
                where agendamento_id = p_agendamento and equipamento_id = p_para) then
      raise exception 'Este aparelho já está neste atendimento' using errcode = '23514';
    end if;
    update agendamento_equipamento set equipamento_id = p_para
     where agendamento_id = p_agendamento and equipamento_id = p_de;

  else
    -- RF-23a: só quem está habilitado no procedimento pode atender.
    if not exists (select 1 from profissional_habilitacao
                    where profissional_id = p_para and procedimento_id = v_procedimento) then
      raise exception 'Este profissional não está habilitado para o procedimento'
        using errcode = '23514';
    end if;
    if exists (select 1 from agendamento_profissional
                where agendamento_id = p_agendamento and profissional_id = p_para) then
      raise exception 'Este profissional já está neste atendimento' using errcode = '23514';
    end if;
    update agendamento_profissional set profissional_id = p_para
     where agendamento_id = p_agendamento and profissional_id = p_de;
  end if;

  get diagnostics v_linhas = row_count;
  if v_linhas = 0 then
    raise exception 'Sem permissão para trocar o recurso deste atendimento' using errcode = '42501';
  end if;

  perform set_config('app.suspender_reservas', 'off', true);
  perform rebuild_reservas(p_agendamento);
end $$;

revoke execute on function remarcar_trocando_recurso(uuid, timestamptz, tipo_recurso, uuid, uuid)
  from public, anon;
grant execute on function remarcar_trocando_recurso(uuid, timestamptz, tipo_recurso, uuid, uuid)
  to authenticated;
