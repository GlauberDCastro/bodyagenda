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
}: {
  dia: string;
  hoje: string;
  agendamentos: AgendamentoNaAgenda[];
}) {
  const porDia = new Map<string, AgendamentoNaAgenda[]>();
  for (const a of agendamentos) {
    if (a.status === "cancelado") continue;
    const d = diaDe(a.inicio);
    porDia.set(d, [...(porDia.get(d) ?? []), a]);
  }
  const mes = dia.slice(0, 7);

  return (
    <div className="cartao overflow-hidden">
      <div className="grid grid-cols-7 border-b border-[var(--traco)] text-[12px] font-medium text-[var(--tinta-3)]">
        {SEMANA.map((s) => (
          <div key={s} className="px-2 py-2">
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
            return (
              <Link
                key={d}
                href={`/agenda?dia=${d}&por=sala`}
                aria-label={`${d}: ${lista.length} atendimento(s)`}
                className={`min-h-24 border-l border-[var(--traco)] p-2 transition-colors first:border-l-0 hover:bg-[var(--superficie-2)] ${
                  foraDoMes ? "text-[var(--tinta-3)] opacity-60" : ""
                }`}
              >
                <span
                  className={`inline-grid size-6 place-items-center rounded-full text-[12.5px] tabular-nums ${
                    d === hoje
                      ? "bg-[var(--superficie-inversa)] font-medium text-[var(--tinta-inversa)]"
                      : ""
                  }`}
                >
                  {Number(d.slice(8, 10))}
                </span>
                {lista.length > 0 && (
                  <div className="mt-1 space-y-0.5 text-[11.5px] leading-tight">
                    <p className="font-medium text-[var(--tinta-1)]">{lista.length} atendimento(s)</p>
                    {realizados > 0 && <p className="text-[var(--tinta-3)]">{realizados} realizado(s)</p>}
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
