"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AgendamentoNaAgenda, ColunaRecurso } from "@/lib/consultas/agenda";
import { remarcar, remarcarTrocandoRecurso } from "@/lib/actions/agenda";
import {
  usaRecurso,
  dentroDoExpedienteExibido,
  distribuirEmFaixas,
  horarioLocal,
  minutoNaGrade,
  podeArrastar,
} from "@/lib/grade-agenda";
import { Aviso } from "@/components/ui/primitivos";
import { BlocoAgendamento } from "./bloco-agendamento";
import { COR_STATUS, ROTULO_STATUS } from "@/lib/status-agendamento";
import { useAgendamento, type PresetAgendamento } from "./contexto-agendamento";

/** 40 px por faixa de 15 min: espaço para nome, procedimento e horário. */
const ALTURA_HORA = 160; // px
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
  hoje,
  horaInicio,
  horaFim,
}: {
  colunas: ColunaGrade[];
  agendamentos: AgendamentoNaAgenda[];
  /** Colunas são dias: elas se esticam e arrastar entre elas muda o dia. */
  semana?: boolean;
  /** "2026-10-01": a coluna de hoje ganha a linha da hora atual. */
  hoje?: string;
  /** Limites da grade: o expediente cadastrado em Configurações › Horários. */
  horaInicio: number;
  horaFim: number;
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

  // Uma linha por faixa de 15 min; cada uma tem data-slot para teste e leitura.
  const slots = Array.from(
    { length: ((horaFim - horaInicio) * 60) / PASSO_MIN },
    (_, i) => horaInicio * 60 + i * PASSO_MIN,
  );
  const alturaSlot = (PASSO_MIN / 60) * ALTURA_HORA;
  const alturaTotal = slots.length * alturaSlot;
  const grade = { horaInicio, alturaHora: ALTURA_HORA, passo: PASSO_MIN };
  const larguraColuna = semana ? "min-w-[150px] flex-1" : "min-w-[200px] flex-1";

  // Hora atual, só no cliente (no servidor viraria divergência de hidratação).
  const [agora, setAgora] = useState<number | null>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ler = () => setAgora(minutosDoDia(new Date().toISOString()));
    ler();
    const t = setInterval(ler, 60_000);
    // Abre rolado no começo do expediente (ou uma hora antes de agora, hoje).
    const minuto = minutosDoDia(new Date().toISOString());
    const alvo =
      hoje && colunas.some((c) => c.dia === hoje) ? Math.max(8 * 60, minuto - 60) : 8 * 60;
    if (rolagem.current) {
      rolagem.current.scrollTop = ((alvo - horaInicio * 60) / 60) * ALTURA_HORA - 8;
    }
    return () => clearInterval(t);
    // Só na montagem: a rolagem é o ponto de partida, não um efeito contínuo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <div className="cartao overflow-hidden p-0">
        <div
          ref={rolagem}
          className="max-h-[calc(100dvh-300px)] min-h-[420px] overflow-auto"
          data-grade
          data-hora-inicio={horaInicio}
          data-altura-hora={ALTURA_HORA}
        >
          <div className="flex min-w-fit flex-col">
            {/* Cabeçalho fixo no topo da rolagem */}
            <div className="sticky top-0 z-30 flex border-b border-[var(--traco)] bg-[var(--superficie)]">
              <div className="sticky left-0 z-10 w-[72px] shrink-0 bg-[var(--superficie)]" />
              {colunas.map((c) => {
                const conteudo = (
                  <>
                    <p
                      className={`truncate text-[15px] font-semibold ${
                        c.destaque ? "text-[var(--marca)]" : "text-[var(--tinta-1)]"
                      }`}
                    >
                      {c.rotulo}
                    </p>
                    {c.subtitulo && (
                      <p className="truncate text-[12.5px] text-[var(--tinta-3)]">{c.subtitulo}</p>
                    )}
                  </>
                );
                return (
                  <div
                    key={c.chave}
                    className={`${larguraColuna} border-l border-[var(--traco)] px-3 py-3.5 text-center`}
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
              {/* Régua: hora cheia em negrito, quartos em tom de apoio */}
              <div className="sticky left-0 z-20 w-[72px] shrink-0 bg-[var(--superficie)]">
                {slots.map((m) => (
                  <div
                    key={m}
                    className={`pr-3 text-right tabular-nums ${
                      m % 60 === 0
                        ? "text-[13px] font-semibold text-[var(--tinta-1)]"
                        : "text-[12.5px] text-[var(--tinta-3)]"
                    }`}
                    style={{ height: alturaSlot, paddingTop: 2 }}
                  >
                    {hhmm(m)}
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
                const ehHoje = hoje !== undefined && coluna.dia === hoje;

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
                      setErro(null);
                      abrir(presetDaColuna(coluna, horarioLocal(coluna.dia, minutoNoPonteiro(e))));
                    }}
                  >
                    {slots.map((m) => (
                      <div
                        key={m}
                        data-slot={hhmm(m)}
                        className={
                          (m + PASSO_MIN) % 60 === 0
                            ? "border-b border-[var(--traco)]"
                            : "border-b border-[color-mix(in_oklab,var(--traco)_45%,transparent)]"
                        }
                        style={{ height: alturaSlot }}
                      />
                    ))}

                    {/* Sob o mouse: mostra que a grade é clicável e onde vai cair. */}
                    {(marcado !== null || intervalo) && (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute left-1.5 right-1.5 z-10 flex items-start rounded-[10px] border border-dashed px-2 py-1 text-[13px] font-medium"
                        style={{
                          top: (((intervalo?.de ?? marcado!) - horaInicio * 60) / 60) * ALTURA_HORA,
                          height: ((intervalo ? intervalo.ate - intervalo.de : PASSO_MIN) / 60) * ALTURA_HORA,
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

                    {/* Hora atual */}
                    {ehHoje && agora !== null && agora >= horaInicio * 60 && agora < horaFim * 60 && (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute left-0 right-0 z-20 border-t-2"
                        style={{
                          top: ((agora - horaInicio * 60) / 60) * ALTURA_HORA,
                          borderColor: "var(--status-critico)",
                        }}
                      >
                        <span
                          className="absolute -left-1 -top-[5px] size-2 rounded-full"
                          style={{ background: "var(--status-critico)" }}
                        />
                      </div>
                    )}

                    {daColuna.map((a) => {
                      const inicioMin = minutosDoDia(a.inicio);
                      const fimMin = minutosDoDia(a.fim);
                      const topo = ((inicioMin - horaInicio * 60) / 60) * ALTURA_HORA;
                      const altura = Math.max(30, ((fimMin - inicioMin) / 60) * ALTURA_HORA - 3);

                      // Fora da faixa exibida: não renderiza em vez de estourar.
                      if (fimMin <= horaInicio * 60 || inicioMin >= horaFim * 60) return null;

                      const cor = COR_STATUS[a.status];
                      if (!cor) return null;
                      const { faixa, total } = faixas.get(a.id) ?? { faixa: 0, total: 1 };

                      return (
                        <BlocoAgendamento
                          key={a.id}
                          agendamento={a}
                          grade={grade}
                          cor={cor}
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
                            top: topo + 1,
                            height: altura,
                            // Sobrepostos lado a lado.
                            left: `calc(${(faixa / total) * 100}% + 6px)`,
                            width: `calc(${100 / total}% - 12px)`,
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
    </div>
  );
}
