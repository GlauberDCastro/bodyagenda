-- 0024 · Revisão de índices (M8.2)
--
-- reserva tinha dois GiST idênticos em (recurso_tipo, recurso_id, periodo)
-- where ativo: o da constraint reserva_sem_conflito e uma cópia explícita.
-- O da constraint já serve às consultas de faixa; a cópia só dobrava o custo
-- de escrita de cada agendamento.
drop index if exists reserva_recurso_tipo_recurso_id_periodo_idx;

-- O RLS do profissional (agendamento_proprio, paciente_do_profissional) faz
-- EXISTS em agendamento_profissional por profissional_id a cada linha lida.
-- A PK começa por agendamento_id e não serve a essa busca.
create index if not exists agendamento_profissional_profissional_id_idx
  on agendamento_profissional (profissional_id);

-- Gargalos por equipamento e exclusão segura de recurso buscam por aparelho.
create index if not exists agendamento_equipamento_equipamento_id_idx
  on agendamento_equipamento (equipamento_id);

-- Rentabilidade por procedimento e exclusão segura buscam por procedimento.
create index if not exists agendamento_procedimento_id_inicio_idx
  on agendamento (procedimento_id, inicio);
