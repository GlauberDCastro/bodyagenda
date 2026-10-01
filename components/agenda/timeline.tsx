"use client";

import { useState } from "react";
import type { AgendamentoNaAgenda, ColunaRecurso } from "@/lib/consultas/agenda";
import type { StatusAgendamento } from "@/lib/types/database";
import { remarcar } from "@/lib/actions/agenda";
import {
  dentroDoExpedienteExibido,
  horarioLocal,
  minutoNaGrade,
  podeArrastar,
} from "@/lib/grade-agenda";
import { Aviso } from "@/components/ui/primitivos";
import { BlocoAgendamento } from "./bloco-agendamento";
import { useAgendamento, type PresetAgendamento } from "./contexto-agendamento";

const ALTURA_HORA = 56; // px
const LARGURA_COLUNA = 160; // px, = w-40
const PASSO_MIN = 15;
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
/** Diz se um agendamento ocupa aquela coluna. */
function pertence(a: AgendamentoNaAgenda, c: ColunaRecurso): boolean {
  if (c.tipo === "sala") return a.sala_id === c.id;
  if (c.tipo === "equipamento") return a.equipamentos.some((e) => e.id === c.id);
  return a.profissionais.some((p) => p.id === c.id);
}

/** O clique numa coluna já sabe o recurso: vai preenchido no formulário. */
function presetDaColuna(c: ColunaRecurso, inicio: string): PresetAgendamento {
  if (c.tipo === "sala") return { inicio, sala_id: c.id };
  if (c.tipo === "equipamento") return { inicio, equipamentos: [c.id] };
  return { inicio, profissionais: [c.id] };
}

const hhmm = (minuto: number) =>
  `${String(Math.floor(minuto / 60)).padStart(2, "0")}:${String(minuto % 60).padStart(2, "0")}`;

export function Timeline({
  colunas,
  agendamentos,
  dia,
  horaInicio = 8,
  horaFim = 19,
  tz = "America/Sao_Paulo",
}: {
  colunas: ColunaRecurso[];
  agendamentos: AgendamentoNaAgenda[];
  /** "2026-10-06": o dia exibido, no horário da clínica. */
  dia: string;
  horaInicio?: number;
  horaFim?: number;
  tz?: string;
}) {
  const { abrir } = useAgendamento();
  const [sobre, setSobre] = useState<{ coluna: string; minuto: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const horas = Array.from({ length: horaFim - horaInicio }, (_, i) => horaInicio + i);
  const alturaTotal = horas.length * ALTURA_HORA;
  const grade = { horaInicio, alturaHora: ALTURA_HORA, passo: PASSO_MIN };

  /** Minuto sob o ponteiro, ou null se ele está sobre um atendimento. */
  const minutoSob = (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-bloco]")) return null;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const minuto = minutoNaGrade(y, grade);
    return minuto < horaFim * 60 ? minuto : null;
  };

  /**
   * RF-49 · soltar o atendimento arrastado. Na visão por salas, a coluna de
   * destino também troca a sala; nas outras, só o horário muda.
   */
  const soltar = async (
    a: AgendamentoNaAgenda,
    colunaIndice: number,
    deltaMin: number,
    deltaColuna: number,
  ): Promise<boolean> => {
    const inicioMin = minutosDoDia(a.inicio, tz) + deltaMin;
    const duracao = minutosDoDia(a.fim, tz) - minutosDoDia(a.inicio, tz);
    if (!dentroDoExpedienteExibido(inicioMin, duracao, horaInicio, horaFim)) {
      setErro("Solte o atendimento dentro da faixa de horário da agenda.");
      return false;
    }
    const destino = colunas[colunaIndice + deltaColuna];
    const novaSala = destino?.tipo === "sala" && deltaColuna !== 0 ? destino.id : undefined;

    const r = await remarcar(a.id, horarioLocal(dia, inicioMin), novaSala);
    setErro(r.erro ?? null);
    return !r.erro;
  };

  if (colunas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--traco-forte)] p-8 text-center text-sm text-[var(--tinta-3)] ">
        Nenhum recurso ativo para exibir. Cadastre em Configuração.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {erro && (
        <div role="alert">
          <Aviso tom="critico">{erro}</Aviso>
        </div>
      )}
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

            {colunas.map((coluna, colunaIndice) => {
              const doRecurso = agendamentos.filter(
                (a) => a.status !== "cancelado" && pertence(a, coluna),
              );
              const chave = `${coluna.tipo}-${coluna.id}`;
              const marcado = sobre?.coluna === chave ? sobre.minuto : null;

              return (
                <div
                  key={chave}
                  data-coluna={chave}
                  className="relative w-40 shrink-0 cursor-pointer border-l border-[var(--traco)]"
                  onPointerMove={(e) => {
                    if (e.pointerType !== "mouse") return;
                    const minuto = minutoSob(e);
                    setSobre(minuto === null ? null : { coluna: chave, minuto });
                  }}
                  onPointerLeave={() => setSobre(null)}
                  onClick={(e) => {
                    const minuto = minutoSob(e);
                    if (minuto === null) return;
                    setErro(null);
                    abrir(presetDaColuna(coluna, horarioLocal(dia, minuto)));
                  }}
                >
                  {horas.map((h) => (
                    <div
                      key={h}
                      className="border-b border-[var(--traco)]"
                      style={{ height: ALTURA_HORA }}
                    />
                  ))}

                  {/* Horário sob o mouse: mostra que a grade é clicável e onde vai cair. */}
                  {marcado !== null && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute left-1 right-1 flex items-center rounded-[7px] border border-dashed px-1.5 text-[11px] font-medium"
                      style={{
                        top: ((marcado - horaInicio * 60) / 60) * ALTURA_HORA,
                        height: (PASSO_MIN / 60) * ALTURA_HORA,
                        borderColor: "color-mix(in oklab, var(--marca) 45%, transparent)",
                        color: "var(--marca)",
                        background: "color-mix(in oklab, var(--marca) 10%, transparent)",
                      }}
                    >
                      + {hhmm(marcado)}
                    </div>
                  )}

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
                      <BlocoAgendamento
                        key={a.id}
                        agendamento={a}
                        grade={grade}
                        arrasto={
                          podeArrastar(a.status)
                            ? {
                                larguraColuna: LARGURA_COLUNA,
                                // Trocar de coluna só faz sentido na visão por salas.
                                colunasAntes: coluna.tipo === "sala" ? colunaIndice : 0,
                                colunasDepois:
                                  coluna.tipo === "sala" ? colunas.length - 1 - colunaIndice : 0,
                                aoSoltar: (deltaMin, deltaColuna) =>
                                  soltar(a, colunaIndice, deltaMin, deltaColuna),
                              }
                            : undefined
                        }
                        rotuloStatus={ROTULO_STATUS[a.status]}
                        estilo={{ top: topo, height: altura, ...estilo }}
                        titulo={`${a.paciente?.nome ?? "—"} · ${a.procedimento?.nome ?? "—"} · ${hora.format(new Date(a.inicio))}–${hora.format(new Date(a.fim))} · ${ROTULO_STATUS[a.status]}`}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
