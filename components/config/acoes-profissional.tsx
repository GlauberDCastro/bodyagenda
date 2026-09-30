"use client";

import { AcoesRecurso } from "./acoes-recurso";
import {
  CamposProfissional,
  type ProfissionalCompleto,
} from "@/app/(app)/configuracoes/profissionais/formulario-profissional";
import type { Procedimento } from "@/lib/types/database";

export function AcoesProfissional({
  profissional,
  procedimentos,
}: {
  profissional: ProfissionalCompleto;
  procedimentos: Procedimento[];
}) {
  return (
    <AcoesRecurso
      tipo="profissional"
      id={profissional.id}
      nome={profissional.nome}
      ativo={profissional.ativo}
      formularioEdicao={(fechar) => (
        <CamposProfissional
          procedimentos={procedimentos}
          inicial={profissional}
          aoConcluir={fechar}
        />
      )}
    />
  );
}
