-- 0004 · Recursos: salas, equipamentos, profissionais, disponibilidade e bloqueios
-- SPEC §3.2 e §3.3 · RF-19 a RF-27

create table sala (
  id                   uuid primary key default gen_random_uuid(),
  numero               int  not null unique,
  nome                 text not null,
  descricao            text,
  tipo_alocacao        alocacao_sala not null default 'flexivel',
  procedimento_fixo_id uuid references procedimento(id),
  vigencia_inicio      date not null default current_date,
  vigencia_fim         date,
  ativo                boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint sala_dedicada_exige_procedimento
    check (tipo_alocacao <> 'dedicada' or procedimento_fixo_id is not null),
  constraint sala_vigencia_coerente
    check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);
create trigger sala_updated_at before update on sala
  for each row execute function set_updated_at();

create table equipamento (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,            -- "Ultraformer #3"
  modelo          text not null,            -- "Ultraformer MPT"  ← agregação do RF-21c
  numero_serie    text,
  tipo_alocacao   alocacao_equipamento not null default 'movel',
  sala_id         uuid references sala(id),
  custo_aquisicao numeric(12,2),
  vigencia_inicio date not null default current_date,
  vigencia_fim    date,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint equip_fixo_exige_sala
    check (tipo_alocacao <> 'fixo' or sala_id is not null),
  constraint equip_movel_sem_sala
    check (tipo_alocacao <> 'movel' or sala_id is null),
  constraint equip_vigencia_coerente
    check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);
create index on equipamento (modelo);
create trigger equipamento_updated_at before update on equipamento
  for each row execute function set_updated_at();

create table profissional (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid unique references usuario(id),   -- opcional: pode não ter login
  nome            text not null,
  cpf             text unique,
  especialidade   text,
  cor_agenda      text not null default '#64748b',
  vigencia_inicio date not null default current_date,
  vigencia_fim    date,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint prof_vigencia_coerente
    check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);
create trigger profissional_updated_at before update on profissional
  for each row execute function set_updated_at();

-- RF-23a · quem pode executar o quê
create table profissional_habilitacao (
  profissional_id uuid not null references profissional(id) on delete cascade,
  procedimento_id uuid not null references procedimento(id) on delete cascade,
  primary key (profissional_id, procedimento_id)
);

-- ── Custos em tabelas próprias ────────────────────────────────────────────────
-- [refinamento vs. PRD §5.2] O RLS do Postgres é row-level, não column-level.
-- Com custo_hora dentro de equipamento/profissional, esconder o valor da
-- recepção (RF-88) exigiria view SECURITY DEFINER ou filtro na aplicação — e
-- proteção feita na aplicação é exatamente o que o princípio P2 rejeita.
-- Em tabela separada, uma política RLS de uma linha resolve. SPEC §3.2.
create table equipamento_custo (
  equipamento_id uuid primary key references equipamento(id) on delete cascade,
  custo_hora     numeric(12,2) not null default 0 check (custo_hora >= 0)
);

create table profissional_remuneracao (
  profissional_id uuid primary key references profissional(id) on delete cascade,
  custo_hora      numeric(12,2) not null default 0 check (custo_hora >= 0),
  comissao_tipo   tipo_comissao not null default 'nenhuma',
  comissao_valor  numeric(12,2) not null default 0 check (comissao_valor >= 0)
);

-- ── Disponibilidade e bloqueios ──────────────────────────────────────────────
-- recurso_id é polimórfico e não tem FK: é o preço de tratar os três tipos de
-- recurso uniformemente (PRD §5.1). A integridade vem do trigger abaixo e do
-- fato de que recursos nunca são deletados fisicamente (princípio P5).

create table recurso_disponibilidade (
  id           uuid primary key default gen_random_uuid(),
  recurso_tipo tipo_recurso not null,
  recurso_id   uuid not null,
  dia_semana   smallint not null check (dia_semana between 0 and 6),  -- 0 = domingo
  hora_inicio  time not null,
  hora_fim     time not null,
  constraint disp_faixa_valida check (hora_fim > hora_inicio)
);
create index on recurso_disponibilidade (recurso_tipo, recurso_id, dia_semana);

create table recurso_bloqueio (
  id           uuid primary key default gen_random_uuid(),
  recurso_tipo tipo_recurso not null,
  recurso_id   uuid not null,
  inicio       timestamptz not null,
  fim          timestamptz not null,
  motivo       motivo_bloqueio not null default 'outro',
  observacao   text,
  periodo      tstzrange generated always as (tstzrange(inicio, fim, '[)')) stored,
  constraint bloqueio_periodo_valido check (fim > inicio)
);
create index on recurso_bloqueio using gist (recurso_tipo, recurso_id, periodo);

-- Garante que recurso_id aponta para um recurso existente do tipo declarado.
create or replace function validar_recurso_existe() returns trigger
language plpgsql as $$
declare v_ok boolean;
begin
  select case new.recurso_tipo
    when 'sala'         then exists (select 1 from sala         where id = new.recurso_id)
    when 'equipamento'  then exists (select 1 from equipamento  where id = new.recurso_id)
    when 'profissional' then exists (select 1 from profissional where id = new.recurso_id)
  end into v_ok;

  if not coalesce(v_ok, false) then
    raise exception 'Recurso % do tipo % não existe', new.recurso_id, new.recurso_tipo
      using errcode = '23503';
  end if;
  return new;
end $$;

create trigger disp_valida_recurso before insert or update on recurso_disponibilidade
  for each row execute function validar_recurso_existe();
create trigger bloqueio_valida_recurso before insert or update on recurso_bloqueio
  for each row execute function validar_recurso_existe();

-- ── Vigência (RN-10) ─────────────────────────────────────────────────────────
-- Fonte única da janela de vigência dos três tipos de recurso. É o que impede
-- que cadastrar um aparelho hoje altere a ocupação do mês passado.
create or replace function recurso_vigencia(p_tipo tipo_recurso, p_id uuid)
returns table (vi date, vf date) language sql stable as $$
  select coalesce(vigencia_inicio, '-infinity'::date),
         coalesce(vigencia_fim,     'infinity'::date)
    from sala where p_tipo = 'sala' and id = p_id
  union all
  select coalesce(vigencia_inicio, '-infinity'::date),
         coalesce(vigencia_fim,     'infinity'::date)
    from equipamento where p_tipo = 'equipamento' and id = p_id
  union all
  select coalesce(vigencia_inicio, '-infinity'::date),
         coalesce(vigencia_fim,     'infinity'::date)
    from profissional where p_tipo = 'profissional' and id = p_id
$$;
