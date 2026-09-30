import type { CelulaCalor } from "@/lib/consultas/painel";
import { DIAS_SEMANA } from "@/lib/types/database";

/**
 * RF-73 · mapa de calor dia × faixa horária.
 *
 * O que interessa aqui não são os picos — são os vales. Cada célula clara em
 * horário de funcionamento é capacidade instalada parada, que a clínica paga
 * de qualquer jeito.
 */
export function MapaCalor({
  celulas,
  horaInicio = 8,
  horaFim = 19,
}: {
  celulas: CelulaCalor[];
  horaInicio?: number;
  horaFim?: number;
}) {
  const horas = Array.from({ length: horaFim - horaInicio }, (_, i) => horaInicio + i);
  const mapa = new Map(celulas.map((c) => [`${c.dia_semana}-${c.hora}`, c]));
  const maximo = Math.max(1, ...celulas.map((c) => c.atendimentos));

  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <thead>
          <tr>
            <th className="w-10" />
            {horas.map((h) => (
              <th
                key={h}
                className="px-0.5 pb-1 font-normal tabular-nums text-slate-400"
              >
                {String(h).padStart(2, "0")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DIAS_SEMANA.map((d) => (
            <tr key={d.valor}>
              <td className="pr-2 text-right text-slate-500 dark:text-slate-400">
                {d.curto}
              </td>
              {horas.map((h) => {
                const c = mapa.get(`${d.valor}-${h}`);
                const n = c?.atendimentos ?? 0;
                const intensidade = n / maximo;
                return (
                  <td key={h} className="p-0.5">
                    <div
                      className="size-6 rounded-sm border border-slate-200 dark:border-slate-800"
                      style={{
                        backgroundColor:
                          n === 0
                            ? "transparent"
                            : `color-mix(in oklab, var(--cor-calor) ${Math.round(15 + intensidade * 85)}%, transparent)`,
                      }}
                      title={
                        n === 0
                          ? `${d.longo} ${h}:00 — vago`
                          : `${d.longo} ${h}:00 — ${n} atendimento(s), ${Number(c?.horas ?? 0).toFixed(1)} h`
                      }
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Células vazias em horário de funcionamento são capacidade parada.
      </p>
    </div>
  );
}
