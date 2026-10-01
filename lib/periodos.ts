import { diasDaSemana, somarDias } from "@/lib/grade-agenda";

export interface Atalho {
  chave: "hoje" | "semana" | "mes" | "mes_passado";
  rotulo: string;
  de: string;
  ate: string;
}

/** Último dia do mês de "2026-10-14" → "2026-10-31". */
function fimDoMes(dia: string): string {
  const [ano, mes] = dia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
}

/** RF-72 · atalhos de período a partir de "hoje" no fuso da clínica. */
export function atalhosDePeriodo(hoje: string): Atalho[] {
  const semana = diasDaSemana(hoje);
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const inicioMesPassado = `${somarDias(inicioMes, -1).slice(0, 7)}-01`;
  return [
    { chave: "hoje", rotulo: "Hoje", de: hoje, ate: hoje },
    { chave: "semana", rotulo: "Esta semana", de: semana[0], ate: semana[6] },
    { chave: "mes", rotulo: "Este mês", de: inicioMes, ate: fimDoMes(hoje) },
    {
      chave: "mes_passado",
      rotulo: "Mês passado",
      de: inicioMesPassado,
      ate: fimDoMes(inicioMesPassado),
    },
  ];
}

/** RF-75 · o intervalo de mesmo tamanho imediatamente anterior. */
export function periodoAnterior(de: string, ate: string): { de: string; ate: string } {
  const dias =
    Math.round(
      (new Date(`${ate}T12:00:00Z`).getTime() - new Date(`${de}T12:00:00Z`).getTime()) /
        86_400_000,
    ) + 1;
  return { de: somarDias(de, -dias), ate: somarDias(de, -1) };
}
