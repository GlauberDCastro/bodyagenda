"use client";

import { useState, useTransition } from "react";
import { inativarPaciente, reativarPaciente } from "@/lib/actions/pacientes";
import { Modal, AcoesModal } from "@/components/ui/modal";
import { Botao } from "@/components/ui/primitivos";

/** RF-15 · paciente é inativado, nunca excluído: o histórico continua. */
export function AtivarPaciente({ id, ativo, nome }: { id: string; ativo: boolean; nome: string }) {
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  if (!ativo) {
    return (
      <Botao
        type="button"
        variante="fantasma"
        disabled={pendente}
        onClick={() => iniciar(async () => setErro((await reativarPaciente(id)).erro ?? null))}
      >
        {pendente ? "Reativando…" : "Reativar"}
      </Botao>
    );
  }

  return (
    <>
      <Botao type="button" variante="fantasma" onClick={() => setAberto(true)}>
        Inativar
      </Botao>
      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={`Inativar ${nome}?`}
        descricao="O paciente some da busca do agendamento, mas a ficha, os pacotes e o histórico financeiro continuam. Dá para reativar depois."
      >
        {erro && (
          <p role="alert" className="text-[13px]" style={{ color: "var(--status-critico)" }}>
            {erro}
          </p>
        )}
        <AcoesModal aoCancelar={() => setAberto(false)}>
          <Botao
            type="button"
            variante="perigo"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await inativarPaciente(id);
                setErro(r.erro ?? null);
                if (r.ok) setAberto(false);
              })
            }
          >
            {pendente ? "Inativando…" : "Inativar paciente"}
          </Botao>
        </AcoesModal>
      </Modal>
    </>
  );
}
