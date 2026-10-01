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

type Tipo = "equipamento" | "sala" | "profissional";

/** RF-33 · o que o procedimento exige: aparelho por modelo, sala ou profissionais. */
export function FormularioRequisito({
  procedimentoId,
  modelos,
  salas,
}: {
  procedimentoId: string;
  modelos: string[];
  salas: { id: string; numero: number; nome: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<Tipo>("equipamento");

  const [estado, acao] = useActionState<Resultado, FormData>(async (anterior, formData) => {
    const r = await adicionarRequisito(anterior, formData);
    if (r.ok) setAberto(false);
    return r;
  }, {});

  return (
    <GatilhoModal
      rotulo="Exigir recurso"
      titulo="Recurso exigido"
      descricao="Obrigatório barra o agendamento sem ele; opcional só já vem marcado na agenda."
      aberto={aberto}
      aoMudar={setAberto}
    >
      <form action={acao} className="space-y-4">
        <input type="hidden" name="procedimento_id" value={procedimentoId} />

        <Campo label="Tipo">
          <Select name="recurso_tipo" value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
            <option value="equipamento">Aparelho (por modelo)</option>
            <option value="sala">Sala específica</option>
            <option value="profissional">Profissionais (quantidade)</option>
          </Select>
        </Campo>

        {tipo === "equipamento" && (
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
        )}

        {tipo === "sala" && (
          <Campo label="Sala" erro={estado.campos?.recurso_id}>
            <Select name="recurso_id" required>
              <option value="">Selecione…</option>
              {salas.map((s) => (
                <option key={s.id} value={s.id}>
                  Sala {s.numero} — {s.nome}
                </option>
              ))}
            </Select>
          </Campo>
        )}

        {tipo !== "sala" && (
          <Campo
            label="Quantidade"
            erro={estado.campos?.quantidade}
            dica={
              tipo === "profissional"
                ? "Quantas pessoas atendem juntas. Quem pode atender vem da habilitação."
                : undefined
            }
          >
            <Input name="quantidade" type="number" min={1} defaultValue={1} required />
          </Campo>
        )}

        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" name="obrigatorio" defaultChecked />
          Obrigatório
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
