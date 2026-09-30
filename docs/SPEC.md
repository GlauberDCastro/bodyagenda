# Especificação Técnica
### Painel de Gestão de Ocupação e Agenda — Body Prime

| | |
|---|---|
| **Versão** | 1.0 |
| **Data** | 30/09/2026 |
| **Deriva de** | [PRD v1.3](PRD.md) |
| **Alvo de deploy** | Vercel · time `LINKEED` · projeto `bodyprime-ocupacao` |

> Esta spec traduz o PRD em decisões técnicas executáveis. Onde ela refina o modelo do PRD, isso está marcado como **[refinamento]** com a justificativa.

---

## 1. Arquitetura

```
┌─────────────────────────────────────────────────────┐
│  Navegador (desktop / tablet da recepção)           │
└───────────────────────┬─────────────────────────────┘
                        │ HTTPS
┌───────────────────────▼─────────────────────────────┐
│  Vercel — região gru1 (São Paulo)                   │
│  Next.js 16 App Router                              │
│   · Server Components  → leitura                    │
│   · Server Actions     → escrita                    │
│   · proxy.ts           → sessão Supabase            │
└───────────────────────┬─────────────────────────────┘
                        │ Postgres wire / PostgREST
┌───────────────────────▼─────────────────────────────┐
│  Supabase — região sa-east-1 (São Paulo)            │
│   · Postgres 15+  ← RLS é a fronteira de segurança  │
│   · Auth (e-mail + senha)                           │
│   · Constraint EXCLUDE ← garantia anti-duplo-booking│
└─────────────────────────────────────────────────────┘
```

**Regiões:** Vercel `gru1` e Supabase `sa-east-1` ficam ambos em São Paulo. Escolher região errada aqui custa 150–200 ms por round-trip em cada query — o que inviabiliza o RNF-04 (painel em 2 s), já que o painel faz várias consultas agregadas.

### 1.1 Princípios não negociáveis

| # | Princípio | Por quê |
|---|---|---|
| P1 | **A garantia anti-conflito mora no banco**, não na aplicação | Duas recepcionistas salvando ao mesmo tempo passam por qualquer validação feita só em JavaScript (RNF-05) |
| P2 | **A autorização mora no RLS**, não na interface | Esconder um botão não protege dado nenhum (RNF-03) |
| P3 | **Nenhum número do parque no código** | 8 salas, 4 Ultraformer, 1 Fotona são cadastro (RF-19a/21b) |
| P4 | **Capacidade sempre a partir da vigência** | Cadastrar aparelho hoje não pode alterar a ocupação de ontem (RN-10) |
| P5 | **Nada é apagado fisicamente** | Inativação e cancelamento preservam o histórico financeiro (RNF-09) |

### 1.2 Stack

| Camada | Escolha | Observação |
|---|---|---|
| Framework | Next.js 16 (App Router) + TypeScript strict | Turbopack por padrão |
| UI | Tailwind CSS + shadcn/ui (Radix) | Componentes acessíveis sem dependência pesada |
| Banco / Auth | Supabase (Postgres 15+, Auth, RLS) | |
| Validação | Zod — mesmo schema no cliente e no Server Action | |
| Datas | `date-fns` + `date-fns-tz`, fuso `America/Sao_Paulo` | |
| Gráficos | Recharts | Painel de ocupação e séries temporais |
| Tabelas | TanStack Table | Relatórios com ordenação e exportação |
| Testes | Vitest (domínio) + Playwright (fluxos críticos) | |
| Migrações | Supabase CLI — `supabase/migrations/*.sql` versionadas no git | |

---

## 2. Estrutura do Repositório

```
bodyprime-ocupacao/
├─ app/
│  ├─ (auth)/login/page.tsx
│  ├─ (app)/
│  │  ├─ layout.tsx                    # shell + guarda de sessão
│  │  ├─ page.tsx                      # Painel de ocupação
│  │  ├─ agenda/page.tsx               # Timeline por recurso
│  │  ├─ pacientes/[...]
│  │  ├─ procedimentos/[...]
│  │  ├─ configuracoes/
│  │  │  ├─ salas/ equipamentos/ profissionais/ usuarios/
│  │  ├─ financeiro/
│  │  │  ├─ recebimentos/ comissoes/ despesas/
│  │  └─ relatorios/
│  │     ├─ ocupacao/ financeiro/
│  └─ api/                             # só webhooks e exportação de arquivo
├─ lib/
│  ├─ supabase/{server,client,proxy}.ts
│  ├─ domain/                          # ← lógica pura, sem I/O, 100% testável
│  │  ├─ conflito.ts
│  │  ├─ ocupacao.ts
│  │  ├─ margem.ts
│  │  └─ comissao.ts
│  ├─ actions/                         # Server Actions por agregado
│  └─ schemas/                         # Zod
├─ components/
├─ supabase/
│  ├─ migrations/
│  └─ seed.sql                         # carga inicial do Anexo A do PRD
├─ tests/
├─ vercel.json
└─ .env.example
```

**`lib/domain/` não importa Supabase, React ou Next.** Toda a matemática de ocupação, margem e comissão é função pura sobre tipos próprios. É o que permite testar RN-02 a RN-10 com Vitest, sem banco e sem mock.

---

## 3. Modelo Físico de Dados

### 3.1 Extensões e tipos

```sql
create extension if not exists "btree_gist";   -- necessário para o EXCLUDE
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
```

### 3.2 Recursos

```sql
create table sala (
  id                    uuid primary key default gen_random_uuid(),
  numero                int  not null unique,
  nome                  text not null,
  descricao             text,
  tipo_alocacao         alocacao_sala not null default 'flexivel',
  procedimento_fixo_id  uuid references procedimento(id),
  vigencia_inicio       date not null default current_date,
  vigencia_fim          date,
  ativo                 boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint sala_dedicada_exige_procedimento
    check (tipo_alocacao <> 'dedicada' or procedimento_fixo_id is not null),
  constraint sala_vigencia_coerente
    check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);

create table equipamento (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,              -- "Ultraformer #3"
  modelo          text not null,              -- "Ultraformer MPT"  ← agrega no RF-21c
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
    check (tipo_alocacao <> 'movel' or sala_id is null)
);

create table profissional (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid references usuario(id),   -- opcional: pode não ter login
  nome            text not null,
  cpf             text unique,
  especialidade   text,
  cor_agenda      text not null default '#64748b',
  vigencia_inicio date not null default current_date,
  vigencia_fim    date,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- RF-23a: quem pode executar o quê
create table profissional_habilitacao (
  profissional_id uuid not null references profissional(id) on delete cascade,
  procedimento_id uuid not null references procedimento(id) on delete cascade,
  primary key (profissional_id, procedimento_id)
);
```

#### [refinamento] Custos em tabelas próprias

O PRD (§5.2) coloca `custo_hora` em `equipamento` e `custo_hora`/`comissao_*` em `profissional`. **A spec separa esses campos em tabelas dedicadas:**

```sql
create table equipamento_custo (
  equipamento_id uuid primary key references equipamento(id) on delete cascade,
  custo_hora     numeric(12,2) not null default 0
);

create table profissional_remuneracao (
  profissional_id uuid primary key references profissional(id) on delete cascade,
  custo_hora      numeric(12,2) not null default 0,
  comissao_tipo   tipo_comissao not null default 'nenhuma',
  comissao_valor  numeric(12,2) not null default 0
);
```

**Motivo:** o RLS do Postgres é *row*-level, não *column*-level. Com o custo na mesma tabela, impedir a recepção de ver `custo_hora` (RF-88) exigiria ou views com `security definer` — que abrem brecha de escalonamento se mal escopadas — ou filtragem por coluna na aplicação, que é justamente o tipo de proteção que o P2 rejeita. Separando em tabela própria, uma política RLS de uma linha resolve: recepção simplesmente não alcança a tabela. Custo: um `join` a mais nas telas de admin.

### 3.3 Disponibilidade e bloqueios

```sql
create table recurso_disponibilidade (
  id           uuid primary key default gen_random_uuid(),
  recurso_tipo tipo_recurso not null,
  recurso_id   uuid not null,
  dia_semana   smallint not null check (dia_semana between 0 and 6),  -- 0 = domingo
  hora_inicio  time not null,
  hora_fim     time not null,
  check (hora_fim > hora_inicio)
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
  check (fim > inicio)
);
create index on recurso_bloqueio using gist (recurso_tipo, recurso_id, periodo);
```

> `recurso_id` é polimórfico e **não** tem FK — é o preço de tratar os três tipos de recurso uniformemente (§5.1 do PRD). A integridade é garantida por trigger de validação e pelo fato de recursos nunca serem deletados fisicamente (P5).

### 3.4 Catálogo

```sql
create table procedimento (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null,
  descricao         text,
  duracao_min       int  not null check (duracao_min > 0),
  buffer_min        int  not null default 0 check (buffer_min >= 0),  -- ver A-09
  sessoes_padrao    int  not null default 1 check (sessoes_padrao > 0),
  valor_sessao      numeric(12,2) not null check (valor_sessao >= 0),
  intervalo_min_dias int not null default 0,
  ativo             boolean not null default true
);

create table procedimento_custo (
  id              uuid primary key default gen_random_uuid(),
  procedimento_id uuid not null references procedimento(id) on delete cascade,
  tipo            tipo_custo not null,
  descricao       text not null,
  valor_unitario  numeric(12,2) not null,
  quantidade      numeric(10,3) not null default 1
);

create table procedimento_requisito (
  id              uuid primary key default gen_random_uuid(),
  procedimento_id uuid not null references procedimento(id) on delete cascade,
  recurso_tipo    tipo_recurso not null,
  recurso_id      uuid,          -- unidade específica…
  modelo          text,          -- …ou qualquer unidade deste modelo
  quantidade      int not null default 1,
  obrigatorio     boolean not null default true,
  check (recurso_id is not null or modelo is not null)
);
```

> **`buffer_min`** resolve a pendência A-09 do PRD sem travar o desenvolvimento: o campo existe, nasce em 0 e a clínica preenche quando souber o tempo de preparo. A agenda reserva `duracao_min + buffer_min`; o cálculo de receita usa apenas `duracao_min`.
>
> **`modelo` em `procedimento_requisito`** é o que faz "Ultraformer Olhos exige *um* Ultraformer qualquer" funcionar sem amarrar o procedimento à unidade #1 — e é o que permite ao sistema achar automaticamente qual das 4 unidades está livre (RF-48).

### 3.5 Agendamento e a garantia anti-conflito

```sql
create table agendamento (
  id              uuid primary key default gen_random_uuid(),
  paciente_id     uuid not null references paciente(id),
  procedimento_id uuid not null references procedimento(id),
  pacote_id       uuid references pacote(id),      -- null = avulso
  sala_id         uuid not null references sala(id),
  inicio          timestamptz not null,
  fim             timestamptz not null,
  status          status_agendamento not null default 'agendado',
  numero_sessao   int,
  observacoes     text,
  criado_por      uuid not null references usuario(id),
  created_at      timestamptz not null default now(),
  check (fim > inicio)
);

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
```

#### A tabela `reserva` — o coração da spec

```sql
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
```

**Por que uma tabela única em vez de validar sala, equipamento e profissional separadamente:**

1. **Uma constraint cobre os três tipos.** Sem ela seriam três verificações distintas, cada uma com sua chance de divergir da outra.
2. **A garantia é do banco.** `EXCLUDE USING gist` adquire lock de predicado: duas transações concorrentes tentando reservar o mesmo Ultraformer no mesmo horário — a segunda recebe `23P01 exclusion_violation`. É o que cumpre o RNF-05 e o CA-13. Nenhuma validação em JavaScript consegue isso.
3. **A consulta de ocupação fica uniforme.** Um único `select` sobre `reserva` calcula ocupação de sala, aparelho ou profissional.
4. **`where (ativo)`** faz agendamento cancelado liberar o horário (RN-03), sem apagar o registro (P5).

A tabela é **derivada** — mantida por trigger, nunca escrita pela aplicação:

```sql
create or replace function rebuild_reservas(p_agendamento uuid)
returns void language plpgsql as $$
declare v record;
begin
  delete from reserva where agendamento_id = p_agendamento;
  select a.*, (a.status <> 'cancelado') as vigente into v
    from agendamento a where a.id = p_agendamento;
  if not found then return; end if;

  insert into reserva (agendamento_id, recurso_tipo, recurso_id, periodo, ativo)
  select p_agendamento, 'sala', v.sala_id, tstzrange(v.inicio, v.fim, '[)'), v.vigente
  union all
  select p_agendamento, 'equipamento', ae.equipamento_id,
         tstzrange(v.inicio, v.fim, '[)'), v.vigente
    from agendamento_equipamento ae where ae.agendamento_id = p_agendamento
  union all
  select p_agendamento, 'profissional', ap.profissional_id,
         tstzrange(v.inicio, v.fim, '[)'), v.vigente
    from agendamento_profissional ap where ap.agendamento_id = p_agendamento;
end $$;
```

Triggers `AFTER INSERT OR UPDATE` em `agendamento` (quando mudam `inicio`, `fim`, `sala_id` ou `status`) e `AFTER INSERT OR DELETE` em `agendamento_equipamento` / `agendamento_profissional`, todos chamando `rebuild_reservas`.

> **Nota sobre `falta`:** a reserva permanece `ativo = true`. O horário foi consumido de fato — a sala ficou bloqueada e ninguém a usou. É exatamente isso que faz a diferença entre ocupação agendada e efetiva aparecer no painel (RN-03).

**Validação de disponibilidade** (RF-47) — bloqueio e janela de atendimento não cabem na constraint de exclusão, porque comparam contra regra semanal e não contra outra reserva. Ficam em trigger `BEFORE INSERT/UPDATE` em `reserva`, que rejeita se o período não estiver contido na disponibilidade do recurso ou intersectar um bloqueio.

### 3.6 Venda e financeiro

```sql
create table pacote (
  id                 uuid primary key default gen_random_uuid(),
  paciente_id        uuid not null references paciente(id),
  procedimento_id    uuid not null references procedimento(id),
  quantidade_sessoes int not null check (quantidade_sessoes > 0),
  valor_total        numeric(12,2) not null,
  desconto           numeric(12,2) not null default 0,
  status             status_pacote not null default 'ativo',
  data_venda         date not null default current_date,
  validade           date,
  vendido_por        uuid references usuario(id)
);

create table lancamento (
  id             uuid primary key default gen_random_uuid(),
  tipo           tipo_lancamento not null,
  origem_tipo    text not null,          -- 'pacote' | 'agendamento' | 'despesa_fixa'
  origem_id      uuid,
  categoria      text,
  valor          numeric(12,2) not null,
  vencimento     date not null,
  data_pagamento date,
  forma_pagamento text,
  status         status_lancamento not null default 'pendente',
  parcela_num    int, parcela_total int
);

create table comissao (
  id              uuid primary key default gen_random_uuid(),
  agendamento_id  uuid not null references agendamento(id),
  profissional_id uuid not null references profissional(id),
  base_calculo    numeric(12,2) not null,
  percentual      numeric(6,3),
  valor           numeric(12,2) not null,
  status          status_comissao not null default 'prevista',
  competencia     text not null,          -- 'AAAA-MM'
  unique (agendamento_id, profissional_id)
);

create table despesa_fixa (
  id          uuid primary key default gen_random_uuid(),
  descricao   text not null,
  categoria   text,
  valor       numeric(12,2) not null,
  competencia text not null,             -- 'AAAA-MM'
  recorrente  boolean not null default false
);
```

---

## 4. Funções de Cálculo

Toda a matemática do §7 do PRD vive em funções SQL `stable`, chamadas por RPC. Elas são a **fonte única de verdade** — o TypeScript em `lib/domain/` replica a lógica apenas para testes e para preview em tela, nunca para gravar.

### 4.1 Capacidade (RN-02 + RN-10)

```sql
create or replace function capacidade_recurso(
  p_tipo tipo_recurso, p_id uuid,
  p_inicio timestamptz, p_fim timestamptz
) returns interval language sql stable as $$
with vig as (
  select coalesce(vigencia_inicio, '-infinity'::date) as vi,
         coalesce(vigencia_fim,     'infinity'::date) as vf
  from recurso_vigencia(p_tipo, p_id)
),
dias as (
  select generate_series(
           (p_inicio at time zone 'America/Sao_Paulo')::date,
           (p_fim    at time zone 'America/Sao_Paulo')::date,
           interval '1 day')::date as dia
),
janelas as (
  select tstzrange(
           timezone('America/Sao_Paulo', d.dia + a.hora_inicio),
           timezone('America/Sao_Paulo', d.dia + a.hora_fim), '[)') as r
  from dias d
  join recurso_disponibilidade a
    on a.recurso_tipo = p_tipo and a.recurso_id = p_id
   and a.dia_semana = extract(dow from d.dia)
  cross join vig
  where d.dia between vig.vi and vig.vf          -- ← RN-10
),
disp as (
  select range_agg(r * tstzrange(p_inicio, p_fim, '[)')) as m
  from janelas where not isempty(r * tstzrange(p_inicio, p_fim, '[)'))
),
blo as (
  select range_agg(periodo) as m from recurso_bloqueio
  where recurso_tipo = p_tipo and recurso_id = p_id
    and periodo && tstzrange(p_inicio, p_fim, '[)')
)
select coalesce((
  select sum(upper(x) - lower(x)) from unnest(
    coalesce((select m from disp), '{}'::tstzmultirange)
    - coalesce((select m from blo),  '{}'::tstzmultirange)) x
), interval '0');
$$;
```

Usa **multirange** (`range_agg`, subtração de multirange), disponível a partir do Postgres 14. A subtração resolve de uma vez o caso de bloqueios sobrepostos e parcialmente fora da janela, sem laço nem lógica condicional.

### 4.2 Ocupação (RN-03)

```sql
create or replace function ocupacao_recurso(
  p_tipo tipo_recurso, p_id uuid,
  p_inicio timestamptz, p_fim timestamptz
) returns table (
  capacidade interval, agendadas interval, realizadas interval,
  taxa_agendada numeric, taxa_efetiva numeric
) language sql stable as $$
with cap as (select capacidade_recurso(p_tipo,p_id,p_inicio,p_fim) as c),
uso as (
  select
    coalesce(sum(upper(x.p)-lower(x.p)) filter (where a.status <> 'cancelado'), interval '0') ag,
    coalesce(sum(upper(x.p)-lower(x.p)) filter (where a.status =  'realizado'), interval '0') re
  from reserva r
  join agendamento a on a.id = r.agendamento_id
  cross join lateral (select r.periodo * tstzrange(p_inicio,p_fim,'[)') as p) x
  where r.recurso_tipo = p_tipo and r.recurso_id = p_id
    and r.ativo and not isempty(x.p)
)
select c, ag, re,
  case when c > interval '0'
       then round((extract(epoch from ag)/extract(epoch from c))::numeric, 4) end,
  case when c > interval '0'
       then round((extract(epoch from re)/extract(epoch from c))::numeric, 4) end
from cap, uso;
$$;
```

Demais funções, com a mesma estrutura: `margem_sessao` (RN-04), `calcular_comissao` (RN-05), `custo_hora_estrutura` (RN-07), `receita_por_hora_disponivel` (RN-08).

---

## 5. Segurança

### 5.1 Helpers

```sql
create or replace function perfil_atual() returns perfil_usuario
language sql stable security definer set search_path = public as $$
  select perfil from usuario where id = auth.uid() and ativo
$$;

create or replace function profissional_atual() returns uuid
language sql stable security definer set search_path = public as $$
  select id from profissional where usuario_id = auth.uid() and ativo
$$;
```

### 5.2 Matriz de acesso

| Tabela | admin | recepcao | profissional |
|---|---|---|---|
| `usuario` | tudo | — | lê o próprio |
| `paciente` | tudo | tudo | lê os de seus atendimentos |
| `sala` · `equipamento` · `profissional` | tudo | leitura | leitura |
| **`equipamento_custo`** | tudo | **nenhum** | **nenhum** |
| **`profissional_remuneracao`** | tudo | **nenhum** | lê a própria |
| `procedimento` | tudo | leitura | leitura |
| **`procedimento_custo`** | tudo | **nenhum** | **nenhum** |
| `pacote` · `agendamento` | tudo | tudo | lê/atualiza status dos seus |
| `lancamento` | tudo | insere e lê recebimentos | **nenhum** |
| **`comissao`** | tudo | **nenhum** | lê as próprias |
| **`despesa_fixa`** | tudo | **nenhum** | **nenhum** |

RLS habilitado em **todas** as tabelas, sem exceção. Exemplo do caso mais restritivo:

```sql
alter table comissao enable row level security;

create policy comissao_admin on comissao for all
  using (perfil_atual() = 'admin') with check (perfil_atual() = 'admin');

create policy comissao_propria on comissao for select
  using (perfil_atual() = 'profissional' and profissional_id = profissional_atual());
```

### 5.3 Chaves

| Variável | Onde | Exposta ao navegador? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente + servidor | sim |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente + servidor | sim — é segura **porque** o RLS existe |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor, nunca em componente cliente | **não** |

A `service_role` ignora RLS por completo. Uso restrito a um único caminho: criação de usuário pelo admin. Qualquer outro uso é bug de segurança.

---

## 6. Camada de Aplicação

### 6.1 Escrita — Server Actions

Toda mutação passa por Server Action. Padrão obrigatório:

```ts
'use server'
export async function criarAgendamento(input: unknown) {
  const dados = agendamentoSchema.parse(input)        // 1. Zod
  const supabase = await createServerClient()          // 2. sessão do usuário, RLS ativo
  const { error } = await supabase.rpc('criar_agendamento', dados)  // 3. transação no banco
  if (error?.code === '23P01') return { erro: 'CONFLITO', detalhe: await detalharConflito(dados) }
  revalidatePath('/agenda')
  return { ok: true }
}
```

A criação do agendamento é **uma função SQL transacional**, não três inserts do lado do Next.js. Inserir `agendamento`, depois equipamentos, depois profissionais em chamadas separadas deixaria janela para um agendamento existir sem seus recursos caso a segunda chamada falhe.

### 6.2 Tradução de erro

O código `23P01` é a resposta correta do banco, mas inútil na tela. A camada de ação o converte consultando qual reserva colidiu, e devolve: *"O Ultraformer #2 já está reservado das 14:00 às 14:20 para Maria Silva."*

### 6.3 Leitura

Server Components chamando RPC diretamente. Sem estado global de servidor no cliente; `revalidatePath` após mutação. Estado de UI (filtros, período) na URL via search params — o que torna qualquer visão do painel compartilhável por link.

### 6.4 Fuso horário

Regra única: **`timestamptz` no banco (UTC), conversão apenas na borda de apresentação.** O Brasil não tem mais horário de verão desde 2019, mas o offset não é fixado em lugar nenhum — tudo passa por `America/Sao_Paulo`, para que a mudança da regra não quebre a agenda.


### 6.5 Especificidades do Next 16

O projeto nasceu no **Next 16.3.8**, que traz mudanças incompatíveis com a v15. As que afetam esta aplicação:

| Mudança | Efeito aqui |
|---|---|
| `middleware.ts` → **`proxy.ts`** | A renovação de sessão do Supabase vive em `proxy.ts`, com a função exportada chamada `proxy`. O runtime é `nodejs` e **não é configurável** — edge não é suportado |
| `cookies()` e `headers()` **só assíncronos** | O acesso síncrono que a v15 tolerava foi removido. `createServerSupabase()` é `async` por isso |
| `params` e `searchParams` são **Promises** | Toda página que os usa precisa de `await`. Ex.: `/login` lê `?redirecionar=` com `await props.searchParams` |
| Turbopack por padrão | Build e dev usam Turbopack sem configuração adicional |
| Tipos globais gerados | `LayoutProps`, `PageProps` e `RouteContext` vêm de `next typegen`. Typecheck em máquina limpa exige rodá-lo antes (`next build` o executa sozinho) |

> A documentação da versão instalada fica em `node_modules/next/dist/docs/` e é a referência a consultar antes de escrever código de framework — ela reflete a versão em uso, não a mais divulgada.

> **O proxy não é autorização.** A documentação do Next é explícita nisso, e a spec concorda: o `proxy.ts` faz apenas redirecionamento otimista, para que um visitante sem sessão não veja a casca da aplicação. Quem protege cada linha de cada tabela é o RLS (princípio P2). O `app/(app)/layout.tsx` revalida com `getUser()`, que confere o token no servidor do Supabase — `getSession()` apenas lê o cookie, que o cliente poderia ter forjado.

---

## 7. Deploy na Vercel

### 7.1 Projetos

| Ambiente | Vercel | Supabase | Branch |
|---|---|---|---|
| Produção | `bodyprime-ocupacao` | `bodyprime-prod` (sa-east-1) | `main` |
| Preview | mesmo projeto, preview deploys | **`bodyprime-staging`** (sa-east-1) | qualquer PR |
| Local | `next dev` | `supabase start` (Docker) | — |

> **Preview aponta para um Supabase separado, obrigatoriamente.** Preview deployment com as credenciais de produção significa que qualquer teste em PR escreve na agenda real da clínica — cria paciente de teste, cancela agendamento de verdade. É a falha de configuração mais comum e mais cara desse arranjo.
>
> O time `LINKEED` já tem um projeto `bodyprime-relatorio`; o nome `bodyprime-ocupacao` evita colisão.

### 7.2 `vercel.json`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["gru1"],
  "framework": "nextjs",
  "headers": [{
    "source": "/(.*)",
    "headers": [
      { "key": "X-Frame-Options", "value": "DENY" },
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
    ]
  }]
}
```

### 7.3 Variáveis de ambiente

| Variável | Production | Preview | Tipo |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod | staging | texto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod | staging | texto |
| `SUPABASE_SERVICE_ROLE_KEY` | prod | staging | **sensitive** |
| `NEXT_PUBLIC_APP_TZ` | `America/Sao_Paulo` | idem | texto |

### 7.4 Migrações

Migrações **não** rodam no build da Vercel. O build é paralelo e pode executar várias vezes; migração precisa rodar uma vez, em ordem, com trava. Fluxo:

```
PR aberto       → CI aplica migrações no Supabase staging → preview deploy
merge em main   → job de migração no prod → só então promove o deploy
```

Enquanto não houver CI, `supabase db push` manual antes do merge, com a regra: **migração vai antes do deploy, nunca depois.**

### 7.5 Checklist de produção

- [ ] Região Vercel `gru1` e Supabase `sa-east-1` confirmadas
- [ ] RLS habilitado em **todas** as tabelas (`select * from pg_tables where rowsecurity = false`)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` marcada como sensitive e ausente de qualquer componente cliente
- [ ] Preview apontando para staging, verificado abrindo um PR de teste
- [ ] Backup diário (PITR) ativo no Supabase
- [ ] `btree_gist` instalada e `reserva_sem_conflito` presente em produção
- [ ] Teste de concorrência (CA-13) executado contra o banco de produção antes do go-live
- [ ] Usuário admin inicial criado com senha forte e troca no primeiro acesso

---

## 8. Testes

| Nível | Ferramenta | Cobre |
|---|---|---|
| Unidade | Vitest sobre `lib/domain/` | RN-02 a RN-10 — capacidade, ocupação, margem, comissão, rateio |
| Integração | Vitest + Supabase local | Triggers, funções SQL, políticas RLS por perfil |
| **Concorrência** | Vitest — N transações paralelas | **CA-13**: duas reservas simultâneas do mesmo recurso; exatamente uma persiste |
| E2E | Playwright | Login, agendar com conflito bloqueado, marcar realizado, painel |

**A prioridade é o teste de concorrência.** É o único requisito que não dá para verificar clicando na tela, e é o que protege a operação do erro mais caro do sistema.

Casos de aceite do PRD (CA-01 a CA-18) viram testes nomeados pelo ID, para que a rastreabilidade PRD → spec → teste seja direta.

---

## 9. Pendências herdadas do PRD

| PRD | Tratamento nesta spec |
|---|---|
| A-06 — preço e nº de sessões do Melasma | Cadastro; não bloqueia código |
| A-08 — quantas unidades de Fotona | Resolvido por cadastro (P3); o sistema opera com qualquer quantidade |
| A-09 — tempo de preparo | Campo `procedimento.buffer_min`, default 0 |
| A-01 — três perfis | Implementados conforme §5.2; alterar é editar políticas |
| A-07 — campanhas (October Fast) | Fora do MVP; `pacote.desconto` cobre o preço promocional |
