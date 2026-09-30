/**
 * Aliases de conveniência sobre os tipos GERADOS do banco.
 *
 * A fonte de verdade é `supabase.ts`, produzido por
 * `supabase gen types typescript --db-url $DATABASE_URL` direto do schema.
 * Nada aqui é escrito à mão: tipo manual diverge do banco com o tempo, e foi
 * exatamente um cast manual que escondeu um insert sem `modelo` em
 * duplicarEquipamento() até os tipos reais entrarem.
 *
 * Para regenerar depois de uma migração:
 *   npx supabase gen types typescript --db-url "$DATABASE_URL" > lib/types/supabase.ts
 */

import type { Database } from "./supabase";

type Tabelas = Database["public"]["Tables"];
type Enums = Database["public"]["Enums"];

export type PerfilUsuario = Enums["perfil_usuario"];
export type TipoRecurso = Enums["tipo_recurso"];
export type AlocacaoSala = Enums["alocacao_sala"];
export type AlocacaoEquipamento = Enums["alocacao_equipamento"];
export type MotivoBloqueio = Enums["motivo_bloqueio"];
export type TipoCusto = Enums["tipo_custo"];
export type TipoComissao = Enums["tipo_comissao"];
export type StatusAgendamento = Enums["status_agendamento"];
export type StatusPacote = Enums["status_pacote"];

export type Usuario = Tabelas["usuario"]["Row"];
export type Procedimento = Tabelas["procedimento"]["Row"];
export type ProcedimentoCusto = Tabelas["procedimento_custo"]["Row"];
export type ProcedimentoRequisito = Tabelas["procedimento_requisito"]["Row"];
export type Sala = Tabelas["sala"]["Row"];
export type Equipamento = Tabelas["equipamento"]["Row"];
export type EquipamentoCusto = Tabelas["equipamento_custo"]["Row"];
export type Profissional = Tabelas["profissional"]["Row"];
export type ProfissionalRemuneracao = Tabelas["profissional_remuneracao"]["Row"];
export type RecursoDisponibilidade = Tabelas["recurso_disponibilidade"]["Row"];
export type RecursoBloqueio = Tabelas["recurso_bloqueio"]["Row"];
export type Paciente = Tabelas["paciente"]["Row"];
export type Pacote = Tabelas["pacote"]["Row"];
export type Agendamento = Tabelas["agendamento"]["Row"];
export type Reserva = Tabelas["reserva"]["Row"];

export const DIAS_SEMANA = [
  { valor: 0, curto: "Dom", longo: "Domingo" },
  { valor: 1, curto: "Seg", longo: "Segunda-feira" },
  { valor: 2, curto: "Ter", longo: "Terça-feira" },
  { valor: 3, curto: "Qua", longo: "Quarta-feira" },
  { valor: 4, curto: "Qui", longo: "Quinta-feira" },
  { valor: 5, curto: "Sex", longo: "Sexta-feira" },
  { valor: 6, curto: "Sáb", longo: "Sábado" },
] as const;

export const MOTIVOS_BLOQUEIO: Record<MotivoBloqueio, string> = {
  manutencao: "Manutenção",
  ferias: "Férias",
  folga: "Folga",
  outro: "Outro",
};

export const LABEL_TIPO_RECURSO: Record<TipoRecurso, string> = {
  sala: "Sala",
  equipamento: "Equipamento",
  profissional: "Profissional",
};
