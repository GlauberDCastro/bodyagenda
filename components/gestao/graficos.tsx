import { brl } from "@/components/painel/indicadores";

/**
 * Barras horizontais de uma cor só: comparam magnitude entre poucas
 * categorias com rótulo escrito, então cor por categoria não acrescentaria
 * nada. O valor e a fatia ficam em texto ao lado — a barra mostra a forma.
 */
export function BarrasHorizontais({
  linhas,
}: {
  linhas: { rotulo: string; valor: number; detalhe: string }[];
}) {
  const max = Math.max(...linhas.map((l) => l.valor), 0);
  return (
    <ul className="space-y-4">
      {linhas.map((l) => (
        <li key={l.rotulo} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-[14px]">
            <span className="font-medium">{l.rotulo}</span>
            <span className="tabular-nums">
              <span className="font-semibold">{brl.format(l.valor)}</span>
              <span className="text-[var(--tinta-3)]"> · {l.detalhe}</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--superficie-2)]">
            <div
              className="h-full rounded-full bg-[var(--serie-1)]"
              style={{
                width: `${max > 0 ? Math.max((l.valor / max) * 100, l.valor > 0 ? 2 : 0) : 0}%`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

const diaCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/**
 * Valor vendido por dia: colunas finas, cantos de 4px no topo, ancoradas na
 * base. Passar o mouse mostra o dia e o valor (title nativo, acessível).
 * Rótulo no eixo só no primeiro, no meio e no último dia: o resto polui.
 */
export function ColunasPorDia({ pontos }: { pontos: { dia: string; valor: number }[] }) {
  const max = Math.max(...pontos.map((p) => p.valor), 0);
  if (max === 0) {
    return (
      <p className="py-10 text-center text-[13.5px] text-[var(--tinta-3)]">
        Nenhuma venda no período.
      </p>
    );
  }
  const marcados = new Set([0, Math.floor((pontos.length - 1) / 2), pontos.length - 1]);
  return (
    <figure className="space-y-2">
      <div
        className="flex h-40 items-end gap-[2px]"
        role="img"
        aria-label={`Vendas por dia: maior valor ${brl.format(max)}`}
      >
        {pontos.map((p) => (
          <div key={p.dia} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t-[4px] bg-[var(--serie-1)] transition-opacity group-hover:opacity-80"
              style={{ height: `${p.valor > 0 ? Math.max((p.valor / max) * 100, 2) : 0}%` }}
              title={`${diaCurto(p.dia)}: ${brl.format(p.valor)}`}
            />
          </div>
        ))}
      </div>
      <div className="flex text-[11.5px] tabular-nums text-[var(--tinta-3)]">
        {pontos.map((p, i) => (
          <span key={p.dia} className="flex-1 text-center">
            {marcados.has(i) ? diaCurto(p.dia) : ""}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Funil em degraus: cada etapa com o número e quanto passou da anterior. */
export function Funil({ etapas }: { etapas: { rotulo: string; valor: number; apoio?: string }[] }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {etapas.map((e, i) => {
        const anterior = i > 0 ? etapas[i - 1].valor : null;
        return (
          <li key={e.rotulo} className="rounded-[var(--r-lg)] bg-[var(--superficie-2)] px-4 py-3.5">
            <p className="text-[13px] text-[var(--tinta-2)]">{e.rotulo}</p>
            <p className="mt-1 text-[26px] font-semibold tabular-nums leading-tight">{e.valor}</p>
            <p className="mt-0.5 text-[12.5px] text-[var(--tinta-3)]">
              {e.apoio ??
                (anterior ? `${Math.round((e.valor / anterior) * 100)}% da etapa anterior` : " ")}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
