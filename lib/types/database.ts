/**
 * Tipos do banco, espelhando supabase/migrations/.
 *
 * Escritos à mão porque o `supabase gen types` exige acesso ao banco, que
 * ainda não temos. Quando as migrações forem aplicadas, este arquivo deve ser
 * substituído pelo gerado — tipo escrito à mão diverge do schema com o tempo.
 */

export type PerfilUsuario = "admin" | "recepcao" | "profissional";
export type TipoRecurso = "sala" | "equipamento" | "profissional";
export type AlocacaoSala = "dedicada" | "flexivel";
export type AlocacaoEquipamento = "fixo" | "movel";
export type MotivoBloqueio = "manutencao" | "ferias" | "folga" | "outro";
export type TipoCusto = "insumo" | "mao_de_obra" | "equipamento" | "outro";
export type TipoComissao = "percentual" | "valor_fixo" | "nenhuma";

export type StatusAgendamento =
  | "agendado"
  | "confirmado"
  | "em_atendimento"
  | "realizado"
  | "falta"
  | "cancelado";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  ativo: boolean;
  ultimo_acesso: string | null;
}

export interface Procedimento {
  id: string;
  nome: string;
  descricao: string | null;
  duracao_min: number;
  buffer_min: number;
  sessoes_padrao: number;
  valor_sessao: number;
  intervalo_min_dias: number;
  ativo: boolean;
}

export interface Sala {
  id: string;
  numero: number;
  nome: string;
  descricao: string | null;
  tipo_alocacao: AlocacaoSala;
  procedimento_fixo_id: string | null;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  ativo: boolean;
}

export interface Equipamento {
  id: string;
  nome: string;
  /** Agrupa unidades: "Ultraformer" cobre as 4 unidades (RF-21c). */
  modelo: string;
  numero_serie: string | null;
  tipo_alocacao: AlocacaoEquipamento;
  sala_id: string | null;
  custo_aquisicao: number | null;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  ativo: boolean;
}

export interface Profissional {
  id: string;
  usuario_id: string | null;
  nome: string;
  cpf: string | null;
  especialidade: string | null;
  cor_agenda: string;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  ativo: boolean;
}

export interface RecursoDisponibilidade {
  id: string;
  recurso_tipo: TipoRecurso;
  recurso_id: string;
  /** 0 = domingo … 6 = sábado */
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
}

export interface RecursoBloqueio {
  id: string;
  recurso_tipo: TipoRecurso;
  recurso_id: string;
  inicio: string;
  fim: string;
  motivo: MotivoBloqueio;
  observacao: string | null;
}

/** Tabela separada porque o RLS é row-level (SPEC §3.2). Só admin alcança. */
export interface EquipamentoCusto {
  equipamento_id: string;
  custo_hora: number;
}

export interface ProfissionalRemuneracao {
  profissional_id: string;
  custo_hora: number;
  comissao_tipo: TipoComissao;
  comissao_valor: number;
}

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
