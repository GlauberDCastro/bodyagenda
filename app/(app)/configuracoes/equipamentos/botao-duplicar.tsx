"use client";

import { useTransition, useState } from "react";
import { duplicarEquipamento } from "@/lib/actions/recursos";

/**
 * RF-19b · cadastrar o 5º Ultraformer copiando atributos e disponibilidade da
 * unidade existente, em vez de refazer as janelas de atendimento uma a uma.
 */
export function BotaoDuplicar({ id, nome }: { id: string; nome: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="flex items-center justify-end gap-2">
      {erro && <span className="text-xs text-red-600 dark:text-red-400">{erro}</span>}
      <button
        type="button"
        disabled={pendente}
        title={`Duplicar ${nome} com a mesma agenda de disponibilidade`}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const r = await duplicarEquipamento(id);
            if (r.erro) setErro(r.erro);
          })
        }
        className="rounded-md px-2 py-1 text-xs text-slate-500 transition
                   hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50
                   dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        {pendente ? "Duplicando…" : "Duplicar"}
      </button>
    </div>
  );
}
