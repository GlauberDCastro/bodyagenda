"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { adicionarCusto } from "@/lib/actions/procedimentos";
import type { Resultado } from "@/lib/actions/recursos";
import { Campo, Input, Select, Botao } from "@/components/ui/primitivos";
import { GatilhoModal, AcoesModal } from "@/components/ui/modal";

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Adicionando…" : "Adicionar custo"}
    </Botao>
  );
}

export function FormularioCusto({ procedimentoId }: { procedimentoId: string }) {
  const [aberto, setAberto] = useState(false);

  const [estado, acao] = useActionState<Resultado, FormData>(async (anterior, formData) => {
    const r = await adicionarCusto(anterior, formData);
    if (r.ok) setAberto(false);
    return r;
  }, {});

  return (
    <GatilhoModal
      rotulo="Novo custo"
      titulo="Novo custo"
      descricao="Custo por sessão. Sem ele não existe margem."
      aberto={aberto}
      aoMudar={setAberto}
    >
      <form action={acao} className="space-y-4">
        <input type="hidden" name="procedimento_id" value={procedimentoId} />

        <Campo label="Descrição" erro={estado.campos?.descricao}>
          <Input name="descricao" required autoFocus placeholder="Toxina 50 UI" />
        </Campo>

        <Campo label="Tipo" erro={estado.campos?.tipo}>
          <Select name="tipo" defaultValue="insumo">
            <option value="insumo">Insumo</option>
            <option value="mao_de_obra">Mão de obra</option>
            <option value="equipamento">Equipamento</option>
            <option value="outro">Outro</option>
          </Select>
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Valor unitário" erro={estado.campos?.valor_unitario}>
            <Input name="valor_unitario" type="number" step="0.01" min="0" required />
          </Campo>
          <Campo label="Quantidade" erro={estado.campos?.quantidade} dica="Por sessão.">
            <Input
              name="quantidade"
              type="number"
              step="0.001"
              min="0.001"
              defaultValue={1}
              required
            />
          </Campo>
        </div>

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
