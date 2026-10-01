"use client";

import { useActionState, useRef, useState, type CSSProperties } from "react";
import { mudarStatus, remarcar, type ResultadoAgendamento } from "@/lib/actions/agenda";
import type { Resultado } from "@/lib/actions/recursos";
import type { AgendamentoNaAgenda } from "@/lib/consultas/agenda";
import type { StatusAgendamento } from "@/lib/types/database";
import { Modal } from "@/components/ui/modal";
import { Botao, Campo, Input, Textarea } from "@/components/ui/primitivos";
import { deslocamentoEmMinutos, type Grade } from "@/lib/grade-agenda";

const hora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** "2026-10-06T09:00" no fuso da clínica, para o datetime-local. */
const paraInputLocal = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  })
    .format(new Date(iso))
    .replace(" ", "T");

// RF-50 a RF-52 · as transições que a recepção dispara no dia a dia.
const ACOES: { status: StatusAgendamento; rotulo: string }[] = [
  { status: "confirmado", rotulo: "Confirmar" },
  { status: "em_atendimento", rotulo: "Em atendimento" },
  { status: "realizado", rotulo: "Realizado" },
  { status: "falta", rotulo: "Falta" },
];

/**
 * Bloco da timeline que abre as ações do atendimento.
 *
 * Sem ele a agenda era só leitura: nada marcava `realizado`, e sem realizado
 * não há receita, comissão nem ocupação efetiva.
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
}: {
  agendamento: AgendamentoNaAgenda;
  grade: Grade;
  /** Ausente quando o status não permite remarcar. */
  arrasto?: Arrasto;
  rotuloStatus: string;
  estilo: CSSProperties;
  titulo: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [cancelando, setCancelando] = useState(false);

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

  const fechar = () => {
    setAberto(false);
    setCancelando(false);
  };

  const [estadoStatus, acaoStatus] = useActionState<Resultado, FormData>(
    async (anterior, formData) => {
      const r = await mudarStatus(anterior, formData);
      if (r.ok) fechar();
      return r;
    },
    {},
  );

  const [estadoRemarcar, acaoRemarcar] = useActionState<ResultadoAgendamento, FormData>(
    async (_anterior, formData) => {
      const r = await remarcar(a.id, String(formData.get("inicio")));
      if (r.ok) fechar();
      return r;
    },
    {},
  );

  const erro = estadoStatus.erro ?? estadoRemarcar.erro;

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
        className={`absolute overflow-hidden rounded-[7px] border px-1.5 py-1 text-left text-[11px] leading-tight ${
          desloc
            ? "z-20 cursor-grabbing shadow-[var(--sombra-3)]"
            : `transition hover:brightness-95 ${arrasto ? "cursor-grab" : ""}`
        } ${salvando ? "opacity-70" : ""}`}
        style={{
          ...estilo,
          // Sem isto o toque rola a página em vez de arrastar o bloco.
          touchAction: arrasto ? "none" : undefined,
          transform: desloc
            ? `translate(${desloc.coluna * desloc.largura}px, ${(desloc.min / 60) * grade.alturaHora}px)`
            : undefined,
        }}
        title={titulo}
      >
        <p className={`truncate font-medium ${a.status === "falta" ? "line-through" : ""}`}>
          {a.paciente?.nome ?? "—"}
        </p>
        <p className="truncate opacity-75">
          {novoInicio ? `→ ${hora.format(novoInicio)}` : hora.format(new Date(a.inicio))} ·{" "}
          {a.procedimento?.nome ?? "—"}
        </p>
      </button>

      <Modal
        aberto={aberto}
        aoFechar={fechar}
        titulo={a.paciente?.nome ?? "Atendimento"}
        descricao={`${a.procedimento?.nome ?? "—"} · ${hora.format(new Date(a.inicio))}–${hora.format(new Date(a.fim))} · ${rotuloStatus}`}
      >
        <div className="space-y-5">
          {(a.profissionais.length > 0 || a.equipamentos.length > 0) && (
            <p className="text-[13px] text-[var(--tinta-2)]">
              {[...a.profissionais.map((p) => p.nome), ...a.equipamentos.map((e) => e.nome)].join(
                " · ",
              )}
            </p>
          )}

          <form action={acaoStatus} className="space-y-3">
            <input type="hidden" name="id" value={a.id} />
            <div className="flex flex-wrap gap-2">
              {/* Escondidas ao cancelar: o motivo é obrigatório e travaria os outros botões. */}
              {!cancelando &&
                ACOES.filter((x) => x.status !== a.status).map((x) => (
                  <Botao
                    key={x.status}
                    type="submit"
                    name="status"
                    value={x.status}
                    variante="secundario"
                  >
                    {x.rotulo}
                  </Botao>
                ))}
              {!cancelando && (
                <Botao type="button" variante="perigo" onClick={() => setCancelando(true)}>
                  Cancelar atendimento
                </Botao>
              )}
            </div>

            {cancelando && (
              <div className="space-y-2">
                <Campo label="Motivo do cancelamento">
                  <Textarea name="motivo_cancelamento" rows={2} required autoFocus />
                </Campo>
                <Botao type="submit" name="status" value="cancelado" variante="perigo">
                  Confirmar cancelamento
                </Botao>
              </div>
            )}
          </form>

          {/* RF-49 · remarcar: o trigger reconstrói as reservas e revalida conflito. */}
          <form
            action={acaoRemarcar}
            className="flex items-end gap-2 border-t border-[var(--traco)] pt-4"
          >
            <div className="flex-1">
              <Campo label="Remarcar para">
                <Input
                  name="inicio"
                  type="datetime-local"
                  defaultValue={paraInputLocal(a.inicio)}
                  required
                />
              </Campo>
            </div>
            <Botao type="submit" variante="secundario">
              Remarcar
            </Botao>
          </form>

          {erro && (
            <p role="alert" className="text-[13px]" style={{ color: "var(--status-critico)" }}>
              {erro}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
