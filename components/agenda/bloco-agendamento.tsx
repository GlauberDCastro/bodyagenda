"use client";

import { useActionState, useState, type CSSProperties } from "react";
import { mudarStatus, remarcar, type ResultadoAgendamento } from "@/lib/actions/agenda";
import type { Resultado } from "@/lib/actions/recursos";
import type { AgendamentoNaAgenda } from "@/lib/consultas/agenda";
import type { StatusAgendamento } from "@/lib/types/database";
import { Modal } from "@/components/ui/modal";
import { Botao, Campo, Input, Textarea } from "@/components/ui/primitivos";

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
export function BlocoAgendamento({
  agendamento: a,
  rotuloStatus,
  estilo,
  titulo,
}: {
  agendamento: AgendamentoNaAgenda;
  rotuloStatus: string;
  estilo: CSSProperties;
  titulo: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [cancelando, setCancelando] = useState(false);

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
        onClick={() => setAberto(true)}
        className="absolute left-1 right-1 overflow-hidden rounded-[7px] border px-1.5 py-1 text-left text-[11px] leading-tight transition hover:brightness-95"
        style={estilo}
        title={titulo}
      >
        <p className={`truncate font-medium ${a.status === "falta" ? "line-through" : ""}`}>
          {a.paciente?.nome ?? "—"}
        </p>
        <p className="truncate opacity-75">
          {hora.format(new Date(a.inicio))} · {a.procedimento?.nome ?? "—"}
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
