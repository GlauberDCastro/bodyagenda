-- 0006 · Paciente, pacote, agendamento e o motor de reserva
-- SPEC §3.5 · RNF-05, RN-01, RN-03 · CA-01 a CA-09, CA-13

create table paciente (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  cpf                text unique,
  data_nascimento    date,
  telefone           text,
  email              text,
  endereco           text,
  observacoes        text,
  consentimento_lgpd boolean not null default false,
  consentimento_em   timestamptz,
  ativo              boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on paciente using gin (to_tsvector('portuguese', nome));
create index on paciente (cpf);
create index on paciente (telefone);
create trigger paciente_updated_at before update on paciente
  for each row execute function set_updated_at();

create table pacote (
  id                 uuid primary key default gen_random_uuid(),
  paciente_id        uuid not null references paciente(id),
  procedimento_id    uuid not null references procedimento(id),
  quantidade_sessoes int not null check (quantidade_sessoes > 0),
  valor_total        numeric(12,2) not null check (valor_total >= 0),
  desconto           numeric(12,2) not null default 0 check (desconto >= 0),
  status             status_pacote not null default 'ativo',
  data_venda         date not null default current_date,
  validade           date,
  vendido_por        uuid references usuario(id),
  created_at         timestamptz not null default now()
);
create index on pacote (paciente_id, status);

create table agendamento (
  id              uuid primary key default gen_random_uuid(),
  paciente_id     uuid not null references paciente(id),
  procedimento_id uuid not null references procedimento(id),
  pacote_id       uuid references pacote(id),        -- null = sessão avulsa
  sala_id         uuid not null references sala(id),
  inicio          timestamptz not null,
  fim             timestamptz not null,
  status          status_agendamento not null default 'agendado',
  numero_sessao   int,
  valor_avulso    numeric(12,2),                     -- usado quando pacote_id is null
  observacoes     text,
  motivo_cancelamento text,
  criado_por      uuid references usuario(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint agendamento_periodo_valido check (fim > inicio)
);
create index on agendamento (inicio);
create index on agendamento (paciente_id);
create index on agendamento (pacote_id);
create trigger agendamento_updated_at before update on agendamento
  for each row execute function set_updated_at();

create table agendamento_equipamento (
  agendamento_id uuid not null references agendamento(id) on delete cascade,
  equipamento_id uuid not null references equipamento(id),
  primary key (agendamento_id, equipamento_id)
);

create table agendamento_profissional (
  agendamento_id  uuid not null references agendamento(id) on delete cascade,
  profissional_id uuid not null references profissional(id),
  papel           text,
  primary key (agendamento_id, profissional_id)
);

-- ══ reserva ══════════════════════════════════════════════════════════════════
-- Tabela DERIVADA. Nunca escrita pela aplicação: mantida pelos triggers abaixo.
--
-- Uma única constraint cobre sala, equipamento E profissional. O EXCLUDE USING
-- gist adquire lock de predicado: duas transações concorrentes disputando o
-- mesmo recurso no mesmo horário fazem a segunda receber 23P01. É isso que
-- cumpre o RNF-05 — nenhuma validação em JavaScript consegue essa garantia.
--
-- `where (ativo)` faz o cancelamento liberar o horário (RN-03) sem apagar
-- registro (princípio P5). Agendamento com status 'falta' mantém ativo = true:
-- o horário foi consumido de fato, e é essa diferença que faz a ocupação
-- agendada divergir da efetiva no painel.
create table reserva (
  id             uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references agendamento(id) on delete cascade,
  recurso_tipo   tipo_recurso not null,
  recurso_id     uuid not null,
  periodo        tstzrange not null,
  ativo          boolean not null default true,

  constraint reserva_sem_conflito
    exclude using gist (
      recurso_tipo with =,
      recurso_id   with =,
      periodo      with &&
    ) where (ativo)
);
create index on reserva (agendamento_id);
create index on reserva using gist (recurso_tipo, recurso_id, periodo) where ativo;

-- Valida a reserva contra a janela de atendimento e os bloqueios do recurso
-- (RF-47). Não cabe na constraint de exclusão porque compara contra regra
-- semanal, não contra outra reserva.
create or replace function validar_janela_reserva() returns trigger
language plpgsql as $$
declare v_util tstzmultirange;
begin
  if not new.ativo then return new; end if;

  v_util := janela_util_multirange(
              new.recurso_tipo, new.recurso_id,
              lower(new.periodo), upper(new.periodo));

  if v_util = '{}'::tstzmultirange then
    raise exception
      'Recurso % (%) não tem disponibilidade cadastrada neste período',
      new.recurso_id, new.recurso_tipo
      using errcode = '23514';
  end if;

  if not (new.periodo <@ v_util) then
    raise exception
      'Recurso % (%) está fora da janela de atendimento ou sobre um bloqueio',
      new.recurso_id, new.recurso_tipo
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger reserva_valida_janela before insert or update on reserva
  for each row execute function validar_janela_reserva();

-- Reconstrói as reservas de um agendamento a partir do estado atual.
-- Idempotente: apaga e recria. Como o delete ocorre antes do insert na mesma
-- transação, remarcar um agendamento não conflita consigo mesmo.
create or replace function rebuild_reservas(p_agendamento uuid)
returns void language plpgsql as $$
declare v record;
begin
  delete from reserva where agendamento_id = p_agendamento;

  select a.*, (a.status <> 'cancelado') as vigente
    into v
    from agendamento a
   where a.id = p_agendamento;

  if not found then return; end if;

  insert into reserva (agendamento_id, recurso_tipo, recurso_id, periodo, ativo)
  select p_agendamento, 'sala'::tipo_recurso, v.sala_id,
         tstzrange(v.inicio, v.fim, '[)'), v.vigente
  union all
  select p_agendamento, 'equipamento'::tipo_recurso, ae.equipamento_id,
         tstzrange(v.inicio, v.fim, '[)'), v.vigente
    from agendamento_equipamento ae where ae.agendamento_id = p_agendamento
  union all
  select p_agendamento, 'profissional'::tipo_recurso, ap.profissional_id,
         tstzrange(v.inicio, v.fim, '[)'), v.vigente
    from agendamento_profissional ap where ap.agendamento_id = p_agendamento;
end $$;

create or replace function trg_rebuild_reservas() returns trigger
language plpgsql as $$
begin
  perform rebuild_reservas(coalesce(new.agendamento_id, old.agendamento_id));
  return null;
end $$;

create or replace function trg_rebuild_reservas_agendamento() returns trigger
language plpgsql as $$
begin
  perform rebuild_reservas(new.id);
  return null;
end $$;

create trigger agendamento_reservas
  after insert on agendamento
  for each row execute function trg_rebuild_reservas_agendamento();

create trigger agendamento_reservas_upd
  after update of inicio, fim, sala_id, status on agendamento
  for each row
  when (old.inicio   is distinct from new.inicio
     or old.fim      is distinct from new.fim
     or old.sala_id  is distinct from new.sala_id
     or old.status   is distinct from new.status)
  execute function trg_rebuild_reservas_agendamento();

create trigger agendamento_equip_reservas
  after insert or delete on agendamento_equipamento
  for each row execute function trg_rebuild_reservas();

create trigger agendamento_prof_reservas
  after insert or delete on agendamento_profissional
  for each row execute function trg_rebuild_reservas();

-- ══ RN-03 · ocupação ═════════════════════════════════════════════════════════
create or replace function ocupacao_recurso(
  p_tipo   tipo_recurso,
  p_id     uuid,
  p_inicio timestamptz,
  p_fim    timestamptz
) returns table (
  capacidade    interval,
  agendadas     interval,
  realizadas    interval,
  taxa_agendada numeric,
  taxa_efetiva  numeric
) language sql stable as $$
  with cap as (
    select capacidade_recurso(p_tipo, p_id, p_inicio, p_fim) as c
  ),
  uso as (
    select
      coalesce(sum(upper(x.p) - lower(x.p))
               filter (where a.status <> 'cancelado'), interval '0') as ag,
      coalesce(sum(upper(x.p) - lower(x.p))
               filter (where a.status =  'realizado'), interval '0') as re
    from reserva r
    join agendamento a on a.id = r.agendamento_id
    cross join lateral (
      select r.periodo * tstzrange(p_inicio, p_fim, '[)') as p
    ) x
    where r.recurso_tipo = p_tipo
      and r.recurso_id   = p_id
      and r.ativo
      and not isempty(x.p)
  )
  select
    cap.c, uso.ag, uso.re,
    case when cap.c > interval '0'
         then round((extract(epoch from uso.ag) / extract(epoch from cap.c))::numeric, 4)
    end,
    case when cap.c > interval '0'
         then round((extract(epoch from uso.re) / extract(epoch from cap.c))::numeric, 4)
    end
  from cap, uso;
$$;
