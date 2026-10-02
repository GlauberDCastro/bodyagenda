import Link from "next/link";
import type { AgendamentoNaAgenda } from "@/lib/consultas/agenda";
import { diasDaSemana, somarDias } from "@/lib/grade-agenda";

const SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const diaDe = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));

/** Semanas (segunda a domingo) que cobrem o mês de `dia`. */
export function semanasDoMes(dia: string): string[][] {
  const primeiro = `${dia.slice(0, 7)}-01`;
  const semanas: string[][] = [];
  let segunda = diasDaSemana(primeiro)[0];
  while (segunda.slice(0, 7) <= dia.slice(0, 7)) {
    semanas.push(diasDaSemana(segunda));
    segunda = somarDias(segunda, 7);
  }
  return semanas;
}

/**
 * RF-40 · visão mês: quantos atendimentos há em cada dia. Clicar no dia abre
 * a visão do dia, onde se agenda e remarca.
 */
export function AgendaMes({
  dia,
  hoje,
  agendamentos,
  capacidade = [],
}: {
  dia: string;
  hoje: string;
  agendamentos: AgendamentoNaAgenda[];
  /** Capacidade de sala por dia, em horas: denominador da ocupação. */
  capacidade?: { dia: string; capacidade: number }[];
}) {
  const capacidadeDoDia = new Map(capacidade.map((c) => [c.dia, c.capacidade]));
  const porDia = new Map<string, AgendamentoNaAgenda[]>();
  for (const a of agendamentos) {
    if (a.status === "cancelado") continue;
    const d = diaDe(a.inicio);
    porDia.set(d, [...(porDia.get(d) ?? []), a]);
  }
  const mes = dia.slice(0, 7);

  return (
    <div className="cartao overflow-hidden">
      <div className="grid grid-cols-7 border-b border-[var(--traco)] text-[14px] font-semibold text-[var(--tinta-2)]">
        {SEMANA.map((s) => (
          <div key={s} className="px-3 py-3">
            {s}
          </div>
        ))}
      </div>
      {semanasDoMes(dia).map((semana) => (
        <div key={semana[0]} className="grid grid-cols-7 border-b border-[var(--traco)] last:border-0">
          {semana.map((d) => {
            const lista = porDia.get(d) ?? [];
            const realizados = lista.filter((a) => a.status === "realizado").length;
            const faltas = lista.filter((a) => a.status === "falta").length;
            const foraDoMes = d.slice(0, 7) !== mes;
            // Ocupação agendada: horas marcadas sobre a capacidade das salas no dia.
            const cap = capacidadeDoDia.get(d) ?? 0;
            const horas = lista.reduce(
              (t, a) => t + (new Date(a.fim).getTime() - new Date(a.inicio).getTime()) / 3_600_000,
              0,
            );
            const taxa = cap > 0 ? Math.min(1, horas / cap) : null;
            return (
              <Link
                key={d}
                href={`/agenda?dia=${d}&por=sala`}
                aria-label={`${d}: ${lista.length} atendimento(s)`}
                className={`flex min-h-32 flex-col gap-1.5 border-l border-[var(--traco)] p-3 transition-colors first:border-l-0 hover:bg-[var(--superficie-2)] ${
                  foraDoMes ? "opacity-45" : ""
                }`}
              >
                <span
                  className={`inline-grid size-8 place-items-center rounded-full text-[15px] font-medium tabular-nums ${
                    d === hoje
                      ? "bg-[var(--superficie-inversa)] text-[var(--tinta-inversa)]"
                      : "text-[var(--tinta-1)]"
                  }`}
                >
                  {Number(d.slice(8, 10))}
                </span>
                {taxa !== null && (
                  <div title={`Ocupação agendada: ${Math.round(taxa * 100)}%`}>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--superficie-2)]">
                      <div
                        className="h-full rounded-full bg-[var(--serie-1)]"
                        style={{ width: `${Math.max(taxa * 100, taxa > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                    {horas > 0 && (
                      <p className="mt-1 text-[12.5px] tabular-nums text-[var(--tinta-2)]">
                        {Math.max(1, Math.round(taxa * 100))}% ocupado
                      </p>
                    )}
                  </div>
                )}
                {lista.length > 0 && (
                  <div className="space-y-0.5 text-[13px] leading-snug">
                    <p className="font-semibold text-[var(--tinta-1)]">{lista.length} atendimento(s)</p>
                    {realizados > 0 && (
                      <p className="text-[var(--tinta-2)]">{realizados} realizado(s)</p>
                    )}
                    {faltas > 0 && (
                      <p style={{ color: "var(--status-critico)" }}>{faltas} falta(s)</p>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
