"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  alternarAtivoProcedimento,
  duplicarProcedimento,
  removerCusto,
  removerRequisito,
} from "@/lib/actions/procedimentos";
import type { Resultado } from "@/lib/actions/recursos";
import { Botao } from "@/components/ui/primitivos";

/** Botão discreto que executa uma ação e mostra o erro, se houver. */
function BotaoAcao({
  rotulo,
  pendenteRotulo,
  aoClicar,
  rotuloAcessivel,
}: {
  rotulo: string;
  pendenteRotulo: string;
  aoClicar: () => Promise<Resultado>;
  rotuloAcessivel?: string;
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
        variante="fantasma"
        disabled={pendente}
        aria-label={rotuloAcessivel}
        onClick={() => iniciar(async () => setErro((await aoClicar()).erro ?? null))}
      >
        {pendente ? pendenteRotulo : rotulo}
      </Botao>
    </span>
  );
}

/** RF-31 · tirar uma linha de custo lançada errada. */
export function RemoverCusto({
  id,
  procedimentoId,
  descricao,
}: {
  id: string;
  procedimentoId: string;
  descricao: string;
}) {
  return (
    <BotaoAcao
      rotulo="Remover"
      pendenteRotulo="Removendo…"
      rotuloAcessivel={`Remover custo ${descricao}`}
      aoClicar={() => removerCusto(id, procedimentoId)}
    />
  );
}

/** RF-33 · tirar um recurso exigido. */
export function RemoverRequisito({
  id,
  procedimentoId,
  modelo,
}: {
  id: string;
  procedimentoId: string;
  modelo: string;
}) {
  return (
    <BotaoAcao
      rotulo="Remover"
      pendenteRotulo="Removendo…"
      rotuloAcessivel={`Remover requisito ${modelo}`}
      aoClicar={() => removerRequisito(id, procedimentoId)}
    />
  );
}

/** RF-19 · inativar tira o procedimento da agenda e da venda; o histórico fica. */
export function AtivarProcedimento({ id, ativo }: { id: string; ativo: boolean }) {
  return (
    <BotaoAcao
      rotulo={ativo ? "Inativar" : "Reativar"}
      pendenteRotulo={ativo ? "Inativando…" : "Reativando…"}
      aoClicar={() => alternarAtivoProcedimento(id, !ativo)}
    />
  );
}

/** RF-19b · duplica e abre a cópia (inativa) para ajustar. */
export function DuplicarProcedimento({ id }: { id: string }) {
  const router = useRouter();
  return (
    <BotaoAcao
      rotulo="Duplicar"
      pendenteRotulo="Duplicando…"
      aoClicar={async () => {
        const r = await duplicarProcedimento(id);
        if (r.id) router.push(`/configuracoes/procedimentos/${r.id}`);
        return r;
      }}
    />
  );
}
