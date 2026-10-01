"use client";

import { useTransition, useState } from "react";
import { duplicarEquipamento, duplicarProfissional, duplicarSala } from "@/lib/actions/recursos";
import type { TipoRecurso } from "@/lib/types/database";

const DUPLICAR: Record<TipoRecurso, (id: string) => ReturnType<typeof duplicarSala>> = {
  sala: duplicarSala,
  equipamento: duplicarEquipamento,
  profissional: duplicarProfissional,
};

/**
 * RF-19b · cadastrar o 5º Ultraformer copiando atributos e disponibilidade da
 * unidade existente, em vez de refazer as janelas de atendimento uma a uma.
 */
export function BotaoDuplicar({
  id,
  nome,
  tipo = "equipamento",
}: {
  id: string;
  nome: string;
  tipo?: TipoRecurso;
}) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="flex items-center justify-end gap-2">
      {erro && <span className="text-xs text-[color:var(--status-critico)]">{erro}</span>}
      <button
        type="button"
        disabled={pendente}
        title={`Duplicar ${nome} com o mesmo horário de atendimento`}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const r = await DUPLICAR[tipo](id);
            if (r.erro) setErro(r.erro);
          })
        }
        className="rounded-md px-2 py-1 text-xs text-[var(--tinta-3)] transition
 hover:bg-[var(--superficie-2)] hover:text-[var(--tinta-1)] disabled:opacity-50
 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        {pendente ? "Duplicando…" : "Duplicar"}
      </button>
    </div>
  );
}
