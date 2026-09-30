import type { CelulaCalor } from "@/lib/consultas/painel";
import { DIAS_SEMANA } from "@/lib/types/database";

/**
 * RF-73 · mapa de calor dia × faixa horária.
 *
 * Codificação SEQUENCIAL: um hue só, claro → escuro, proporcional à magnitude.
 * Nada de arco-íris — matiz variável aqui sugeriria categorias onde só existe
 * intensidade.
 *
 * O que interessa não são os picos, são os vales: célula clara em horário de
 * funcionamento é capacidade instalada parada, que a clínica paga do mesmo jeito.
 */

/** Rampa azul 100→700, os passos validados para magnitude contínua. */
const RAMPA = [
  "var(--seq-100)",
  "var(--seq-250)",
  "var(--seq-400)",
  "var(--seq-550)",
  "var(--seq-700)",
];

function passo(intensidade: number): string {
  if (intensidade <= 0) return "transparent";
  const i = Math.min(RAMPA.length - 1, Math.floor(intensidade * RAMPA.length));
  return RAMPA[i];
}

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
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="text-[11px]">
          <thead>
            <tr>
              <th className="w-9" />
              {horas.map((h) => (
                <th
                  key={h}
                  className="px-0.5 pb-1.5 font-normal tabular-nums text-[var(--tinta-3)]"
                >
                  {String(h).padStart(2, "0")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DIAS_SEMANA.map((d) => (
              <tr key={d.valor}>
                <td className="pr-2 text-right text-[var(--tinta-3)]">{d.curto}</td>
                {horas.map((h) => {
                  const c = mapa.get(`${d.valor}-${h}`);
                  const n = c?.atendimentos ?? 0;
                  return (
                    <td key={h} className="p-[2px]">
                      <div
                        className="size-[22px] rounded-[5px] border border-[var(--traco)] transition-transform hover:scale-110"
                        style={{ background: passo(n / maximo) }}
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
      </div>

      {/* Legenda: a escala é contínua, então mostra as pontas, não categorias. */}
      <div className="flex items-center gap-2 text-[11.5px] text-[var(--tinta-3)]">
        <span>Vago</span>
        <span className="flex gap-[3px]">
          <span className="size-3.5 rounded-[4px] border border-[var(--traco)]" />
          {RAMPA.map((cor) => (
            <span
              key={cor}
              className="size-3.5 rounded-[4px] border border-[var(--traco)]"
              style={{ background: cor }}
            />
          ))}
        </span>
        <span>{maximo} atendimento(s)</span>
        <span className="ml-auto">
          Célula vazia em horário de funcionamento é capacidade parada.
        </span>
      </div>
    </div>
  );
}
