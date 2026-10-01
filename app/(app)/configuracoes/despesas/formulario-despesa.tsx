"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { lancarDespesa } from "@/lib/actions/financeiro";
import type { Resultado } from "@/lib/actions/recursos";
import { Campo, Input, Botao } from "@/components/ui/primitivos";
import { GatilhoModal, AcoesModal } from "@/components/ui/modal";

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Lançando…" : "Lançar despesa"}
    </Botao>
  );
}

export function FormularioDespesa({ competencia }: { competencia: string }) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao] = useActionState<Resultado, FormData>(async (anterior, formData) => {
    const r = await lancarDespesa(anterior, formData);
    if (r.ok) setAberto(false);
    return r;
  }, {});

  return (
    <GatilhoModal
      rotulo="Nova despesa"
      titulo="Nova despesa fixa"
      descricao="Rateada por hora de sala na competência."
      aberto={aberto}
      aoMudar={setAberto}
    >
      <form action={acao} className="space-y-4">
        <input type="hidden" name="competencia" value={competencia} />

        <Campo label="Descrição" erro={estado.campos?.descricao}>
          <Input name="descricao" required autoFocus placeholder="Aluguel" />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Categoria" erro={estado.campos?.categoria}>
            <Input name="categoria" placeholder="Instalações" />
          </Campo>
          <Campo label="Valor" erro={estado.campos?.valor}>
            <Input name="valor" type="number" step="0.01" min="0" required />
          </Campo>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="recorrente" />
          Repete todo mês
        </label>

        {estado.erro && !estado.campos && (
          <p role="alert" className="text-sm text-[color:var(--status-critico)]">
            {estado.erro}
          </p>
        )}

        <AcoesModal aoCancelar={() => setAberto(false)}>
          <Salvar />
        </AcoesModal>
      </form>
    </GatilhoModal>
  );
}
