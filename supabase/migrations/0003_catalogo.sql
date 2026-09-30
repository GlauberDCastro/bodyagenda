-- 0003 · Catálogo de procedimentos e tabela de custos
-- SPEC §3.4 · RF-30 a RF-35
-- Vem antes de `sala` porque sala.procedimento_fixo_id referencia procedimento.

create table procedimento (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  descricao          text,
  duracao_min        int  not null check (duracao_min > 0),
  -- A-09: tempo de preparo/limpeza entre pacientes. Nasce em 0 e é preenchido
  -- pela clínica. A agenda reserva duracao_min + buffer_min; o cálculo de
  -- receita por hora usa apenas duracao_min.
  buffer_min         int  not null default 0 check (buffer_min >= 0),
  sessoes_padrao     int  not null default 1 check (sessoes_padrao > 0),
  valor_sessao       numeric(12,2) not null check (valor_sessao >= 0),
  intervalo_min_dias int  not null default 0 check (intervalo_min_dias >= 0),
  ativo              boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger procedimento_updated_at before update on procedimento
  for each row execute function set_updated_at();

create table procedimento_custo (
  id              uuid primary key default gen_random_uuid(),
  procedimento_id uuid not null references procedimento(id) on delete cascade,
  tipo            tipo_custo not null,
  descricao       text not null,
  valor_unitario  numeric(12,2) not null check (valor_unitario >= 0),
  quantidade      numeric(10,3) not null default 1 check (quantidade > 0)
);
create index on procedimento_custo (procedimento_id);

-- Quais recursos o procedimento exige. `recurso_id` amarra a uma unidade
-- específica; `modelo` aceita qualquer unidade daquele modelo — é o que faz
-- "Ultraformer Olhos exige um Ultraformer qualquer" funcionar e permite ao
-- sistema achar sozinho qual das 4 unidades está livre (RF-48).
create table procedimento_requisito (
  id              uuid primary key default gen_random_uuid(),
  procedimento_id uuid not null references procedimento(id) on delete cascade,
  recurso_tipo    tipo_recurso not null,
  recurso_id      uuid,
  modelo          text,
  quantidade      int not null default 1 check (quantidade > 0),
  obrigatorio     boolean not null default true,
  constraint requisito_precisa_de_alvo
    check (recurso_id is not null or modelo is not null)
);
create index on procedimento_requisito (procedimento_id);

-- RF-32 · custo direto por sessão, somando a tabela de custos
create or replace function custo_direto_procedimento(p_procedimento uuid)
returns numeric language sql stable as $$
  select coalesce(sum(valor_unitario * quantidade), 0)
  from procedimento_custo where procedimento_id = p_procedimento
$$;
