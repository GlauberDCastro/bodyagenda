"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { adicionarRequisito } from "@/lib/actions/procedimentos";
import type { Resultado } from "@/lib/actions/recursos";
import { Campo, Select, Input, Botao } from "@/components/ui/primitivos";
import { GatilhoModal, AcoesModal } from "@/components/ui/modal";

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

  const [estado, acao] = useActionState<Resultado, FormData>(async (anterior, formData) => {
    const r = await adicionarRequisito(anterior, formData);
    if (r.ok) setAberto(false);
    return r;
  }, {});


  return (
    <GatilhoModal
      rotulo="Exigir equipamento"
      titulo="Recurso exigido"
      descricao="Por modelo: o sistema acha sozinho qual unidade está livre."
      aberto={aberto}
      aoMudar={setAberto}
    >
      <form action={acao} className="space-y-4">
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
