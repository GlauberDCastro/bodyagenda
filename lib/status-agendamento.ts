import type { StatusAgendamento } from "@/lib/types/database";

/**
 * Cor de cada status do atendimento.
 *
 * Usa a paleta de status (fixa, nunca tematizada) em vez de cores cruas: os
 * mesmos tons do resto do sistema, e os passos escuros funcionam sobre a
 * superfície escura em vez de serem uma inversão automática.
 *
 * O status sempre aparece também por escrito, porque cor sozinha não carrega estado.
 */
export const COR_STATUS: Record<StatusAgendamento, string | null> = {
  agendado: "var(--tinta-3)",
  confirmado: "var(--serie-1)",
  em_atendimento: "var(--status-atencao)",
  realizado: "var(--status-bom)",
  falta: "var(--status-critico)",
  cancelado: null,
};

export const ROTULO_STATUS: Record<StatusAgendamento, string> = {
  agendado: "A confirmar",
  confirmado: "Confirmado",
  em_atendimento: "Em atendimento",
  realizado: "Realizado",
  falta: "Falta",
  cancelado: "Cancelado",
};

/** Status que encerram o atendimento: já geraram cobrança, bonificação ou baixa. */
export const FINALIZADOS: StatusAgendamento[] = ["realizado", "falta", "cancelado"];
