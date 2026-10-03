-- 0039 · Dados da clínica editáveis no painel
--
-- O nome "Body Prime" estava escrito no código (topo do sistema, página do
-- convite, mensagens de WhatsApp). Passa a viver aqui, editável em
-- Configurações › Clínica, como o horário (0038).
--
-- Tabela de uma linha só: `unica` é sempre true e é unique, então um segundo
-- insert falha. Todos os perfis leem; só admin e gestão alteram.

create table clinica (
  id         uuid primary key default gen_random_uuid(),
  unica      boolean not null default true unique check (unica),
  nome       text not null check (length(trim(nome)) > 0),
  updated_at timestamptz not null default now()
);

create trigger clinica_updated_at before update on clinica
  for each row execute function set_updated_at();
create trigger clinica_auditoria after insert or update or delete on clinica
  for each row execute function registrar_auditoria();

alter table clinica enable row level security;
create policy clinica_leitura on clinica for select using (auth.uid() is not null);
create policy clinica_edicao  on clinica for update using (e_gestao()) with check (e_gestao());

insert into clinica (nome) values ('Body Prime');
