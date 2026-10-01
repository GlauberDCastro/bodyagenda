import type { StatusAgendamento } from "@/lib/types/database";

/** Geometria da timeline: onde começa, quantos px vale uma hora, o passo. */
export interface Grade {
  horaInicio: number;
  alturaHora: number;
  passo: number;
}

/** Minuto do dia (desde 00:00) sob o ponteiro, arredondado para baixo no passo. */
export function minutoNaGrade(y: number, g: Grade): number {
  const minutos = (y / g.alturaHora) * 60;
  return g.horaInicio * 60 + Math.floor(minutos / g.passo) * g.passo;
}

/** Arraste vertical em px → minutos, encaixado no passo mais próximo. */
export function deslocamentoEmMinutos(dy: number, g: Grade): number {
  const minutos = (dy / g.alturaHora) * 60;
  return Math.round(minutos / g.passo) * g.passo || 0;
}

/** "2026-10-06T09:05": o formato do datetime-local, no horário da clínica. */
export function horarioLocal(dia: string, minutoDoDia: number): string {
  const h = String(Math.floor(minutoDoDia / 60)).padStart(2, "0");
  const m = String(minutoDoDia % 60).padStart(2, "0");
  return `${dia}T${h}:${m}`;
}

/** Realizado, falta e em atendimento são histórico: não se remarca. */
export function podeArrastar(status: StatusAgendamento): boolean {
  return status === "agendado" || status === "confirmado";
}

/** O atendimento cabe inteiro na faixa de horas exibida? */
export function dentroDoExpedienteExibido(
  inicioMin: number,
  duracaoMin: number,
  horaInicio: number,
  horaFim: number,
): boolean {
  return inicioMin >= horaInicio * 60 && inicioMin + duracaoMin <= horaFim * 60;
}
