-- 0043 · Nome de quem vendeu, sem abrir a tabela de usuários
--
-- A agenda mostra "vendido por Fulana" (comercial ou upsell). A recepção não
-- lê a tabela usuario (e-mail e perfil da equipe ficam com admin e gestão);
-- esta função devolve só id e nome, e só para quem está logado.

create function nomes_da_equipe(p_ids uuid[])
returns table (id uuid, nome text)
language sql stable security definer set search_path = public as $$
  select u.id, u.nome from usuario u
   where u.id = any(p_ids) and auth.uid() is not null
$$;

revoke execute on function nomes_da_equipe(uuid[]) from public, anon;
grant execute on function nomes_da_equipe(uuid[]) to authenticated;
