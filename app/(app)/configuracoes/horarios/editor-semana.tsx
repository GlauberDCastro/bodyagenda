"use client";

import { NOMES_DIA, type DiaDaSemana, type Faixa } from "@/lib/horarios";
import { Input } from "@/components/ui/primitivos";

/**
 * Uma linha por dia: atende ou não, e em quais faixas (RF-24) — várias, para
 * a pausa de almoço ou um turno partido.
 */
export function EditorSemana({
  semana,
  aoMudar,
}: {
  semana: DiaDaSemana[];
  aoMudar: (semana: DiaDaSemana[]) => void;
}) {
  const atualizar = (dia: number, parcial: Partial<DiaDaSemana>) =>
    aoMudar(semana.map((d) => (d.dia === dia ? { ...d, ...parcial } : d)));

  const mudarFaixa = (d: DiaDaSemana, i: number, parcial: Partial<Faixa>) =>
    atualizar(d.dia, { faixas: d.faixas.map((f, j) => (j === i ? { ...f, ...parcial } : f)) });

  return (
    <div className="divide-y divide-[var(--traco)] rounded-[var(--r-md)] border border-[var(--traco)]">
      {semana.map((d) => (
        <div key={d.dia} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-3 py-2">
          <label className="flex h-9 w-20 shrink-0 items-center gap-2 text-[13.5px]">
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
            <div className="space-y-1.5">
              {d.faixas.map((f, i) => {
                const sufixo = i === 0 ? "" : ` faixa ${i + 1}`;
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <Input
                      type="time"
                      value={f.inicio}
                      onChange={(e) => mudarFaixa(d, i, { inicio: e.target.value })}
                      aria-label={`Início ${NOMES_DIA[d.dia]}${sufixo}`}
                      className="w-28"
                    />
                    <span className="text-[13px] text-[var(--tinta-3)]">às</span>
                    <Input
                      type="time"
                      value={f.fim}
                      onChange={(e) => mudarFaixa(d, i, { fim: e.target.value })}
                      aria-label={`Fim ${NOMES_DIA[d.dia]}${sufixo}`}
                      className="w-28"
                    />
                    {d.faixas.length > 1 && (
                      <button
                        type="button"
                        onClick={() => atualizar(d.dia, { faixas: d.faixas.filter((_, j) => j !== i) })}
                        aria-label={`Remover faixa ${i + 1} de ${NOMES_DIA[d.dia]}`}
                        className="grid size-7 place-items-center rounded-full text-[var(--tinta-3)] hover:bg-[var(--superficie-2)] hover:text-[var(--tinta-1)]"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  const ultima = d.faixas.at(-1);
                  atualizar(d.dia, {
                    faixas: [...d.faixas, { inicio: ultima?.fim ?? "", fim: "" }],
                  });
                }}
                className="text-[12.5px] text-[var(--tinta-3)] underline-offset-4 hover:text-[var(--tinta-1)] hover:underline"
              >
                + faixa
              </button>
            </div>
          ) : (
            <span className="flex h-9 items-center text-[13px] text-[var(--tinta-3)]">Fechado</span>
          )}
        </div>
      ))}
    </div>
  );
}
