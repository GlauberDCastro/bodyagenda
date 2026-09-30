"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { adicionarRequisito } from "@/lib/actions/procedimentos";
import type { Resultado } from "@/lib/actions/recursos";
import { Campo, Select, Input, Botao } from "@/components/ui/primitivos";

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Adicionando…" : "Adicionar"}
    </Botao>
  );
}

export function FormularioRequisito({
  procedimentoId,
  modelos,
}: {
  procedimentoId: string;
  modelos: string[];
}) {
  const [aberto, setAberto] = useState(false);

  const [estado, acao] = useActionState<Resultado, FormData>(
    async (anterior, formData) => {
      const r = await adicionarRequisito(anterior, formData);
      if (r.ok) setAberto(false);
      return r;
    },
    {},
  );

  if (!aberto) {
    return (
      <Botao type="button" onClick={() => setAberto(true)} disabled={modelos.length === 0}>
        Exigir equipamento
      </Botao>
    );
  }

  return (
    <form
      action={acao}
      className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800"
    >
      <input type="hidden" name="procedimento_id" value={procedimentoId} />
      <input type="hidden" name="recurso_tipo" value="equipamento" />

      <Campo
        label="Modelo do equipamento"
        erro={estado.campos?.modelo}
        dica="Qualquer unidade livre deste modelo serve."
      >
        <Select name="modelo" required>
          <option value="">Selecione…</option>
          {modelos.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </Campo>

      <Campo label="Quantidade" erro={estado.campos?.quantidade}>
        <Input name="quantidade" type="number" min={1} defaultValue={1} required />
      </Campo>

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
