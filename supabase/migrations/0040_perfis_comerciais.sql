-- 0040 · Perfis do time comercial: SDR (qualificação) e Closer (vendas)
--
-- Só os valores novos do enum: o Postgres não deixa usar um valor de enum
-- na mesma transação em que ele foi criado, e cada migração é uma transação.
-- As permissões vêm na 0041.

alter type perfil_usuario add value if not exists 'sdr';
alter type perfil_usuario add value if not exists 'closer';
