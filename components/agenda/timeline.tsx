"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { AgendamentoNaAgenda, ColunaRecurso } from "@/lib/consultas/agenda";
import type { StatusAgendamento } from "@/lib/types/database";
import { remarcar, remarcarTrocandoRecurso } from "@/lib/actions/agenda";
import {
  dentroDoExpedienteExibido,
  distribuirEmFaixas,
  horarioLocal,
  minutoNaGrade,
  podeArrastar,
} from "@/lib/grade-agenda";
import { Aviso } from "@/components/ui/primitivos";
import { BlocoAgendamento } from "./bloco-agendamento";
import { useAgendamento, type PresetAgendamento } from "./contexto-agendamento";

const ALTURA_HORA = 56; // px
const PASSO_MIN = 15;
const TZ = "America/Sao_Paulo";
const hora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TZ,
});

/**
 * Coluna da grade. Na visão do dia, cada coluna é um recurso; na visão da
 * semana, cada coluna é um dia (e `recurso`, se houver, é o filtro).
 */
export interface ColunaGrade {
  chave: string;
  rotulo: string;
  subtitulo?: string;
  /** "2026-10-06": o dia que a coluna representa. */
  dia: string;
  recurso?: ColunaRecurso;
  /** Cabeçalho clicável (na semana, leva ao dia). */
  href?: string;
  destaque?: boolean;
}

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
function minutosDoDia(iso: string): number {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).formatToParts(new Date(iso));
  const h = Number(partes.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(partes.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** "2026-10-06" do atendimento, no fuso da clínica. */
const diaDe = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));

/** Diz se um agendamento ocupa aquele recurso. */
function usaRecurso(a: AgendamentoNaAgenda, c: ColunaRecurso): boolean {
  if (c.tipo === "sala") return a.sala_id === c.id;
  if (c.tipo === "equipamento") return a.equipamentos.some((e) => e.id === c.id);
  return a.profissionais.some((p) => p.id === c.id);
}

const pertence = (a: AgendamentoNaAgenda, c: ColunaGrade) =>
  diaDe(a.inicio) === c.dia && (!c.recurso || usaRecurso(a, c.recurso));

/** O clique numa coluna já sabe quando e, se houver, o recurso. */
function presetDaColuna(c: ColunaGrade, inicio: string, fim?: string): PresetAgendamento {
  const r = c.recurso;
  if (!r) return { inicio, fim };
  if (r.tipo === "sala") return { inicio, fim, sala_id: r.id };
  if (r.tipo === "equipamento") return { inicio, fim, equipamentos: [r.id] };
  return { inicio, fim, profissionais: [r.id] };
}

const hhmm = (minuto: number) =>
  `${String(Math.floor(minuto / 60)).padStart(2, "0")}:${String(minuto % 60).padStart(2, "0")}`;

/**
 * RF-41 · timeline: colunas são recursos (dia) ou dias (semana), linhas são
 * horários. Como no Google Calendar: arrastar no vazio escolhe o horário,
 * arrastar o atendimento remarca — para outro horário, recurso ou dia.
 */
export function Timeline({
  colunas,
  agendamentos,
  semana = false,
  horaInicio = 8,
  horaFim = 19,
}: {
  colunas: ColunaGrade[];
  agendamentos: AgendamentoNaAgenda[];
  /** Colunas são dias: elas se esticam e arrastar entre elas muda o dia. */
  semana?: boolean;
  horaInicio?: number;
  horaFim?: number;
}) {
  const { abrir } = useAgendamento();
  const [sobre, setSobre] = useState<{ coluna: string; minuto: number } | null>(null);
  const [selecao, setSelecao] = useState<{
    coluna: string;
    ancora: number;
    ate: number;
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // O clique que encerra uma seleção arrastada não pode abrir o formulário de novo.
  const ignorarClique = useRef(false);

  const horas = Array.from({ length: horaFim - horaInicio }, (_, i) => horaInicio + i);
  const alturaTotal = horas.length * ALTURA_HORA;
  const grade = { horaInicio, alturaHora: ALTURA_HORA, passo: PASSO_MIN };
  const larguraColuna = semana ? "min-w-[140px] flex-1" : "w-40 shrink-0";

  /** Minuto do dia na altura do ponteiro, limitado à faixa exibida. */
  const minutoNoPonteiro = (e: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    return Math.min(Math.max(minutoNaGrade(y, grade), horaInicio * 60), horaFim * 60 - PASSO_MIN);
  };
  // O modal do atendimento é filho da coluna na árvore do React: os eventos
  // dele sobem até aqui e não podem virar seleção de horário.
  const sobreAtendimento = (e: React.SyntheticEvent) =>
    !!(e.target as HTMLElement).closest("[data-bloco], dialog");

  /**
   * RF-49 · soltar o atendimento arrastado. Na semana, outra coluna é outro
   * dia. No dia, outra coluna troca o recurso: a sala na visão por salas; nas
   * outras, o aparelho ou profissional da coluna de origem pelo de destino.
   */
  const soltar = async (
    a: AgendamentoNaAgenda,
    colunaIndice: number,
    deltaMin: number,
    deltaColuna: number,
  ): Promise<boolean> => {
    const inicioMin = minutosDoDia(a.inicio) + deltaMin;
    const duracao = minutosDoDia(a.fim) - minutosDoDia(a.inicio);
    if (!dentroDoExpedienteExibido(inicioMin, duracao, horaInicio, horaFim)) {
      setErro("Solte o atendimento dentro da faixa de horário da agenda.");
      return false;
    }
    const origem = colunas[colunaIndice];
    const destino = colunas[colunaIndice + deltaColuna] ?? origem;
    const novoInicio = horarioLocal(destino.dia, inicioMin);
    const trocaRecurso = !semana && deltaColuna !== 0 ? destino.recurso : undefined;

    const r =
      trocaRecurso && trocaRecurso.tipo !== "sala" && origem.recurso
        ? await remarcarTrocandoRecurso(
            a.id,
            novoInicio,
            trocaRecurso.tipo,
            origem.recurso.id,
            trocaRecurso.id,
          )
        : await remarcar(
            a.id,
            novoInicio,
            trocaRecurso?.tipo === "sala" ? trocaRecurso.id : undefined,
          );
    setErro(r.erro ?? null);
    return !r.erro;
  };

  if (colunas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--traco-forte)] p-8 text-center text-sm text-[var(--tinta-3)] ">
        Nenhum recurso ativo para exibir. Cadastre em Configurações.
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
        <div className={semana ? "min-w-[1040px]" : "min-w-max"}>
          {/* Cabeçalho de colunas */}
          <div
            className="sticky top-0 z-10 flex border-b border-[var(--traco)] bg-[var(--superficie)]"
            style={{ paddingLeft: 56 }}
          >
            {colunas.map((c) => {
              const conteudo = (
                <>
                  <p
                    className={`truncate text-xs font-medium ${c.destaque ? "text-[var(--marca)]" : ""}`}
                  >
                    {c.rotulo}
                  </p>
                  {c.subtitulo && (
                    <p className="truncate text-[11px] text-[var(--tinta-3)]">{c.subtitulo}</p>
                  )}
                </>
              );
              return (
                <div
                  key={c.chave}
                  className={`${larguraColuna} border-l border-[var(--traco)] px-2 py-2`}
                >
                  {c.href ? (
                    <Link href={c.href} className="block rounded hover:underline">
                      {conteudo}
                    </Link>
                  ) : (
                    conteudo
                  )}
                </div>
              );
            })}
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
              const daColuna = agendamentos.filter(
                (a) => a.status !== "cancelado" && pertence(a, coluna),
              );
              const faixas = distribuirEmFaixas(
                daColuna.map((a) => ({
                  id: a.id,
                  inicio: minutosDoDia(a.inicio),
                  fim: minutosDoDia(a.fim),
                })),
              );
              const marcado = sobre?.coluna === coluna.chave && !selecao ? sobre.minuto : null;
              const intervalo =
                selecao?.coluna === coluna.chave
                  ? {
                      de: Math.min(selecao.ancora, selecao.ate),
                      ate: Math.max(selecao.ancora, selecao.ate) + PASSO_MIN,
                    }
                  : null;

              return (
                <div
                  key={coluna.chave}
                  data-coluna={coluna.chave}
                  className={`relative ${larguraColuna} cursor-pointer select-none border-l border-[var(--traco)] ${
                    coluna.destaque ? "bg-[color-mix(in_oklab,var(--marca)_3%,transparent)]" : ""
                  }`}
                  // Arrastar no vazio escolhe o intervalo, como no Google Calendar.
                  // Só com mouse: no toque, arrastar precisa continuar rolando a página.
                  onPointerDown={(e) => {
                    if (e.pointerType !== "mouse" || e.button !== 0 || sobreAtendimento(e)) return;
                    const minuto = minutoNoPonteiro(e);
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setSelecao({ coluna: coluna.chave, ancora: minuto, ate: minuto });
                  }}
                  onPointerMove={(e) => {
                    if (e.pointerType !== "mouse") return;
                    if (selecao?.coluna === coluna.chave) {
                      setSelecao({ ...selecao, ate: minutoNoPonteiro(e) });
                      return;
                    }
                    setSobre(
                      sobreAtendimento(e)
                        ? null
                        : { coluna: coluna.chave, minuto: minutoNoPonteiro(e) },
                    );
                  }}
                  onPointerUp={() => {
                    if (!intervalo) return;
                    setSelecao(null);
                    setErro(null);
                    ignorarClique.current = true;
                    abrir(
                      presetDaColuna(
                        coluna,
                        horarioLocal(coluna.dia, intervalo.de),
                        // Clique simples não é intervalo: só mostra o fim se arrastou.
                        intervalo.ate - intervalo.de > PASSO_MIN ? hhmm(intervalo.ate) : undefined,
                      ),
                    );
                  }}
                  onPointerLeave={() => setSobre(null)}
                  onClick={(e) => {
                    // Mouse já abriu no pointerup; aqui fica o toque.
                    if (ignorarClique.current) {
                      ignorarClique.current = false;
                      return;
                    }
                    if (sobreAtendimento(e)) return;
                    const minuto = minutoNoPonteiro(e);
                    setErro(null);
                    abrir(presetDaColuna(coluna, horarioLocal(coluna.dia, minuto)));
                  }}
                >
                  {horas.map((h) => (
                    <div
                      key={h}
                      className="border-b border-[var(--traco)]"
                      style={{ height: ALTURA_HORA }}
                    />
                  ))}

                  {/* Sob o mouse: mostra que a grade é clicável e onde vai cair. */}
                  {(marcado !== null || intervalo) && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute left-1 right-1 z-10 flex items-start rounded-[7px] border border-dashed px-1.5 py-0.5 text-[11px] font-medium"
                      style={{
                        top: (((intervalo?.de ?? marcado!) - horaInicio * 60) / 60) * ALTURA_HORA,
                        height:
                          ((intervalo ? intervalo.ate - intervalo.de : PASSO_MIN) / 60) *
                          ALTURA_HORA,
                        borderColor: "color-mix(in oklab, var(--marca) 45%, transparent)",
                        color: "var(--marca)",
                        background: "color-mix(in oklab, var(--marca) 10%, transparent)",
                      }}
                    >
                      {intervalo
                        ? `${hhmm(intervalo.de)} – ${hhmm(intervalo.ate)}`
                        : `+ ${hhmm(marcado!)}`}
                    </div>
                  )}

                  {daColuna.map((a) => {
                    const inicioMin = minutosDoDia(a.inicio);
                    const fimMin = minutosDoDia(a.fim);
                    const topo = ((inicioMin - horaInicio * 60) / 60) * ALTURA_HORA;
                    const altura = Math.max(18, ((fimMin - inicioMin) / 60) * ALTURA_HORA - 2);

                    // Fora da faixa exibida: não renderiza em vez de estourar.
                    if (fimMin <= horaInicio * 60 || inicioMin >= horaFim * 60) return null;

                    const estilo = estiloBloco(a.status);
                    if (!estilo) return null;
                    const { faixa, total } = faixas.get(a.id) ?? { faixa: 0, total: 1 };

                    return (
                      <BlocoAgendamento
                        key={a.id}
                        agendamento={a}
                        grade={grade}
                        arrasto={
                          podeArrastar(a.status)
                            ? {
                                colunasAntes: colunaIndice,
                                colunasDepois: colunas.length - 1 - colunaIndice,
                                aoSoltar: (deltaMin, deltaColuna) =>
                                  soltar(a, colunaIndice, deltaMin, deltaColuna),
                              }
                            : undefined
                        }
                        rotuloStatus={ROTULO_STATUS[a.status]}
                        estilo={{
                          top: topo,
                          height: altura,
                          // Sobrepostos lado a lado.
                          left: `calc(${(faixa / total) * 100}% + 2px)`,
                          width: `calc(${100 / total}% - 4px)`,
                          ...estilo,
                        }}
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
