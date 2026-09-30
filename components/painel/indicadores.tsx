import type { LinhaPainel } from "@/lib/consultas/painel";

export const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
export const brlExato = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function pct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(1)}%`;
}

export function horas(v: number): string {
  return `${v.toFixed(1)} h`;
}

export function Cartao({
  rotulo,
  valor,
  apoio,
  destaque,
}: {
  rotulo: string;
  valor: string;
  apoio?: string;
  destaque?: "neutro" | "atencao" | "bom";
}) {
  const cor =
    destaque === "atencao"
      ? "text-amber-700 dark:text-amber-400"
      : destaque === "bom"
        ? "text-emerald-700 dark:text-emerald-400"
        : "";

  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">{rotulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${cor}`}>
        {valor}
      </p>
      {apoio && (
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{apoio}</p>
      )}
    </div>
  );
}

/** Barra dupla: agendada atrás, efetiva na frente. A diferença é o no-show. */
export function BarraOcupacao({
  agendada,
  efetiva,
}: {
  agendada: number | null;
  efetiva: number | null;
}) {
  const a = Math.min(1, agendada ?? 0);
  const e = Math.min(1, efetiva ?? 0);

  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div
        className="absolute inset-y-0 left-0 bg-slate-300 dark:bg-slate-600"
        style={{ width: `${a * 100}%` }}
        title={`Agendada: ${pct(agendada)}`}
      />
      <div
        className="absolute inset-y-0 left-0 bg-slate-900 dark:bg-slate-100"
        style={{ width: `${e * 100}%` }}
        title={`Efetiva: ${pct(efetiva)}`}
      />
    </div>
  );
}

/**
 * RF-74 · ranking de recursos.
 *
 * Mostra ocupação E receita por hora lado a lado de propósito: é o cruzamento
 * que revela a sala 100% cheia gerando um vigésimo do que a sala meio vazia
 * gera (PRD Anexo B).
 */
export function TabelaRecursos({ linhas }: { linhas: LinhaPainel[] }) {
  if (linhas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Nenhum recurso ativo no período.
      </div>
    );
  }

  const ordenadas = [...linhas].sort(
    (a, b) => (Number(b.taxa_efetiva) || 0) - (Number(a.taxa_efetiva) || 0),
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-left dark:border-slate-800">
          <tr className="text-slate-500 dark:text-slate-400">
            <th className="px-4 py-2.5 font-medium">Recurso</th>
            <th className="px-4 py-2.5 font-medium">Ocupação</th>
            <th className="px-4 py-2.5 text-right font-medium">Efetiva</th>
            <th className="px-4 py-2.5 text-right font-medium">Ociosas</th>
            <th className="px-4 py-2.5 text-right font-medium">Sessões</th>
            <th className="px-4 py-2.5 text-right font-medium">Receita</th>
            <th className="px-4 py-2.5 text-right font-medium">R$/hora disp.</th>
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((l) => (
            <tr
              key={l.recurso_id}
              className="border-b border-slate-100 last:border-0 dark:border-slate-900"
            >
              <td className="px-4 py-2.5">
                <p className="font-medium">{l.nome}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{l.agrupador}</p>
              </td>
              <td className="w-40 px-4 py-2.5">
                <BarraOcupacao agendada={l.taxa_agendada} efetiva={l.taxa_efetiva} />
                <p className="mt-1 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {horas(Number(l.realizadas_h))} de {horas(Number(l.capacidade_h))}
                </p>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{pct(l.taxa_efetiva)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400">
                {horas(Number(l.ociosidade_h))}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {l.atendimentos}
                {l.faltas > 0 && (
                  <span className="text-amber-700 dark:text-amber-400">
                    {" "}
                    +{l.faltas} falta{l.faltas > 1 ? "s" : ""}
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {brl.format(Number(l.receita))}
              </td>
              <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                {l.receita_por_hora === null ? "—" : brl.format(Number(l.receita_por_hora))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
