"use client";

import { useRef, useState, type CSSProperties } from "react";
import type { AgendamentoNaAgenda } from "@/lib/consultas/agenda";
import { deslocamentoEmMinutos, type Grade } from "@/lib/grade-agenda";
import { DetalheAtendimento } from "./detalhe-atendimento";

const hora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/**
 * Bloco da timeline que abre as ações do atendimento.
 *
 * Sem ele a agenda era só leitura: nada marcava `realizado`, e sem realizado
 * não há receita, bonificação nem ocupação efetiva.
 */
export interface Arrasto {
  /** Quantas colunas dá para andar para cada lado (0 = só vertical). */
  colunasAntes: number;
  colunasDepois: number;
  /** Devolve se o remarcar deu certo; se não, o bloco volta ao lugar. */
  aoSoltar: (deltaMin: number, deltaColuna: number) => Promise<boolean>;
}

/** Abaixo disso, o gesto é um clique, não um arraste. */
const LIMIAR_ARRASTE_PX = 4;

export function BlocoAgendamento({
  agendamento: a,
  grade,
  arrasto,
  rotuloStatus,
  estilo,
  titulo,
  cor = "var(--tinta-3)",
}: {
  agendamento: AgendamentoNaAgenda;
  grade: Grade;
  /** Ausente quando o status não permite remarcar. */
  arrasto?: Arrasto;
  rotuloStatus: string;
  estilo: CSSProperties;
  titulo: string;
  /** Cor do status: a barra lateral e o fundo do bloco. */
  cor?: string;
}) {
  const [aberto, setAberto] = useState(false);

  // RF-49 · arrastar para remarcar.
  // A largura da coluna é medida no início do arraste: na semana ela estica.
  const origem = useRef<{ x: number; y: number; moveu: boolean; largura: number } | null>(null);
  const ignorarClique = useRef(false);
  const [desloc, setDesloc] = useState<{ min: number; coluna: number; largura: number } | null>(
    null,
  );
  const [salvando, setSalvando] = useState(false);

  const aoPressionar = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!arrasto || salvando || e.button !== 0) return;
    origem.current = {
      x: e.clientX,
      y: e.clientY,
      moveu: false,
      largura: e.currentTarget.parentElement?.offsetWidth ?? 160,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const aoMover = (e: React.PointerEvent<HTMLButtonElement>) => {
    const o = origem.current;
    if (!o || !arrasto) return;
    const dx = e.clientX - o.x;
    const dy = e.clientY - o.y;
    if (!o.moveu && Math.hypot(dx, dy) < LIMIAR_ARRASTE_PX) return;
    o.moveu = true;
    const coluna = Math.max(
      -arrasto.colunasAntes,
      Math.min(arrasto.colunasDepois, Math.round(dx / o.largura)),
    );
    setDesloc({ min: deslocamentoEmMinutos(dy, grade), coluna, largura: o.largura });
  };

  const aoSoltar = async () => {
    const o = origem.current;
    origem.current = null;
    if (!o?.moveu || !arrasto) return;
    ignorarClique.current = true;
    if (!desloc || (desloc.min === 0 && desloc.coluna === 0)) {
      setDesloc(null);
      return;
    }
    setSalvando(true);
    await arrasto.aoSoltar(desloc.min, desloc.coluna);
    // Deu certo: a agenda revalidada já traz o bloco no lugar novo.
    // Deu errado: volta para onde estava, e a timeline mostra o motivo.
    setSalvando(false);
    setDesloc(null);
  };

  const cancelarArraste = () => {
    origem.current = null;
    setDesloc(null);
  };

  const novoInicio = desloc ? new Date(new Date(a.inicio).getTime() + desloc.min * 60_000) : null;

  return (
    <>
      <button
        type="button"
        data-bloco
        onClick={() => {
          if (ignorarClique.current) {
            ignorarClique.current = false;
            return;
          }
          setAberto(true);
        }}
        onPointerDown={aoPressionar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={cancelarArraste}
        aria-roledescription={arrasto ? "atendimento arrastável" : undefined}
        className={`absolute overflow-hidden rounded-[10px] text-left ${
          desloc
            ? "z-30 cursor-grabbing shadow-[var(--sombra-3)]"
            : `z-[1] transition-shadow hover:shadow-[var(--sombra-2)] ${arrasto ? "cursor-grab" : ""}`
        } ${salvando ? "opacity-70" : ""}`}
        style={{
          ...estilo,
          borderLeft: `3px solid ${cor}`,
          // "A confirmar" é hachurado, como na agenda de referência: dá para
          // separar de longe o que ainda não foi confirmado.
          background:
            a.status === "agendado"
              ? `repeating-linear-gradient(135deg, color-mix(in oklab, ${cor} 12%, var(--superficie)) 0 7px, var(--superficie) 7px 14px)`
              : `color-mix(in oklab, ${cor} 14%, var(--superficie))`,
          // Sem isto o toque rola a página em vez de arrastar o bloco.
          touchAction: arrasto ? "none" : undefined,
          transform: desloc
            ? `translate(${desloc.coluna * desloc.largura}px, ${(desloc.min / 60) * grade.alturaHora}px)`
            : undefined,
        }}
        title={titulo}
      >
        {(() => {
          const horario = novoInicio
            ? `→ ${hora.format(novoInicio)}`
            : `${hora.format(new Date(a.inicio))} – ${hora.format(new Date(a.fim))}`;
          const alto = Number(estilo.height ?? 0) >= 100;
          const nome = (
            <p
              className={`text-[14px] font-semibold leading-snug text-[var(--tinta-1)] ${
                alto ? "line-clamp-2" : "truncate"
              } ${a.status === "falta" ? "line-through" : ""}`}
            >
              {a.paciente?.nome ?? "—"}
            </p>
          );
          const status = a.status === "agendado" ? "a confirmar" : rotuloStatus.toLowerCase();
          // Marcas que a profissional precisa ver de longe.
          const marcas = [
            a.sem_avaliacao && { texto: "1ª vez", cor: "var(--status-atencao)" },
            a.origem === "upsell" && { texto: "Upsell", cor: "var(--status-bom)" },
            a.origem === "comercial" && { texto: "Comercial", cor: "var(--serie-1)" },
          ].filter((m): m is { texto: string; cor: string } => Boolean(m));
          const etiquetas = marcas.length > 0 && (
            <span className="flex shrink-0 gap-1">
              {marcas.map((m) => (
                <span
                  key={m.texto}
                  className="rounded-[5px] px-1 text-[11px] font-semibold leading-[18px] text-[var(--tinta-1)]"
                  style={{ background: `color-mix(in oklab, ${m.cor} 28%, var(--superficie))` }}
                >
                  {m.texto}
                </span>
              ))}
            </span>
          );
          // Bloco curto: nome e horário numa linha só.
          if (Number(estilo.height ?? 0) < 64) {
            return (
              <div className="flex items-start justify-between gap-2 px-2.5 py-1.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  {nome}
                  {etiquetas}
                </span>
                <span className="shrink-0 pt-0.5 text-[12.5px] tabular-nums text-[var(--tinta-2)]">
                  {horario}
                </span>
              </div>
            );
          }
          return (
            <div className="flex h-full flex-col px-2.5 py-2">
              <span className="flex min-w-0 items-start justify-between gap-1.5">
                {nome}
                {etiquetas}
              </span>
              <p className="truncate text-[13px] text-[var(--tinta-2)]">
                {[a.procedimento?.nome, ...a.profissionais.map((p) => p.nome)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {/* Coluna estreita (semana): horário e status quebram em vez de cortar. */}
              <p className="mt-auto flex flex-wrap gap-x-1.5 text-[12.5px] leading-snug tabular-nums text-[var(--tinta-2)]">
                <span>{horario}</span>
                <span className="font-semibold text-[var(--tinta-1)]">{status}</span>
              </p>
            </div>
          );
        })()}
      </button>

      <DetalheAtendimento agendamento={a} aberto={aberto} aoFechar={() => setAberto(false)} />
    </>
  );
}
