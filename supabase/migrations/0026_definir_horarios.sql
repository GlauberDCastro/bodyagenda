-- 0026 · Trocar o horário de vários recursos de uma vez
--
-- A aba "Horários e bloqueios" aplica o horário padrão da clínica a todas as
-- salas, aparelhos e profissionais, ou redefine o de um recurso só. Fazer isso
-- com delete + insert vindos do Next deixaria uma janela em que o recurso fica
-- SEM horário — e sem horário a agenda recusa tudo nele. Aqui é uma
-- transação só.
--
-- SECURITY INVOKER: quem não escreve em recurso_disponibilidade pelo RLS
-- (recepção, financeiro, profissional) recebe o mesmo 42501 de sempre.
--
-- p_recursos: [{"tipo": "sala", "id": "..."}, ...]
-- p_janelas:  [{"dia": 1, "inicio": "08:00", "fim": "18:00"}, ...]
--             dia segue extract(dow): 0 = domingo, 6 = sábado.

create or replace function definir_horarios(p_recursos jsonb, p_janelas jsonb)
returns integer language plpgsql security invoker as $$
declare
  v_qtd integer;
begin
  with alvo as (
    select (r->>'tipo')::tipo_recurso as tipo, (r->>'id')::uuid as id
      from jsonb_array_elements(p_recursos) r
  )
  delete from recurso_disponibilidade d
   using alvo
   where d.recurso_tipo = alvo.tipo and d.recurso_id = alvo.id;

  insert into recurso_disponibilidade (recurso_tipo, recurso_id, dia_semana, hora_inicio, hora_fim)
  select (r->>'tipo')::tipo_recurso, (r->>'id')::uuid,
         (j->>'dia')::smallint, (j->>'inicio')::time, (j->>'fim')::time
    from jsonb_array_elements(p_recursos) r
   cross join jsonb_array_elements(p_janelas) j;

  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;

revoke execute on function definir_horarios(jsonb, jsonb) from public, anon;
grant  execute on function definir_horarios(jsonb, jsonb) to authenticated;
