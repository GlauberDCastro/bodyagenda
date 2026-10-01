-- 0031 · Auditoria ligada (RF-06)
--
-- registrar_auditoria() existia desde a 0002, mas nenhuma tabela a chamava:
-- a tabela `auditoria` estava vazia. Agora toda criação, edição e exclusão nas
-- tabelas de cadastro e movimento grava quem, quando, o antes e o depois.
--
-- Fora: `reserva` (derivada do agendamento, reconstruída a cada mudança) e as
-- tabelas de junção, cobertas pela auditoria do agendamento.
--
-- Mudança sem usuário autenticado (migração, manutenção pela conexão direta)
-- não é ato de ninguém da clínica e não entra no registro.

create or replace function registrar_auditoria() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare
  v_linha jsonb := to_jsonb(coalesce(new, old));
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  insert into auditoria (usuario_id, entidade, entidade_id, acao,
                         dados_anteriores, dados_novos)
  values (
    auth.uid(),
    tg_table_name,
    -- Tabelas 1:1 usam a chave do dono como identidade.
    coalesce(v_linha->>'id', v_linha->>'profissional_id', v_linha->>'equipamento_id')::uuid,
    case tg_op when 'INSERT' then 'criar' when 'UPDATE' then 'editar' else 'excluir' end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'paciente', 'pacote', 'agendamento', 'lancamento', 'comissao', 'despesa_fixa',
    'procedimento', 'procedimento_custo', 'procedimento_requisito', 'procedimento_regiao',
    'sala', 'equipamento', 'equipamento_custo', 'profissional', 'profissional_remuneracao',
    'recurso_disponibilidade', 'recurso_bloqueio', 'usuario'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on %I
         for each row execute function registrar_auditoria()',
      t || '_auditoria', t);
  end loop;
end $$;
