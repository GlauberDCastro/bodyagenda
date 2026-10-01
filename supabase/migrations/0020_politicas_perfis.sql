-- 0020 · Políticas dos perfis novos
--
-- MATRIZ (SPEC §5.2, ampliada)
--
--   admin       tudo, inclusive gerenciar usuários
--   gestao      lê tudo e configura o catálogo; NÃO gerencia usuários nem exclui
--   financeiro  financeiro e relatórios completos; não mexe em agenda
--   recepcao    agenda, pacientes, recebimentos; não vê custo nem margem
--   profissional própria agenda e própria comissão
--
-- Gestão e financeiro existem separados de propósito: quem analisa ocupação
-- não precisa ver inadimplência de paciente, e quem fecha o caixa não precisa
-- remarcar agendamento. Um perfil só obrigaria a dar mais acesso do que o
-- trabalho exige.

create or replace function e_gestao() returns boolean
language sql stable as $$ select perfil_atual() in ('admin', 'gestao') $$;

create or replace function ve_financeiro() returns boolean
language sql stable as $$ select perfil_atual() in ('admin', 'gestao', 'financeiro') $$;

-- ── Gestão: configura o catálogo e os recursos ──────────────────────────────
create policy sala_gestao            on sala                  for all using (e_gestao()) with check (e_gestao());
create policy equip_gestao           on equipamento           for all using (e_gestao()) with check (e_gestao());
create policy prof_gestao            on profissional          for all using (e_gestao()) with check (e_gestao());
create policy hab_gestao             on profissional_habilitacao for all using (e_gestao()) with check (e_gestao());
create policy proc_gestao            on procedimento          for all using (e_gestao()) with check (e_gestao());
create policy proc_custo_gestao      on procedimento_custo    for all using (e_gestao()) with check (e_gestao());
create policy proc_req_gestao        on procedimento_requisito for all using (e_gestao()) with check (e_gestao());
create policy regiao_gestao          on regiao                for all using (e_gestao()) with check (e_gestao());
create policy proc_regiao_gestao     on procedimento_regiao   for all using (e_gestao()) with check (e_gestao());
create policy disp_gestao            on recurso_disponibilidade for all using (e_gestao()) with check (e_gestao());
create policy bloqueio_gestao        on recurso_bloqueio      for all using (e_gestao()) with check (e_gestao());
create policy equip_custo_gestao     on equipamento_custo     for all using (e_gestao()) with check (e_gestao());
create policy remun_gestao           on profissional_remuneracao for all using (e_gestao()) with check (e_gestao());

-- Gestão lê agenda e pacientes, mas não opera: remarcar é da recepção.
create policy paciente_gestao_leitura    on paciente     for select using (e_gestao());
create policy pacote_gestao_leitura      on pacote       for select using (e_gestao());
create policy agendamento_gestao_leitura on agendamento  for select using (e_gestao());

-- ── Financeiro ──────────────────────────────────────────────────────────────
create policy lancamento_financeiro on lancamento   for all using (ve_financeiro()) with check (ve_financeiro());
create policy comissao_financeiro   on comissao     for all using (ve_financeiro()) with check (ve_financeiro());
create policy despesa_financeiro    on despesa_fixa for all using (ve_financeiro()) with check (ve_financeiro());

-- Para apurar receita e margem, o financeiro precisa enxergar o que foi
-- realizado e a quanto foi vendido.
create policy agendamento_fin_leitura on agendamento          for select using (ve_financeiro());
create policy pacote_fin_leitura      on pacote               for select using (ve_financeiro());
create policy paciente_fin_leitura    on paciente             for select using (ve_financeiro());
create policy proc_fin_leitura        on procedimento         for select using (ve_financeiro());
create policy proc_custo_fin_leitura  on procedimento_custo   for select using (ve_financeiro());
create policy equip_custo_fin_leitura on equipamento_custo    for select using (ve_financeiro());
create policy remun_fin_leitura       on profissional_remuneracao for select using (ve_financeiro());

-- ── Usuários: só o admin ────────────────────────────────────────────────────
-- Gestão configura a clínica, mas não concede acesso a si mesma nem a
-- terceiros. Separar isso é o que impede escalonamento de privilégio.
create policy usuario_gestao_leitura on usuario for select using (e_gestao());
