"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { venderPacote } from "@/lib/actions/pacientes";
import type { Resultado } from "@/lib/actions/recursos";
import { Campo, Input, Select, Botao } from "@/components/ui/primitivos";
import { GatilhoModal, AcoesModal } from "@/components/ui/modal";
import type { Procedimento } from "@/lib/types/database";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Vendendo…" : "Vender pacote"}
    </Botao>
  );
}

export function FormularioPacote({
  pacienteId,
  procedimentos,
}: {
  pacienteId: string;
  procedimentos: Procedimento[];
}) {
  const [aberto, setAberto] = useState(false);
  const [procId, setProcId] = useState("");
  const [sessoes, setSessoes] = useState(1);
  const [valor, setValor] = useState(0);
  const [desconto, setDesconto] = useState(0);

  const [estado, acao] = useActionState<Resultado, FormData>(async (anterior, formData) => {
    const r = await venderPacote(anterior, formData);
    if (r.ok) setAberto(false);
    return r;
  }, {});


  /** Preenche a partir do catálogo, mas o valor continua editável: pacote
   * vendido congela o preço (RN-09), então promoção não altera a tabela. */
  function aoEscolherProcedimento(id: string) {
    setProcId(id);
    const p = procedimentos.find((x) => x.id === id);
    if (p) {
      setSessoes(p.sessoes_padrao);
      setValor(Number(p.valor_sessao) * p.sessoes_padrao);
    }
  }

  const liquido = Math.max(0, valor - desconto);
  const porSessao = sessoes > 0 ? liquido / sessoes : 0;

  return (
    <GatilhoModal
      rotulo="Vender pacote"
      titulo="Vender pacote"
      descricao="O valor fica congelado na venda — reajuste depois não altera este pacote."
      aberto={aberto}
      aoMudar={setAberto}
    >
      <form action={acao} className="space-y-4">
      <input type="hidden" name="paciente_id" value={pacienteId} />

      <Campo label="Procedimento" erro={estado.campos?.procedimento_id}>
        <Select
          name="procedimento_id"
          value={procId}
          onChange={(e) => aoEscolherProcedimento(e.target.value)}
          required
        >
          <option value="">Selecione…</option>
          {procedimentos
            .filter((p) => p.ativo)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} — {p.sessoes_padrao}× {brl.format(Number(p.valor_sessao))}
              </option>
            ))}
        </Select>
      </Campo>

      <div className="grid grid-cols-3 gap-3">
        <Campo label="Sessões" erro={estado.campos?.quantidade_sessoes}>
          <Input
            name="quantidade_sessoes"
            type="number"
            min={1}
            value={sessoes}
            onChange={(e) => setSessoes(Number(e.target.value))}
            required
          />
        </Campo>
        <Campo label="Valor total" erro={estado.campos?.valor_total}>
          <Input
            name="valor_total"
            type="number"
            step="0.01"
            min="0"
            value={valor}
            onChange={(e) => setValor(Number(e.target.value))}
            required
          />
        </Campo>
        <Campo label="Desconto" erro={estado.campos?.desconto}>
          <Input
            name="desconto"
            type="number"
            step="0.01"
            min="0"
            value={desconto}
            onChange={(e) => setDesconto(Number(e.target.value))}
          />
        </Campo>
      </div>

      <div className="rounded-lg bg-[var(--superficie-2)] p-3 text-sm ">
        <div className="flex justify-between">
          <span className="text-[var(--tinta-3)]">Líquido</span>
          <span className="font-medium tabular-nums">{brl.format(liquido)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--tinta-3)]">Por sessão</span>
          <span className="font-medium tabular-nums">{brl.format(porSessao)}</span>
        </div>
        {sessoes > 1 && (
          <p className="mt-2 text-xs text-[var(--tinta-3)]">
            Compromete {sessoes} horário(s) de agenda por um caixa único.
          </p>
        )}
      </div>

      <Campo
        label="Validade"
        erro={estado.campos?.validade}
        dica="Opcional. Depois desta data o pacote não pode mais ser agendado."
      >
        <Input name="validade" type="date" />
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
