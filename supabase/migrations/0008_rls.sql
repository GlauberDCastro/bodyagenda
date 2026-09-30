-- 0008 · Row Level Security
-- SPEC §5.2 · RNF-03, RF-88 · Princípio P2: a autorização mora no RLS
--
-- Sem isto, qualquer portador da chave anon lê e escreve tudo — a chave é
-- pública por definição, ela vai para o navegador. O RLS é a única fronteira.

-- `reserva` é tabela derivada, mantida por trigger. Os usuários nunca a
-- escrevem diretamente, então rebuild_reservas() passa a SECURITY DEFINER:
-- roda como dono e contorna o RLS de reserva, enquanto os usuários ficam só
-- com leitura. Sem isso, salvar um agendamento falharia no trigger.
alter function rebuild_reservas(uuid) security definer;
alter function rebuild_reservas(uuid) set search_path = public;

-- ── Habilita RLS em tudo ─────────────────────────────────────────────────────
alter table usuario                  enable row level security;
alter table auditoria                enable row level security;
alter table procedimento             enable row level security;
alter table procedimento_custo       enable row level security;
alter table procedimento_requisito   enable row level security;
alter table sala                     enable row level security;
alter table equipamento              enable row level security;
alter table profissional             enable row level security;
alter table profissional_habilitacao enable row level security;
alter table equipamento_custo        enable row level security;
alter table profissional_remuneracao enable row level security;
alter table recurso_disponibilidade  enable row level security;
alter table recurso_bloqueio         enable row level security;
alter table paciente                 enable row level security;
alter table pacote                   enable row level security;
alter table agendamento              enable row level security;
alter table agendamento_equipamento  enable row level security;
alter table agendamento_profissional enable row level security;
alter table reserva                  enable row level security;
alter table _migracao_aplicada       enable row level security;

-- ── Controle de migração: ninguém, nem admin ────────────────────────────────
-- Sem policy nenhuma, RLS nega tudo. O script de migração usa conexão direta
-- como `postgres`, que ignora RLS por ser dono da tabela.

-- ── Usuário ─────────────────────────────────────────────────────────────────
-- perfil_atual() é SECURITY DEFINER, então não recai na própria política.
create policy usuario_admin on usuario for all
  using (e_admin()) with check (e_admin());

create policy usuario_proprio on usuario for select
  using (id = auth.uid());

-- ── Auditoria: admin lê; a escrita vem de trigger SECURITY DEFINER ──────────
create policy auditoria_admin on auditoria for select using (e_admin());

-- ── Catálogo ────────────────────────────────────────────────────────────────
create policy procedimento_admin on procedimento for all
  using (e_admin()) with check (e_admin());

create policy procedimento_leitura on procedimento for select
  using (auth.uid() is not null);

create policy requisito_admin on procedimento_requisito for all
  using (e_admin()) with check (e_admin());

create policy requisito_leitura on procedimento_requisito for select
  using (auth.uid() is not null);

-- RF-88 · custo do procedimento é SÓ do admin. Sem policy de leitura para os
-- demais perfis, a recepção simplesmente não alcança a tabela.
create policy procedimento_custo_admin on procedimento_custo for all
  using (e_admin()) with check (e_admin());

-- ── Recursos: todos leem, só admin escreve ──────────────────────────────────
create policy sala_admin on sala for all
  using (e_admin()) with check (e_admin());
create policy sala_leitura on sala for select
  using (auth.uid() is not null);

create policy equipamento_admin on equipamento for all
  using (e_admin()) with check (e_admin());
create policy equipamento_leitura on equipamento for select
  using (auth.uid() is not null);

create policy profissional_admin on profissional for all
  using (e_admin()) with check (e_admin());
create policy profissional_leitura on profissional for select
  using (auth.uid() is not null);

create policy habilitacao_admin on profissional_habilitacao for all
  using (e_admin()) with check (e_admin());
create policy habilitacao_leitura on profissional_habilitacao for select
  using (auth.uid() is not null);

create policy disponibilidade_admin on recurso_disponibilidade for all
  using (e_admin()) with check (e_admin());
create policy disponibilidade_leitura on recurso_disponibilidade for select
  using (auth.uid() is not null);

-- Bloqueio: recepção também cria (manutenção surge no meio do dia).
create policy bloqueio_admin on recurso_bloqueio for all
  using (e_admin()) with check (e_admin());
create policy bloqueio_leitura on recurso_bloqueio for select
  using (auth.uid() is not null);
create policy bloqueio_recepcao on recurso_bloqueio for insert
  with check (perfil_atual() = 'recepcao');

-- ── Custos separados: o motivo de existirem como tabela própria ─────────────
-- O RLS do Postgres é row-level. Com custo_hora dentro de `equipamento`,
-- escondê-lo da recepção exigiria view SECURITY DEFINER ou filtro na
-- aplicação. Em tabela separada, uma policy resolve (SPEC §3.2).
create policy equipamento_custo_admin on equipamento_custo for all
  using (e_admin()) with check (e_admin());

create policy remuneracao_admin on profissional_remuneracao for all
  using (e_admin()) with check (e_admin());

-- O profissional vê a própria remuneração, nunca a dos colegas.
create policy remuneracao_propria on profissional_remuneracao for select
  using (profissional_id = profissional_atual());

-- ── Paciente ────────────────────────────────────────────────────────────────
create policy paciente_admin on paciente for all
  using (e_admin()) with check (e_admin());

create policy paciente_recepcao on paciente for all
  using (perfil_atual() = 'recepcao') with check (perfil_atual() = 'recepcao');

-- O profissional só vê pacientes que ele próprio atende.
create policy paciente_do_profissional on paciente for select
  using (
    exists (
      select 1
      from agendamento a
      join agendamento_profissional ap on ap.agendamento_id = a.id
      where a.paciente_id = paciente.id
        and ap.profissional_id = profissional_atual()
    )
  );

-- ── Pacote ──────────────────────────────────────────────────────────────────
create policy pacote_admin on pacote for all
  using (e_admin()) with check (e_admin());

create policy pacote_recepcao on pacote for all
  using (perfil_atual() = 'recepcao') with check (perfil_atual() = 'recepcao');

create policy pacote_leitura_profissional on pacote for select
  using (perfil_atual() = 'profissional');

-- ── Agendamento ─────────────────────────────────────────────────────────────
create policy agendamento_admin on agendamento for all
  using (e_admin()) with check (e_admin());

create policy agendamento_recepcao on agendamento for all
  using (perfil_atual() = 'recepcao') with check (perfil_atual() = 'recepcao');

-- CA-11 · o profissional vê apenas os próprios atendimentos.
create policy agendamento_proprio on agendamento for select
  using (
    exists (
      select 1 from agendamento_profissional ap
      where ap.agendamento_id = agendamento.id
        and ap.profissional_id = profissional_atual()
    )
  );

-- Ele pode concluir/marcar falta no que é dele, mas não remarcar nem criar.
create policy agendamento_proprio_status on agendamento for update
  using (
    exists (
      select 1 from agendamento_profissional ap
      where ap.agendamento_id = agendamento.id
        and ap.profissional_id = profissional_atual()
    )
  )
  with check (
    exists (
      select 1 from agendamento_profissional ap
      where ap.agendamento_id = agendamento.id
        and ap.profissional_id = profissional_atual()
    )
  );

-- ── Vínculos do agendamento ─────────────────────────────────────────────────
create policy ag_equip_admin on agendamento_equipamento for all
  using (e_admin()) with check (e_admin());
create policy ag_equip_recepcao on agendamento_equipamento for all
  using (perfil_atual() = 'recepcao') with check (perfil_atual() = 'recepcao');
create policy ag_equip_leitura on agendamento_equipamento for select
  using (auth.uid() is not null);

create policy ag_prof_admin on agendamento_profissional for all
  using (e_admin()) with check (e_admin());
create policy ag_prof_recepcao on agendamento_profissional for all
  using (perfil_atual() = 'recepcao') with check (perfil_atual() = 'recepcao');
create policy ag_prof_leitura on agendamento_profissional for select
  using (auth.uid() is not null);

-- ── Reserva: leitura para todos, escrita só pelo trigger ────────────────────
-- Sem policy de insert/update/delete de propósito. rebuild_reservas() é
-- SECURITY DEFINER e contorna; qualquer escrita direta é recusada, que é o
-- comportamento correto para uma tabela derivada.
create policy reserva_leitura on reserva for select
  using (auth.uid() is not null);
