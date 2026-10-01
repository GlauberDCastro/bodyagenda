-- 0019 · Perfis de gestão e financeiro
--
-- Só o ALTER TYPE: o Postgres não permite USAR um valor de enum na mesma
-- transação em que ele é criado. As políticas que os consomem vão na 0020.

alter type perfil_usuario add value if not exists 'gestao';
alter type perfil_usuario add value if not exists 'financeiro';
