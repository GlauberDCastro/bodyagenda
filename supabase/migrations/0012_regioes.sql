-- 0012 · Regiões de aplicação e protocolo por região
--
-- O procedimento deixa de ser a unidade de venda e de agenda. Quem define
-- duração, preço e número de sessões passa a ser o par PROCEDIMENTO + REGIÃO:
-- "Ultraformer" não tem duração — "Ultraformer na papada" tem 20 min, e
-- "Ultraformer 1/3 superior" tem 40.
--
-- Sem isso a clínica precisaria cadastrar um procedimento separado para cada
-- região, duplicando custo e requisito de equipamento em cada cópia.

create type unidade_medida as enum ('sessao', 'ui', 'ml', 'seringa', 'flash', 'aplicacao');

create table regiao (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null unique,
  grupo     text,                       -- Face, Corpo, Couro cabeludo…
  ordem     int  not null default 0,
  ativo     boolean not null default true
);
create index on regiao (grupo, ordem);

-- O protocolo: o que este procedimento faz NESTA região.
create table procedimento_regiao (
  id                 uuid primary key default gen_random_uuid(),
  procedimento_id    uuid not null references procedimento(id) on delete cascade,
  regiao_id          uuid not null references regiao(id) on delete restrict,

  -- Sobrescrevem o procedimento quando preenchidos. Null = herda.
  duracao_min        int    check (duracao_min > 0),
  sessoes_padrao     int    check (sessoes_padrao > 0),
  valor_sessao       numeric(12,2) check (valor_sessao >= 0),
  intervalo_min_dias int    check (intervalo_min_dias >= 0),

  -- Dosagem: harmonização se mede em UI ou ml, não em "sessão".
  unidade            unidade_medida not null default 'sessao',
  quantidade_padrao  numeric(10,2) not null default 1 check (quantidade_padrao > 0),

  observacoes        text,
  ativo              boolean not null default true,
  unique (procedimento_id, regiao_id)
);
create index on procedimento_regiao (procedimento_id);

-- Região atendida no agendamento. N:N porque uma sessão pode cobrir mais de
-- uma região — "botox na testa e no olho" é um atendimento só.
create table agendamento_regiao (
  agendamento_id uuid not null references agendamento(id) on delete cascade,
  regiao_id      uuid not null references regiao(id),
  quantidade     numeric(10,2) not null default 1 check (quantidade > 0),
  unidade        unidade_medida not null default 'sessao',
  primary key (agendamento_id, regiao_id)
);

-- Região do pacote: o saldo é por região, não do procedimento inteiro.
-- Um pacote de "Ultraformer papada 10x" não dá saldo para o 1/3 superior.
alter table pacote add column regiao_id uuid references regiao(id);
create index on pacote (regiao_id);

-- ── Protocolo efetivo ───────────────────────────────────────────────────────
-- Fonte única do que vale para um par procedimento+região, resolvendo a
-- herança. A agenda e a venda consultam isto, nunca as colunas soltas.
create or replace function protocolo_efetivo(
  p_procedimento uuid,
  p_regiao       uuid default null
) returns table (
  duracao_min        int,
  buffer_min         int,
  sessoes_padrao     int,
  valor_sessao       numeric,
  intervalo_min_dias int,
  unidade            unidade_medida,
  quantidade_padrao  numeric
) language sql stable as $$
  select
    coalesce(pr.duracao_min,        p.duracao_min),
    p.buffer_min,
    coalesce(pr.sessoes_padrao,     p.sessoes_padrao),
    coalesce(pr.valor_sessao,       p.valor_sessao),
    coalesce(pr.intervalo_min_dias, p.intervalo_min_dias),
    coalesce(pr.unidade,            'sessao'::unidade_medida),
    coalesce(pr.quantidade_padrao,  1)
  from procedimento p
  left join procedimento_regiao pr
    on pr.procedimento_id = p.id
   and pr.regiao_id = p_regiao
   and pr.ativo
  where p.id = p_procedimento;
$$;

-- criar_agendamento passa a aceitar região e a tirar dela a duração.
create or replace function criar_agendamento(
  p_paciente        uuid,
  p_procedimento    uuid,
  p_inicio          timestamptz,
  p_sala            uuid,
  p_equipamentos    uuid[]  default '{}',
  p_profissionais   uuid[]  default '{}',
  p_pacote          uuid    default null,
  p_observacoes     text    default null,
  p_valor_avulso    numeric default null,
  p_regiao          uuid    default null,
  p_quantidade      numeric default null
) returns uuid language plpgsql security invoker as $$
declare
  v_prot        record;
  v_fim         timestamptz;
  v_agendamento uuid;
  v_usadas      int;
  v_pacote      pacote%rowtype;
  v_numero      int;
begin
  select * into v_prot from protocolo_efetivo(p_procedimento, p_regiao);
  if not found then
    raise exception 'Procedimento inexistente' using errcode = '23503';
  end if;

  v_fim := p_inicio + make_interval(mins => v_prot.duracao_min + v_prot.buffer_min);

  if p_pacote is not null then
    select * into v_pacote from pacote where id = p_pacote for update;
    if not found then
      raise exception 'Pacote inexistente' using errcode = '23503';
    end if;
    if v_pacote.status <> 'ativo' then
      raise exception 'Pacote nao esta ativo (status: %)', v_pacote.status
        using errcode = '23514';
    end if;
    if v_pacote.validade is not null and v_pacote.validade < current_date then
      raise exception 'Pacote vencido em %', v_pacote.validade using errcode = '23514';
    end if;

    -- O saldo é por região: pacote de papada não cobre o 1/3 superior.
    if v_pacote.regiao_id is not null
       and p_regiao is not null
       and v_pacote.regiao_id <> p_regiao then
      raise exception 'Este pacote e de outra regiao' using errcode = '23514';
    end if;

    select count(*) into v_usadas
      from agendamento
     where pacote_id = p_pacote and status <> 'cancelado';

    if v_usadas >= v_pacote.quantidade_sessoes then
      raise exception 'Pacote sem saldo: % de % sessoes ja utilizadas',
        v_usadas, v_pacote.quantidade_sessoes using errcode = '23514';
    end if;
    v_numero := v_usadas + 1;
  end if;

  perform set_config('app.suspender_reservas', 'on', true);

  insert into agendamento (paciente_id, procedimento_id, pacote_id, sala_id,
                           inicio, fim, numero_sessao, valor_avulso,
                           observacoes, criado_por)
  values (p_paciente, p_procedimento, p_pacote, p_sala,
          p_inicio, v_fim, v_numero, p_valor_avulso,
          p_observacoes, auth.uid())
  returning id into v_agendamento;

  insert into agendamento_equipamento (agendamento_id, equipamento_id)
  select v_agendamento, unnest(p_equipamentos);

  insert into agendamento_profissional (agendamento_id, profissional_id)
  select v_agendamento, unnest(p_profissionais);

  if p_regiao is not null then
    insert into agendamento_regiao (agendamento_id, regiao_id, quantidade, unidade)
    values (v_agendamento, p_regiao,
            coalesce(p_quantidade, v_prot.quantidade_padrao), v_prot.unidade);
  end if;

  perform set_config('app.suspender_reservas', 'off', true);
  perform rebuild_reservas(v_agendamento);

  return v_agendamento;
end $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table regiao              enable row level security;
alter table procedimento_regiao enable row level security;
alter table agendamento_regiao  enable row level security;

create policy regiao_admin on regiao for all
  using (e_admin()) with check (e_admin());
create policy regiao_leitura on regiao for select
  using (auth.uid() is not null);

create policy proc_regiao_admin on procedimento_regiao for all
  using (e_admin()) with check (e_admin());
create policy proc_regiao_leitura on procedimento_regiao for select
  using (auth.uid() is not null);

create policy ag_regiao_admin on agendamento_regiao for all
  using (e_admin()) with check (e_admin());
create policy ag_regiao_recepcao on agendamento_regiao for all
  using (perfil_atual() = 'recepcao') with check (perfil_atual() = 'recepcao');
create policy ag_regiao_leitura on agendamento_regiao for select
  using (auth.uid() is not null);
