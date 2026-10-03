import type { StatusAgendamento } from "@/lib/types/database";
import type { AgendamentoNaAgenda, ColunaRecurso } from "@/lib/consultas/agenda";

/** Diz se um agendamento ocupa aquele recurso. */
export function usaRecurso(a: AgendamentoNaAgenda, c: ColunaRecurso): boolean {
  if (c.tipo === "sala") return a.sala_id === c.id;
  if (c.tipo === "equipamento") return a.equipamentos.some((e) => e.id === c.id);
  return a.profissionais.some((p) => p.id === c.id);
}

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

/** "2026-10-05" + n dias. Conta em UTC para o fuso não deslocar a data. */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Os 7 dias da semana do dia dado, de segunda a domingo. */
export function diasDaSemana(dia: string): string[] {
  const dow = new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const segunda = somarDias(dia, -((dow + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
}

/**
 * Atendimentos que se sobrepõem na mesma coluna ficam lado a lado, como no
 * Google Calendar. `total` é o número de faixas do grupo sobreposto, para
 * calcular a largura; a faixa liberada é reaproveitada por quem vem depois.
 */
export function distribuirEmFaixas(
  itens: { id: string; inicio: number; fim: number }[],
): Map<string, { faixa: number; total: number }> {
  const resultado = new Map<string, { faixa: number; total: number }>();
  const ordenados = [...itens].sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);

  let grupo: string[] = [];
  let fimDoGrupo = -Infinity;
  let faixas: number[] = []; // fim do último atendimento de cada faixa

  const fecharGrupo = () => {
    for (const id of grupo) resultado.get(id)!.total = faixas.length;
    grupo = [];
    faixas = [];
  };

  for (const item of ordenados) {
    if (item.inicio >= fimDoGrupo) fecharGrupo();
    let faixa = faixas.findIndex((fim) => fim <= item.inicio);
    if (faixa === -1) {
      faixa = faixas.length;
      faixas.push(item.fim);
    } else {
      faixas[faixa] = item.fim;
    }
    resultado.set(item.id, { faixa, total: 0 });
    grupo.push(item.id);
    fimDoGrupo = Math.max(fimDoGrupo, item.fim);
  }
  fecharGrupo();
  return resultado;
}

/**
 * Dia de atendimento mais próximo depois (passo 1) ou antes (passo -1) de
 * `dia`, pelos dias em que a clínica abre. Sem dias cadastrados, o vizinho.
 */
export function diaDeAtendimento(dia: string, dias: readonly number[], passo: 1 | -1 = 1): string {
  let d = somarDias(dia, passo);
  for (let i = 0; i < 7 && dias.length > 0; i++) {
    if (dias.includes(new Date(`${d}T12:00:00Z`).getUTCDay())) return d;
    d = somarDias(d, passo);
  }
  return somarDias(dia, passo);
}
