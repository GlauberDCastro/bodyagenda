"use client";

import { AcoesRecurso } from "./acoes-recurso";
import { CamposEquipamento } from "@/app/(app)/configuracoes/equipamentos/formulario-equipamento";
import type { Equipamento, Sala } from "@/lib/types/database";

export function AcoesEquipamento({
  equipamento,
  salas,
}: {
  equipamento: Equipamento & { custo_hora?: number };
  salas: Sala[];
}) {
  return (
    <AcoesRecurso
      tipo="equipamento"
      id={equipamento.id}
      nome={equipamento.nome}
      ativo={equipamento.ativo}
      formularioEdicao={(fechar) => (
        <CamposEquipamento salas={salas} inicial={equipamento} aoConcluir={fechar} />
      )}
    />
  );
}
