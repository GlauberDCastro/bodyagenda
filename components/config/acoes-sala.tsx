"use client";

import { AcoesRecurso } from "./acoes-recurso";
import { CamposSala } from "@/app/(app)/configuracoes/salas/formulario-sala";
import type { Procedimento, Sala } from "@/lib/types/database";

/**
 * Cliente fino que amarra o menu de ações ao formulário de edição da sala.
 *
 * Existe porque `formularioEdicao` é uma função, e função não atravessa a
 * fronteira servidor→cliente. A página (servidor) passa só dados; este
 * componente monta o formulário.
 */
export function AcoesSala({ sala, procedimentos }: { sala: Sala; procedimentos: Procedimento[] }) {
  return (
    <AcoesRecurso
      tipo="sala"
      id={sala.id}
      nome={`Sala ${sala.numero}`}
      ativo={sala.ativo}
      formularioEdicao={(fechar) => (
        <CamposSala procedimentos={procedimentos} inicial={sala} aoConcluir={fechar} />
      )}
    />
  );
}
