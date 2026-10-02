-- 0037 · Convite para o profissional criar o próprio acesso
--
-- O admin gera um link por profissional; o profissional abre, cria a senha e
-- completa os dados pessoais. Só entra quem foi convidado: não existe página
-- pública de cadastro.
--
-- O link carrega um token aleatório de 256 bits. O banco guarda só o hash
-- SHA-256: quem lê a tabela (ou um backup) não consegue montar o link.
-- Vale 7 dias e uma vez só; gerar outro revoga o anterior.
--
-- RLS: só o admin vê e cria convites. A aceitação acontece no servidor com a
-- service_role, depois de validar o token — o visitante ainda não tem sessão.

alter table profissional
  add column telefone          text,
  add column data_nascimento   date,
  add column registro_conselho text;

create table convite_profissional (
  id              uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references profissional(id) on delete cascade,
  token_hash      text not null unique,
  criado_por      uuid references usuario(id) default auth.uid(),
  criado_em       timestamptz not null default now(),
  expira_em       timestamptz not null default now() + interval '7 days',
  usado_em        timestamptz,
  revogado_em     timestamptz,
  usuario_id      uuid references usuario(id)
);
create index on convite_profissional (profissional_id);

alter table convite_profissional enable row level security;

create policy convite_admin on convite_profissional for all
  using (perfil_atual() = 'admin') with check (perfil_atual() = 'admin');

create trigger convite_profissional_auditoria
  after insert or update or delete on convite_profissional
  for each row execute function registrar_auditoria();
