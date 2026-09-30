-- 0002 · Usuário, perfis e auditoria
-- SPEC §5.1 · RF-01 a RF-06

create table usuario (
  id            uuid primary key references auth.users(id) on delete restrict,
  nome          text not null,
  email         text not null unique,
  perfil        perfil_usuario not null default 'recepcao',
  ativo         boolean not null default true,
  ultimo_acesso timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger usuario_updated_at before update on usuario
  for each row execute function set_updated_at();

-- Perfil do usuário autenticado.
-- SECURITY DEFINER porque é chamada de dentro das próprias políticas RLS de
-- `usuario`; sem isso a política se consultaria recursivamente.
create or replace function perfil_atual() returns perfil_usuario
language sql stable security definer set search_path = public, auth as $$
  select u.perfil from usuario u where u.id = auth.uid() and u.ativo
$$;

create or replace function profissional_atual() returns uuid
language sql stable security definer set search_path = public, auth as $$
  select p.id from profissional p where p.usuario_id = auth.uid() and p.ativo
$$;

create or replace function e_admin() returns boolean
language sql stable as $$ select perfil_atual() = 'admin' $$;

-- RF-06 / RNF-10 · trilha de auditoria
create table auditoria (
  id              bigserial primary key,
  usuario_id      uuid references usuario(id),
  entidade        text not null,
  entidade_id     uuid,
  acao            text not null check (acao in ('criar','editar','excluir')),
  dados_anteriores jsonb,
  dados_novos      jsonb,
  created_at      timestamptz not null default now()
);
create index on auditoria (entidade, entidade_id, created_at desc);

create or replace function registrar_auditoria() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  insert into auditoria (usuario_id, entidade, entidade_id, acao,
                         dados_anteriores, dados_novos)
  values (
    auth.uid(),
    tg_table_name,
    coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid),
    case tg_op when 'INSERT' then 'criar' when 'UPDATE' then 'editar' else 'excluir' end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;
