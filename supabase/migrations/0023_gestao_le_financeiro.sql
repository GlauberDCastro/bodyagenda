-- 0023 · Gestão só LÊ o financeiro; profissional só muda o status
--
-- Duas folgas que a auditoria de RLS (M8.1) mostrou contra a matriz da 0020:
--
-- 1. ve_financeiro() inclui gestão, e as políticas de lancamento, comissao e
--    despesa_fixa usavam essa função em `for all`. Gestão herdava ESCRITA no
--    caixa, quando a matriz diz que ela lê tudo e configura o catálogo.
--    Quem fecha o caixa é o financeiro.
--
-- 2. agendamento_proprio_status deixa o profissional atualizar o próprio
--    agendamento para marcar o status, mas política RLS não restringe coluna:
--    ele conseguia mudar valor, horário, sala ou paciente. Um trigger fecha
--    isso, já que a mesma linha precisa continuar atualizável no status.

-- ── 1. Financeiro: escrita para admin e financeiro; leitura também para gestão
create or replace function opera_financeiro() returns boolean
language sql stable as $$ select perfil_atual() in ('admin', 'financeiro') $$;

drop policy lancamento_financeiro on lancamento;
drop policy comissao_financeiro   on comissao;
drop policy despesa_financeiro    on despesa_fixa;

create policy lancamento_financeiro on lancamento   for all using (opera_financeiro()) with check (opera_financeiro());
create policy comissao_financeiro   on comissao     for all using (opera_financeiro()) with check (opera_financeiro());
create policy despesa_financeiro    on despesa_fixa for all using (opera_financeiro()) with check (opera_financeiro());

create policy lancamento_gestao_leitura on lancamento   for select using (e_gestao());
create policy comissao_gestao_leitura   on comissao     for select using (e_gestao());
create policy despesa_gestao_leitura    on despesa_fixa for select using (e_gestao());

-- ── 2. Profissional altera só status (e o motivo, ao cancelar) ───────────────
create or replace function trg_profissional_so_status() returns trigger
language plpgsql as $$
begin
  if perfil_atual() = 'profissional'
     and to_jsonb(new) - array['status', 'motivo_cancelamento', 'updated_at']
      <> to_jsonb(old) - array['status', 'motivo_cancelamento', 'updated_at'] then
    raise exception 'Profissional so pode alterar o status do atendimento'
      using errcode = '42501';
  end if;
  return new;
end $$;

create trigger agendamento_profissional_so_status
  before update on agendamento
  for each row execute function trg_profissional_so_status();
