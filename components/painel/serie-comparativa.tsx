"use client";

import { useState } from "react";

export interface PontoSerie {
  dia: string;
  /** Ocupação efetiva do dia (0–1), ou null se o dia não tinha capacidade. */
  taxa: number | null;
}

const ALTURA = 180;
const MARGEM = { topo: 12, direita: 92, base: 24, esquerda: 36 };
const pct = (v: number | null) =>
  v === null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: v < 0.1 ? 1 : 0 })}%`;
const curto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/**
 * RF-75 · ocupação efetiva dia a dia contra o período anterior de mesmo
 * tamanho. Forma de ênfase: o período atual no azul de série, o anterior em
 * cinza de contexto. Um eixo só, em %.
 */
export function SerieComparativa({
  atual,
  anterior,
  largura = 720,
}: {
  atual: PontoSerie[];
  anterior: PontoSerie[];
  largura?: number;
}) {
  const [foco, setFoco] = useState<number | null>(null);
  const n = atual.length;
  if (n < 2) return null;

  // Eixo acompanha os dados em degraus redondos (10%, 20%, 25%, 50%, 100%):
  // ocupação de 8% num eixo até 100% vira uma linha colada no zero.
  const maiorValor = Math.max(0, ...[...atual, ...anterior].map((p) => p.taxa ?? 0));
  const maximo = [0.1, 0.2, 0.25, 0.5, 0.75, 1].find((m) => maiorValor <= m * 0.9) ?? Math.max(1, maiorValor);
  const larguraUtil = largura - MARGEM.esquerda - MARGEM.direita;
  const alturaUtil = ALTURA - MARGEM.topo - MARGEM.base;
  const x = (i: number) => MARGEM.esquerda + (i / (n - 1)) * larguraUtil;
  const y = (v: number) => MARGEM.topo + alturaUtil - (v / maximo) * alturaUtil;

  /** Dias sem capacidade (fechado) quebram a linha em vez de cair a zero. */
  const caminho = (serie: PontoSerie[]) => {
    let d = "";
    let aberto = false;
    serie.slice(0, n).forEach((p, i) => {
      if (p.taxa === null) {
        aberto = false;
        return;
      }
      d += `${aberto ? "L" : "M"}${x(i).toFixed(1)},${y(p.taxa).toFixed(1)} `;
      aberto = true;
    });
    return d;
  };

  const ultimo = (serie: PontoSerie[]) => {
    for (let i = Math.min(serie.length, n) - 1; i >= 0; i--) {
      if (serie[i].taxa !== null) return { i, v: serie[i].taxa as number };
    }
    return null;
  };
  const fimAtual = ultimo(atual);
  const fimAnterior = ultimo(anterior);
  const linhasGrade = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maximo);

  return (
    <div className="space-y-3">
      {/* Legenda: duas séries, identidade nunca só pela cor. */}
      <div className="flex flex-wrap gap-4 text-[12.5px] text-[var(--tinta-2)]">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full bg-[var(--serie-1)]" />
          Este período
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full bg-[var(--tinta-3)]" />
          Período anterior
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${largura} ${ALTURA}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Ocupação efetiva por dia: este período termina em ${pct(fimAtual?.v ?? null)}, o anterior terminou em ${pct(fimAnterior?.v ?? null)}.`}
          onMouseLeave={() => setFoco(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * largura;
            const i = Math.round(((px - MARGEM.esquerda) / larguraUtil) * (n - 1));
            setFoco(Math.max(0, Math.min(n - 1, i)));
          }}
        >
          {linhasGrade.map((v) => (
            <g key={v}>
              <line
                x1={MARGEM.esquerda}
                x2={largura - MARGEM.direita}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--traco)"
                strokeWidth={1}
              />
              <text
                x={MARGEM.esquerda - 6}
                y={y(v) + 3.5}
                textAnchor="end"
                fontSize={10.5}
                fill="var(--tinta-3)"
              >
                {pct(v)}
              </text>
            </g>
          ))}
          {[0, Math.floor((n - 1) / 2), n - 1].map((i) => (
            <text
              key={i}
              x={x(i)}
              y={ALTURA - 6}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              fontSize={10.5}
              fill="var(--tinta-3)"
            >
              {curto(atual[i].dia)}
            </text>
          ))}

          <path d={caminho(anterior)} fill="none" stroke="var(--tinta-3)" strokeWidth={1.5} />
          <path d={caminho(atual)} fill="none" stroke="var(--serie-1)" strokeWidth={2} />

          {/* Rótulos diretos no fim de cada linha. */}
          {fimAtual && (
            <text x={x(fimAtual.i) + 8} y={y(fimAtual.v) + 4} fontSize={11} fill="var(--tinta-1)">
              {pct(fimAtual.v)} atual
            </text>
          )}
          {fimAnterior && (
            <text
              x={x(fimAnterior.i) + 8}
              y={y(fimAnterior.v) + (fimAtual && Math.abs(y(fimAtual.v) - y(fimAnterior.v)) < 14 ? 16 : 4)}
              fontSize={11}
              fill="var(--tinta-3)"
            >
              {pct(fimAnterior.v)} anterior
            </text>
          )}

          {foco !== null && (
            <g pointerEvents="none">
              <line
                x1={x(foco)}
                x2={x(foco)}
                y1={MARGEM.topo}
                y2={MARGEM.topo + alturaUtil}
                stroke="var(--tinta-3)"
                strokeWidth={1}
              />
              {atual[foco]?.taxa !== null && atual[foco] && (
                <circle
                  cx={x(foco)}
                  cy={y(atual[foco].taxa as number)}
                  r={4}
                  fill="var(--serie-1)"
                  stroke="var(--superficie)"
                  strokeWidth={2}
                />
              )}
              {anterior[foco] && anterior[foco].taxa !== null && (
                <circle
                  cx={x(foco)}
                  cy={y(anterior[foco].taxa as number)}
                  r={4}
                  fill="var(--tinta-3)"
                  stroke="var(--superficie)"
                  strokeWidth={2}
                />
              )}
            </g>
          )}
        </svg>

        {foco !== null && (
          <div
            className="pointer-events-none absolute top-0 rounded-[var(--r-md)] bg-[var(--superficie)] px-3 py-2 text-[12px] shadow-[var(--sombra-3)]"
            style={{
              left: `${(x(foco) / largura) * 100}%`,
              transform: foco > n / 2 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
            }}
          >
            <p className="font-medium text-[var(--tinta-1)]">{curto(atual[foco].dia)}</p>
            <p className="text-[var(--tinta-2)]">Este período: {pct(atual[foco].taxa)}</p>
            {anterior[foco] && (
              <p className="text-[var(--tinta-3)]">
                {curto(anterior[foco].dia)}: {pct(anterior[foco].taxa)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* A mesma informação em tabela, para quem não lê o gráfico. */}
      <details className="text-[12.5px] text-[var(--tinta-2)]">
        <summary className="cursor-pointer">Ver dados</summary>
        <table className="mt-2 w-full max-w-md text-[12.5px]">
          <thead>
            <tr className="text-left text-[var(--tinta-3)]">
              <th className="py-1 font-medium">Dia</th>
              <th className="py-1 text-right font-medium">Este período</th>
              <th className="py-1 text-right font-medium">Anterior</th>
            </tr>
          </thead>
          <tbody>
            {atual.map((p, i) => (
              <tr key={p.dia} className="border-t border-[var(--traco)]">
                <td className="py-1 tabular-nums">{curto(p.dia)}</td>
                <td className="py-1 text-right tabular-nums">{pct(p.taxa)}</td>
                <td className="py-1 text-right tabular-nums">{pct(anterior[i]?.taxa ?? null)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
