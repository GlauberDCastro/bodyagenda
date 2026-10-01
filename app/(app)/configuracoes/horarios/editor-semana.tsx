"use client";

import { NOMES_DIA, type DiaDaSemana } from "@/lib/horarios";
import { Input } from "@/components/ui/primitivos";

/** Uma linha por dia: atende ou não, e de que horas a que horas. */
export function EditorSemana({
  semana,
  aoMudar,
}: {
  semana: DiaDaSemana[];
  aoMudar: (semana: DiaDaSemana[]) => void;
}) {
  const atualizar = (dia: number, parcial: Partial<DiaDaSemana>) =>
    aoMudar(semana.map((d) => (d.dia === dia ? { ...d, ...parcial } : d)));

  return (
    <div className="divide-y divide-[var(--traco)] rounded-[var(--r-md)] border border-[var(--traco)]">
      {semana.map((d) => (
        <div key={d.dia} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
          <label className="flex w-20 shrink-0 items-center gap-2 text-[13.5px]">
            <input
              type="checkbox"
              checked={d.aberto}
              onChange={(e) => atualizar(d.dia, { aberto: e.target.checked })}
              aria-label={`Atende ${NOMES_DIA[d.dia]}`}
            />
            <span className={d.aberto ? "font-medium" : "text-[var(--tinta-3)]"}>
              {NOMES_DIA[d.dia]}
            </span>
          </label>
          {d.aberto ? (
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={d.inicio}
                onChange={(e) => atualizar(d.dia, { inicio: e.target.value })}
                aria-label={`Início ${NOMES_DIA[d.dia]}`}
                className="w-28"
              />
              <span className="text-[13px] text-[var(--tinta-3)]">às</span>
              <Input
                type="time"
                value={d.fim}
                onChange={(e) => atualizar(d.dia, { fim: e.target.value })}
                aria-label={`Fim ${NOMES_DIA[d.dia]}`}
                className="w-28"
              />
            </div>
          ) : (
            <span className="text-[13px] text-[var(--tinta-3)]">Fechado</span>
          )}
        </div>
      ))}
    </div>
  );
}
