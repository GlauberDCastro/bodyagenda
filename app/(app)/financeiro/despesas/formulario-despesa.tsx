"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { lancarDespesa } from "@/lib/actions/financeiro";
import type { Resultado } from "@/lib/actions/recursos";
import { Campo, Input, Botao } from "@/components/ui/primitivos";

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
  const [estado, acao] = useActionState<Resultado, FormData>(
    async (anterior, formData) => {
      const r = await lancarDespesa(anterior, formData);
      if (r.ok) setAberto(false);
      return r;
    },
    {},
  );

  if (!aberto) {
    return (
      <Botao type="button" onClick={() => setAberto(true)}>
        Nova despesa
      </Botao>
    );
  }

  return (
    <form
      action={acao}
      className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800"
    >
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
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {estado.erro}
        </p>
      )}

      <div className="flex gap-2">
        <Salvar />
        <Botao type="button" variante="secundario" onClick={() => setAberto(false)}>
          Cancelar
        </Botao>
      </div>
    </form>
  );
}
