"use client";

import { useState, useTransition } from "react";
import { definirHorarios } from "@/lib/actions/recursos";
import { semanaDasJanelas, type Janela } from "@/lib/horarios";
import type { TipoRecurso } from "@/lib/types/database";
import { Modal, AcoesModal } from "@/components/ui/modal";
import { Botao } from "@/components/ui/primitivos";
import { EditorSemana } from "./editor-semana";

/** Horário próprio de um recurso: a exceção ao padrão da clínica. */
export function EditarHorario({
  recurso,
  padrao,
}: {
  recurso: { tipo: TipoRecurso; id: string; nome: string; janelas: Janela[] };
  padrao: Janela[];
}) {
  const [aberto, setAberto] = useState(false);
  const [semana, setSemana] = useState(() => semanaDasJanelas(recurso.janelas));
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const abrir = () => {
    setSemana(semanaDasJanelas(recurso.janelas));
    setErro(null);
    setAberto(true);
  };

  const salvar = () =>
    iniciar(async () => {
      const r = await definirHorarios([{ tipo: recurso.tipo, id: recurso.id }], semana);
      setErro(r.erro ?? null);
      if (r.ok) setAberto(false);
    });

  return (
    <>
      <Botao
        type="button"
        variante="fantasma"
        onClick={abrir}
        aria-label={`Editar horário de ${recurso.nome}`}
      >
        Editar
      </Botao>

      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={recurso.nome}
        descricao="Horário em que este recurso pode receber agendamento."
      >
        <div className="space-y-3">
          <EditorSemana semana={semana} aoMudar={setSemana} />
          <button
            type="button"
            onClick={() => setSemana(semanaDasJanelas(padrao))}
            className="text-[13px] text-[var(--tinta-2)] underline-offset-4 hover:text-[var(--tinta-1)] hover:underline"
          >
            Usar o horário padrão da clínica
          </button>
          {erro && (
            <p role="alert" className="text-[13px]" style={{ color: "var(--status-critico)" }}>
              {erro}
            </p>
          )}
        </div>
        <AcoesModal aoCancelar={() => setAberto(false)}>
          <Botao type="button" onClick={salvar} disabled={pendente}>
            {pendente ? "Salvando…" : "Salvar horário"}
          </Botao>
        </AcoesModal>
      </Modal>
    </>
  );
}
