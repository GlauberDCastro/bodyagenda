import type { AgendamentoNaAgenda, ColunaRecurso } from "@/lib/consultas/agenda";
import type { StatusAgendamento } from "@/lib/types/database";

const ALTURA_HORA = 56; // px
const hora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/**
 * Cor do bloco por status.
 *
 * Usa a paleta de status (fixa, nunca tematizada) em vez de cores cruas: os
 * mesmos tons do resto do sistema, e os passos escuros funcionam sobre a
 * superfície escura em vez de serem uma inversão automática.
 *
 * O status também aparece no `title`, porque cor sozinha não carrega estado.
 */
const COR_STATUS: Record<StatusAgendamento, string | null> = {
  agendado: "var(--tinta-3)",
  confirmado: "var(--serie-1)",
  em_atendimento: "var(--status-atencao)",
  realizado: "var(--status-bom)",
  falta: "var(--status-critico)",
  cancelado: null,
};

const ROTULO_STATUS: Record<StatusAgendamento, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  em_atendimento: "Em atendimento",
  realizado: "Realizado",
  falta: "Falta",
  cancelado: "Cancelado",
};

function estiloBloco(status: StatusAgendamento) {
  const cor = COR_STATUS[status];
  if (!cor) return null;
  return {
    background: `color-mix(in oklab, ${cor} 13%, var(--superficie))`,
    borderColor: `color-mix(in oklab, ${cor} 38%, var(--superficie))`,
    color: `color-mix(in oklab, ${cor} 62%, var(--tinta-1))`,
  };
}

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
      <div className="rounded-lg border border-dashed border-[var(--traco-forte)] p-8 text-center text-sm text-[var(--tinta-3)] ">
        Nenhum recurso ativo para exibir. Cadastre em Configuração.
      </div>
    );
  }

  return (
    <div className="cartao overflow-x-auto">
      <div className="min-w-max">
        {/* Cabeçalho de colunas */}
        <div
          className="sticky top-0 z-10 flex border-b border-[var(--traco)] bg-[var(--superficie)]"
          style={{ paddingLeft: 56 }}
        >
          {colunas.map((c) => (
            <div
              key={`${c.tipo}-${c.id}`}
              className="w-40 shrink-0 border-l border-[var(--traco)] px-2 py-2 "
            >
              <p className="truncate text-xs font-medium">{c.rotulo}</p>
              {c.subtitulo && (
                <p className="truncate text-[11px] text-[var(--tinta-3)]">{c.subtitulo}</p>
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
                className="border-b border-[var(--traco)] pr-2 text-right text-[11px] tabular-nums text-[var(--tinta-3)] "
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
                className="relative w-40 shrink-0 border-l border-[var(--traco)]"
              >
                {horas.map((h) => (
                  <div
                    key={h}
                    className="border-b border-[var(--traco)]"
                    style={{ height: ALTURA_HORA }}
                  />
                ))}

                {doRecurso.map((a) => {
                  const inicioMin = minutosDoDia(a.inicio, tz);
                  const fimMin = minutosDoDia(a.fim, tz);
                  const topo = ((inicioMin - horaInicio * 60) / 60) * ALTURA_HORA;
                  const altura = Math.max(18, ((fimMin - inicioMin) / 60) * ALTURA_HORA - 2);

                  // Fora da faixa exibida: não renderiza em vez de estourar.
                  if (fimMin <= horaInicio * 60 || inicioMin >= horaFim * 60) return null;

                  const estilo = estiloBloco(a.status);
                  if (!estilo) return null;

                  return (
                    <div
                      key={a.id}
                      className="absolute left-1 right-1 overflow-hidden rounded-[7px] border px-1.5 py-1 text-[11px] leading-tight"
                      style={{ top: topo, height: altura, ...estilo }}
                      title={`${a.paciente?.nome ?? "—"} · ${a.procedimento?.nome ?? "—"} · ${hora.format(new Date(a.inicio))}–${hora.format(new Date(a.fim))} · ${ROTULO_STATUS[a.status]}`}
                    >
                      <p
                        className={`truncate font-medium ${a.status === "falta" ? "line-through" : ""}`}
                      >
                        {a.paciente?.nome ?? "—"}
                      </p>
                      <p className="truncate opacity-75">
                        {hora.format(new Date(a.inicio))} · {a.procedimento?.nome ?? "—"}
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
