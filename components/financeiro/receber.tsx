"use client";

import { useActionState, useState } from "react";
import { Formulario, useEnvioFormulario } from "@/components/ui/formulario";
import { registrarRecebimento } from "@/lib/actions/financeiro";
import type { Resultado } from "@/lib/actions/recursos";
import { FORMAS_PAGAMENTO } from "@/lib/schemas/pacientes";
import { GatilhoModal, AcoesModal } from "@/components/ui/modal";
import { Campo, Input, Select, Botao } from "@/components/ui/primitivos";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const hoje = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

function Salvar() {
  const { pending } = useEnvioFormulario();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Registrando…" : "Registrar recebimento"}
    </Botao>
  );
}

/** RF-81 · receber uma cobrança, inteira ou em parte. */
export function Receber({
  cobranca,
}: {
  cobranca: {
    id: string;
    valor: number;
    descricao: string | null;
    paciente_nome: string | null;
    forma_pagamento: string | null;
  };
}) {
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState(Number(cobranca.valor));
  const [estado, acao, enviando] = useActionState<Resultado, FormData>(async (anterior, formData) => {
    const r = await registrarRecebimento(anterior, formData);
    if (r.ok) setAberto(false);
    return r;
  }, {});

  const parcial = valor > 0 && valor < Number(cobranca.valor);

  return (
    <GatilhoModal
      rotulo="Receber"
      titulo="Registrar recebimento"
      descricao={[cobranca.paciente_nome, cobranca.descricao].filter(Boolean).join(" · ")}
      aberto={aberto}
      aoMudar={setAberto}
      variante="secundario"
    >
      <Formulario acao={acao} enviando={enviando} estado={estado} className="space-y-4">
        <input type="hidden" name="lancamento_id" value={cobranca.id} />
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Valor recebido" erro={estado.campos?.valor}>
            <Input
              name="valor"
              type="number"
              step="0.01"
              min="0.01"
              max={Number(cobranca.valor)}
              value={valor}
              onChange={(e) => setValor(Number(e.target.value))}
              required
            />
          </Campo>
          <Campo label="Data" erro={estado.campos?.data}>
            <Input name="data" type="date" defaultValue={hoje()} required />
          </Campo>
        </div>
        <Campo label="Forma de pagamento" erro={estado.campos?.forma}>
          <Select name="forma" defaultValue={cobranca.forma_pagamento ?? "Pix"}>
            {FORMAS_PAGAMENTO.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </Campo>
        {parcial && (
          <p className="text-[13px] text-[var(--tinta-2)]">
            Pagamento parcial: {brl.format(Number(cobranca.valor) - valor)} continuam em aberto
            com o mesmo vencimento.
          </p>
        )}
        {estado.erro && !estado.campos && (
          <p role="alert" className="text-[13px]" style={{ color: "var(--status-critico)" }}>
            {estado.erro}
          </p>
        )}
        <AcoesModal aoCancelar={() => setAberto(false)}>
          <Salvar />
        </AcoesModal>
      </Formulario>
    </GatilhoModal>
  );
}
