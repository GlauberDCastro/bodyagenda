"use client";

import { useState, useTransition } from "react";
import { fecharComissoes, pagarComissoes } from "@/lib/actions/financeiro";
import type { Resultado } from "@/lib/actions/recursos";
import { Botao } from "@/components/ui/primitivos";

function Acao({
  rotulo,
  pendenteRotulo,
  executar,
  variante = "secundario",
}: {
  rotulo: string;
  pendenteRotulo: string;
  executar: () => Promise<Resultado>;
  variante?: "primario" | "secundario";
}) {
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
        variante={variante}
        disabled={pendente}
        onClick={() => iniciar(async () => setErro((await executar()).erro ?? null))}
      >
        {pendente ? pendenteRotulo : rotulo}
      </Botao>
    </span>
  );
}

/** RF-85 · previstas viram apuradas: o valor da competência fica fechado. */
export function FecharCompetencia({ competencia }: { competencia: string }) {
  return (
    <Acao
      rotulo="Fechar competência"
      pendenteRotulo="Fechando…"
      variante="primario"
      executar={() => fecharComissoes(competencia)}
    />
  );
}

export function PagarProfissional({
  competencia,
  profissionalId,
}: {
  competencia: string;
  profissionalId: string;
}) {
  return (
    <Acao
      rotulo="Registrar pagamento"
      pendenteRotulo="Registrando…"
      executar={() => pagarComissoes(competencia, profissionalId)}
    />
  );
}
