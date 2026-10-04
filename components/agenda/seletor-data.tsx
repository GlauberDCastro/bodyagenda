"use client";

import { useEffect, useRef, useState } from "react";
import { atendimentosPorDiaAction } from "@/lib/actions/busca";
import { diasDaSemana, somarDias } from "@/lib/grade-agenda";

const SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const LONGO = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const mesDe = (dia: string) => dia.slice(0, 7);
const dow = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay();

/** "2026-10" ± n meses. */
function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** Mesmo dia em outro mês, sem passar do último dia dele (31/01 → 28/02). */
function mesmoDiaEm(dia: string, n: number): string {
  const mes = somarMeses(mesDe(dia), n);
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${mes}-${String(Math.min(Number(dia.slice(8)), ultimo)).padStart(2, "0")}`;
}

/** Seis semanas fixas (segunda a domingo) que cobrem o mês: o quadro não muda de altura. */
function grade(mes: string): string[][] {
  const inicio = diasDaSemana(`${mes}-01`)[0];
  return Array.from({ length: 6 }, (_, s) =>
    Array.from({ length: 7 }, (_, d) => somarDias(inicio, s * 7 + d)),
  );
}

function Seta({ direcao }: { direcao: "anterior" | "proximo" }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={direcao === "anterior" ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"} />
    </svg>
  );
}

const botaoNav =
  "grid size-9 place-items-center rounded-full text-[var(--tinta-2)] transition-colors hover:bg-[var(--superficie-2)] hover:text-[var(--tinta-1)]";

/**
 * Mini-calendário da agenda, como o do Google Agenda: a data por extenso abre
 * o mês, e um clique leva direto ao dia. Na semana, a linha inteira se
 * destaca; no mês, escolhe-se o mês do ano. Um ponto marca os dias com
 * atendimento; os dias em que a clínica não abre ficam apagados.
 *
 * Teclado: setas andam por dia e semana, Page Up/Down por mês, Enter escolhe,
 * Esc fecha e devolve o foco ao botão.
 */
export function SeletorData({
  dia,
  hoje,
  periodo,
  rotulo,
  diasAbertos,
  aoEscolher,
}: {
  dia: string;
  hoje: string;
  periodo: string;
  rotulo: string;
  diasAbertos: readonly number[];
  aoEscolher: (dia: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [foco, setFoco] = useState(dia);
  const [ano, setAno] = useState(Number(dia.slice(0, 4)));
  const [contagens, setContagens] = useState<Record<string, Record<string, number>>>({});
  const [semanaSobre, setSemanaSobre] = useState<number | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const gradeRef = useRef<HTMLDivElement>(null);

  const visto = mesDe(foco);
  const semanas = grade(visto);
  const contagem = contagens[visto];
  const modoMes = periodo === "mes";
  const semanaEscolhida = diasDaSemana(dia)[0];

  const abrir = () => {
    setFoco(dia);
    setAno(Number(dia.slice(0, 4)));
    setAberto(true);
  };
  const fechar = (devolverFoco = true) => {
    setAberto(false);
    setSemanaSobre(null);
    if (devolverFoco) gatilho.current?.focus();
  };
  const escolher = (d: string) => {
    fechar();
    if (d !== dia) aoEscolher(d);
  };

  // Atendimentos do mês à vista, uma busca por mês.
  useEffect(() => {
    if (!aberto || modoMes || contagens[visto]) return;
    let vivo = true;
    atendimentosPorDiaAction(visto).then((c) => {
      if (vivo) setContagens((atual) => ({ ...atual, [visto]: c }));
    });
    return () => {
      vivo = false;
    };
  }, [aberto, modoMes, visto, contagens]);

  // Clique fora fecha sem roubar o foco de onde a pessoa clicou.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) fechar(false);
    };
    window.addEventListener("pointerdown", fora);
    return () => window.removeEventListener("pointerdown", fora);
  }, [aberto]);

  // O dia em foco recebe o foco do teclado (um só botão do quadro é tabulável).
  useEffect(() => {
    if (!aberto || modoMes) return;
    gradeRef.current?.querySelector<HTMLButtonElement>(`[data-dia="${foco}"]`)?.focus();
  }, [aberto, modoMes, foco]);

  const teclado = (e: React.KeyboardEvent) => {
    const passos: Record<string, () => string> = {
      ArrowLeft: () => somarDias(foco, -1),
      ArrowRight: () => somarDias(foco, 1),
      ArrowUp: () => somarDias(foco, -7),
      ArrowDown: () => somarDias(foco, 7),
      PageUp: () => mesmoDiaEm(foco, -1),
      PageDown: () => mesmoDiaEm(foco, 1),
      Home: () => diasDaSemana(foco)[0],
      End: () => diasDaSemana(foco)[6],
    };
    if (passos[e.key]) {
      e.preventDefault();
      setFoco(passos[e.key]());
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      escolher(foco);
    }
  };

  return (
    <div
      ref={raiz}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && aberto) {
          e.stopPropagation();
          fechar();
        }
      }}
    >
      <button
        ref={gatilho}
        type="button"
        onClick={() => (aberto ? fechar() : abrir())}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={`${rotulo}. Escolher data`}
        className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--traco)] bg-[var(--superficie)] px-4 text-[14.5px] font-medium text-[var(--tinta-1)] transition-colors hover:bg-[var(--superficie-2)]"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden
          className="text-[var(--tinta-2)]"
        >
          <path d="M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
        </svg>
        {rotulo}
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label={modoMes ? "Escolher mês" : "Escolher dia"}
          className="cartao absolute left-0 top-full z-40 mt-2 w-[316px] p-3 shadow-[var(--sombra-3)]"
        >
          {modoMes ? (
            <>
              <div className="flex items-center justify-between pb-2">
                <button
                  type="button"
                  className={botaoNav}
                  onClick={() => setAno(ano - 1)}
                  aria-label="Ano anterior"
                >
                  <Seta direcao="anterior" />
                </button>
                <span className="text-[15px] font-semibold tabular-nums">{ano}</span>
                <button
                  type="button"
                  className={botaoNav}
                  onClick={() => setAno(ano + 1)}
                  aria-label="Próximo ano"
                >
                  <Seta direcao="proximo" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {MESES.map((nome, i) => {
                  const mes = `${ano}-${String(i + 1).padStart(2, "0")}`;
                  const escolhido = mes === mesDe(dia);
                  return (
                    <button
                      key={mes}
                      type="button"
                      onClick={() => escolher(`${mes}-01`)}
                      aria-pressed={escolhido}
                      className={`rounded-full py-2.5 text-[14px] capitalize transition-colors ${
                        escolhido
                          ? "bg-[var(--superficie-inversa)] font-medium text-[var(--tinta-inversa)]"
                          : mes === mesDe(hoje)
                            ? "font-medium text-[var(--marca)] hover:bg-[var(--superficie-2)]"
                            : "text-[var(--tinta-1)] hover:bg-[var(--superficie-2)]"
                      }`}
                    >
                      {nome.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between pb-1">
                <button
                  type="button"
                  className={botaoNav}
                  onClick={() => setFoco(mesmoDiaEm(foco, -1))}
                  aria-label="Mês anterior"
                >
                  <Seta direcao="anterior" />
                </button>
                <span className="text-[15px] font-semibold" aria-live="polite">
                  <span className="capitalize">{MESES.at(Number(visto.slice(5)) - 1)}</span>{" "}
                  <span className="tabular-nums">{visto.slice(0, 4)}</span>
                </span>
                <button
                  type="button"
                  className={botaoNav}
                  onClick={() => setFoco(mesmoDiaEm(foco, 1))}
                  aria-label="Próximo mês"
                >
                  <Seta direcao="proximo" />
                </button>
              </div>

              <div
                className="grid grid-cols-7 pb-1 text-center text-[11.5px] text-[var(--tinta-3)]"
                aria-hidden
              >
                {SEMANA.map((s) => (
                  <span key={s} className="py-1">
                    {s}
                  </span>
                ))}
              </div>

              <div
                ref={gradeRef}
                role="grid"
                aria-label="Dias do mês"
                onKeyDown={teclado}
                onMouseLeave={() => setSemanaSobre(null)}
              >
                {semanas.map((semana, s) => {
                  const destacada =
                    periodo === "semana" && (semana[0] === semanaEscolhida || semanaSobre === s);
                  return (
                    <div
                      key={semana[0]}
                      role="row"
                      onMouseEnter={() => periodo === "semana" && setSemanaSobre(s)}
                      className={`grid grid-cols-7 rounded-full ${destacada ? "bg-[var(--superficie-2)]" : ""}`}
                    >
                      {semana.map((d) => {
                        const doMes = mesDe(d) === visto;
                        const escolhido = periodo === "dia" ? d === dia : false;
                        const fechado = diasAbertos.length > 0 && !diasAbertos.includes(dow(d));
                        const n = contagem?.[d] ?? 0;
                        return (
                          <div key={d} role="gridcell" className="grid place-items-center py-0.5">
                            <button
                              type="button"
                              data-dia={d}
                              tabIndex={d === foco ? 0 : -1}
                              onClick={() => escolher(d)}
                              aria-pressed={escolhido}
                              aria-current={d === hoje ? "date" : undefined}
                              aria-label={`${LONGO.format(new Date(`${d}T12:00:00Z`))}${n ? `, ${n} atendimento(s)` : ""}${fechado ? ", clínica fechada" : ""}`}
                              className={`relative grid size-10 place-items-center rounded-full text-[14px] tabular-nums outline-offset-1 transition-colors ${
                                escolhido
                                  ? "bg-[var(--superficie-inversa)] font-semibold text-[var(--tinta-inversa)]"
                                  : d === hoje
                                    ? "font-semibold text-[var(--marca)] ring-[1.5px] ring-inset ring-[var(--marca)] hover:bg-[var(--superficie-2)]"
                                    : doMes && !fechado
                                      ? "text-[var(--tinta-1)] hover:bg-[var(--superficie)]"
                                      : "text-[var(--tinta-3)] hover:bg-[var(--superficie)]"
                              } ${doMes ? "" : "opacity-50"}`}
                            >
                              {Number(d.slice(8))}
                              {n > 0 && (
                                <span
                                  aria-hidden
                                  className="absolute bottom-1.5 size-1 rounded-full"
                                  style={{
                                    background: escolhido
                                      ? "var(--tinta-inversa)"
                                      : "var(--serie-1)",
                                  }}
                                />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="mt-2 flex items-center justify-between border-t border-[var(--traco)] pt-2.5 text-[12.5px] text-[var(--tinta-3)]">
            <span>
              {modoMes
                ? "Escolha o mês"
                : periodo === "semana"
                  ? "Clique para ver a semana"
                  : "Clique para ver o dia"}
            </span>
            <button
              type="button"
              onClick={() => escolher(hoje)}
              className="rounded-full px-3 py-1.5 text-[13px] font-medium text-[var(--tinta-1)] hover:bg-[var(--superficie-2)]"
            >
              Hoje
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
