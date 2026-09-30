import type { AgendamentoNaAgenda, ColunaRecurso } from "@/lib/consultas/agenda";
import type { StatusAgendamento } from "@/lib/types/database";

const ALTURA_HORA = 56; // px
const hora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

const ESTILO_STATUS: Record<StatusAgendamento, string> = {
  agendado:
    "bg-slate-100 border-slate-300 text-slate-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100",
  confirmado:
    "bg-sky-100 border-sky-300 text-sky-900 dark:bg-sky-950 dark:border-sky-800 dark:text-sky-100",
  em_atendimento:
    "bg-amber-100 border-amber-400 text-amber-900 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-100",
  realizado:
    "bg-emerald-100 border-emerald-300 text-emerald-900 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-100",
  falta:
    "bg-red-50 border-red-300 text-red-900 line-through dark:bg-red-950/50 dark:border-red-900 dark:text-red-200",
  cancelado: "hidden",
};

/** Minutos desde o início do dia, no fuso da clínica. */
function minutosDoDia(iso: string, tz: string): number {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  }).formatToParts(new Date(iso));
  const h = Number(partes.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(partes.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/**
 * RF-41 · timeline por recurso: colunas são recursos, linhas são horários.
 *
 * É a visão operacional principal porque responde à pergunta que a recepção
 * realmente faz — "o que está livre agora?" — em vez de "o que este paciente
 * tem marcado?", que é o que um calendário comum mostra.
 */
export function Timeline({
  colunas,
  agendamentos,
  horaInicio = 8,
  horaFim = 19,
  tz = "America/Sao_Paulo",
  pertence,
}: {
  colunas: ColunaRecurso[];
  agendamentos: AgendamentoNaAgenda[];
  horaInicio?: number;
  horaFim?: number;
  tz?: string;
  /** Diz se um agendamento ocupa aquela coluna. */
  pertence: (a: AgendamentoNaAgenda, coluna: ColunaRecurso) => boolean;
}) {
  const horas = Array.from({ length: horaFim - horaInicio }, (_, i) => horaInicio + i);
  const alturaTotal = horas.length * ALTURA_HORA;

  if (colunas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Nenhum recurso ativo para exibir. Cadastre em Configuração.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <div className="min-w-max">
        {/* Cabeçalho de colunas */}
        <div
          className="sticky top-0 z-10 flex border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
          style={{ paddingLeft: 56 }}
        >
          {colunas.map((c) => (
            <div
              key={`${c.tipo}-${c.id}`}
              className="w-40 shrink-0 border-l border-slate-100 px-2 py-2 dark:border-slate-900"
            >
              <p className="truncate text-xs font-medium">{c.rotulo}</p>
              {c.subtitulo && (
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {c.subtitulo}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="flex" style={{ height: alturaTotal }}>
          {/* Régua de horas */}
          <div className="w-14 shrink-0">
            {horas.map((h) => (
              <div
                key={h}
                className="border-b border-slate-100 pr-2 text-right text-[11px] tabular-nums text-slate-400 dark:border-slate-900"
                style={{ height: ALTURA_HORA }}
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {colunas.map((coluna) => {
            const doRecurso = agendamentos.filter(
              (a) => a.status !== "cancelado" && pertence(a, coluna),
            );

            return (
              <div
                key={`${coluna.tipo}-${coluna.id}`}
                className="relative w-40 shrink-0 border-l border-slate-100 dark:border-slate-900"
              >
                {horas.map((h) => (
                  <div
                    key={h}
                    className="border-b border-slate-100 dark:border-slate-900"
                    style={{ height: ALTURA_HORA }}
                  />
                ))}

                {doRecurso.map((a) => {
                  const inicioMin = minutosDoDia(a.inicio, tz);
                  const fimMin = minutosDoDia(a.fim, tz);
                  const topo = ((inicioMin - horaInicio * 60) / 60) * ALTURA_HORA;
                  const altura = Math.max(
                    18,
                    ((fimMin - inicioMin) / 60) * ALTURA_HORA - 2,
                  );

                  // Fora da faixa exibida: não renderiza em vez de estourar.
                  if (fimMin <= horaInicio * 60 || inicioMin >= horaFim * 60) return null;

                  return (
                    <div
                      key={a.id}
                      className={`absolute left-1 right-1 overflow-hidden rounded border px-1.5 py-1 text-[11px] leading-tight ${ESTILO_STATUS[a.status]}`}
                      style={{ top: topo, height: altura }}
                      title={`${a.paciente?.nome ?? "—"} · ${a.procedimento?.nome ?? "—"} · ${hora.format(new Date(a.inicio))}–${hora.format(new Date(a.fim))}`}
                    >
                      <p className="truncate font-medium">{a.paciente?.nome ?? "—"}</p>
                      <p className="truncate opacity-75">
                        {hora.format(new Date(a.inicio))} ·{" "}
                        {a.procedimento?.nome ?? "—"}
                      </p>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
