-- 0041 · Time comercial, avaliação inicial e upsell
--
-- 1. SDR e Closer operam como a recepção: cadastram paciente, agendam,
--    vendem pacote e registram recebimento. Não veem custo, margem nem
--    bonificação (as políticas de financeiro não os incluem).
-- 2. Avaliação inicial é um tipo de procedimento (gratuito, 30 min,
--    editável no catálogo). O comercial pode agendar procedimento direto,
--    sem avaliação; a agenda sinaliza quem nunca passou por uma.
-- 3. Todo atendimento guarda a origem (agenda, comercial ou upsell) e quem
--    vendeu. Upsell aponta para o atendimento em que a venda aconteceu.

-- ── 1. Permissões ───────────────────────────────────────────────────────────
create or replace function e_atendimento() returns boolean
language sql stable as $$ select perfil_atual() in ('recepcao', 'sdr', 'closer') $$;

drop policy paciente_recepcao on paciente;
create policy paciente_recepcao on paciente for all
  using (e_atendimento()) with check (e_atendimento());

drop policy pacote_recepcao on pacote;
create policy pacote_recepcao on pacote for all
  using (e_atendimento()) with check (e_atendimento());

drop policy agendamento_recepcao on agendamento;
create policy agendamento_recepcao on agendamento for all
  using (e_atendimento()) with check (e_atendimento());

drop policy ag_equip_recepcao on agendamento_equipamento;
create policy ag_equip_recepcao on agendamento_equipamento for all
  using (e_atendimento()) with check (e_atendimento());

drop policy ag_prof_recepcao on agendamento_profissional;
create policy ag_prof_recepcao on agendamento_profissional for all
  using (e_atendimento()) with check (e_atendimento());

drop policy ag_regiao_recepcao on agendamento_regiao;
create policy ag_regiao_recepcao on agendamento_regiao for all
  using (e_atendimento()) with check (e_atendimento());

drop policy lancamento_recepcao_leitura on lancamento;
create policy lancamento_recepcao_leitura on lancamento for select
  using (e_atendimento() and tipo = 'receita');
drop policy lancamento_recepcao_insert on lancamento;
create policy lancamento_recepcao_insert on lancamento for insert
  with check (e_atendimento() and tipo = 'receita');
drop policy lancamento_recepcao_update on lancamento;
create policy lancamento_recepcao_update on lancamento for update
  using (e_atendimento() and tipo = 'receita')
  with check (e_atendimento() and tipo = 'receita');

-- ── 2. Avaliação inicial ─────────────────────────────────────────────────────
alter table procedimento add column avaliacao boolean not null default false;

insert into procedimento (nome, descricao, duracao_min, valor_sessao, sessoes_padrao, avaliacao)
values ('Avaliação inicial',
        'Primeira consulta: avaliação e indicação de tratamento. Sem cobrança.',
        30, 0, 1, true);

-- Habilita todos os profissionais ativos; a gestão ajusta quem faz avaliação.
insert into profissional_habilitacao (profissional_id, procedimento_id)
select p.id, pr.id
  from profissional p
  cross join procedimento pr
 where p.ativo and pr.avaliacao and pr.nome = 'Avaliação inicial'
on conflict do nothing;

-- ── 3. Origem e quem vendeu ──────────────────────────────────────────────────
alter table agendamento
  add column origem text not null default 'agenda'
    check (origem in ('agenda', 'comercial', 'upsell')),
  add column vendido_por uuid references usuario(id),
  add column atendimento_origem_id uuid references agendamento(id) on delete set null;

create index on agendamento (atendimento_origem_id) where atendimento_origem_id is not null;
create index on agendamento (vendido_por) where vendido_por is not null;

-- Quem agenda pelo comercial já fica registrado como vendedor.
create or replace function trg_origem_do_agendamento() returns trigger
language plpgsql as $$
begin
  if new.origem = 'agenda' and perfil_atual() in ('sdr', 'closer') then
    new.origem := 'comercial';
    new.vendido_por := coalesce(new.vendido_por, auth.uid());
  end if;
  return new;
end $$;

create trigger agendamento_origem before insert on agendamento
  for each row execute function trg_origem_do_agendamento();

-- ── Upsell ───────────────────────────────────────────────────────────────────
-- A doutora vende outro procedimento durante o atendimento e já agenda:
-- logo em seguida (mesma sala, mesma profissional) ou em outro dia.
--
-- DEFINER porque o perfil profissional não cria agendamento pelo RLS; a
-- permissão é checada aqui: atendimento (recepção, SDR, closer), admin, ou a
-- profissional DO atendimento de origem. As regras de conflito, janela,
-- habilitação e pacote são as de criar_agendamento, que esta função chama.
create function registrar_upsell(
  p_origem        uuid,
  p_procedimento  uuid,
  p_inicio        timestamptz,
  p_sala          uuid,
  p_equipamentos  uuid[] default '{}',
  p_profissionais uuid[] default '{}',
  p_pacote        uuid default null,
  p_observacoes   text default null,
  p_valor_avulso  numeric default null,
  p_duracao       integer default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_origem agendamento%rowtype;
  v_id     uuid;
begin
  select * into v_origem from agendamento where id = p_origem;
  if not found or v_origem.status = 'cancelado' then
    raise exception 'Atendimento de origem não encontrado' using errcode = '23503';
  end if;

  if not (
    perfil_atual() = 'admin' or e_atendimento()
    or (perfil_atual() = 'profissional' and exists (
          select 1 from agendamento_profissional ap
            join profissional p on p.id = ap.profissional_id
           where ap.agendamento_id = p_origem and p.usuario_id = auth.uid()))
  ) then
    raise exception 'Sem permissão para registrar upsell neste atendimento' using errcode = '42501';
  end if;

  v_id := criar_agendamento(v_origem.paciente_id, p_procedimento, p_inicio, p_sala,
                            p_equipamentos, p_profissionais, p_pacote, p_observacoes,
                            p_valor_avulso, null, null, p_duracao);

  update agendamento
     set origem = 'upsell', atendimento_origem_id = p_origem, vendido_por = auth.uid()
   where id = v_id;
  return v_id;
end $$;

revoke execute on function registrar_upsell(uuid, uuid, timestamptz, uuid, uuid[], uuid[], uuid, text, numeric, integer) from public, anon;
grant execute on function registrar_upsell(uuid, uuid, timestamptz, uuid, uuid[], uuid[], uuid, text, numeric, integer) to authenticated;
