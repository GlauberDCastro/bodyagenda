-- 0001 · Extensões e tipos
-- SPEC §3.1

create extension if not exists "btree_gist";   -- operador = sobre enum/uuid dentro do EXCLUDE
create extension if not exists "pgcrypto";     -- gen_random_uuid()

create type perfil_usuario       as enum ('admin','recepcao','profissional');
create type tipo_recurso         as enum ('sala','equipamento','profissional');
create type alocacao_sala        as enum ('dedicada','flexivel');
create type alocacao_equipamento as enum ('fixo','movel');
create type status_agendamento   as enum ('agendado','confirmado','em_atendimento',
                                          'realizado','falta','cancelado');
create type status_pacote        as enum ('ativo','concluido','cancelado','expirado');
create type tipo_comissao        as enum ('percentual','valor_fixo','nenhuma');
create type status_comissao      as enum ('prevista','apurada','paga');
create type tipo_lancamento      as enum ('receita','despesa');
create type status_lancamento    as enum ('pendente','pago','atrasado','cancelado');
create type motivo_bloqueio      as enum ('manutencao','ferias','folga','outro');
create type tipo_custo           as enum ('insumo','mao_de_obra','equipamento','outro');

-- Fuso da operação. Toda conversão local↔UTC passa por aqui; o offset nunca é
-- escrito literalmente, para que uma eventual volta do horário de verão não
-- quebre a agenda (SPEC §6.4).
create or replace function tz_clinica() returns text
language sql immutable parallel safe as $$ select 'America/Sao_Paulo'::text $$;

-- Toque de updated_at, reaproveitado por todas as tabelas que o têm.
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
