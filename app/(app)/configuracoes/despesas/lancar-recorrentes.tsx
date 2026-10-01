"use client";

import { useState, useTransition } from "react";
import { lancarRecorrentes } from "@/lib/actions/financeiro";
import { Botao } from "@/components/ui/primitivos";

/** RF-86 · traz para o mês as despesas recorrentes do mês anterior. */
export function LancarRecorrentes({ competencia, qtd }: { competencia: string; qtd: number }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      {erro && (
        <span role="alert" className="text-[12px]" style={{ color: "var(--status-critico)" }}>
          {erro}
        </span>
      )}
      <Botao
        type="button"
        variante="secundario"
        disabled={pendente}
        onClick={() => iniciar(async () => setErro((await lancarRecorrentes(competencia)).erro ?? null))}
      >
        {pendente ? "Lançando…" : `Lançar ${qtd} recorrente(s)`}
      </Botao>
    </span>
  );
}
