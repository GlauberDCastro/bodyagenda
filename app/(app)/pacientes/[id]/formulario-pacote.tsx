"use client";

import { useActionState, useState } from "react";
import { Formulario, useEnvioFormulario } from "@/components/ui/formulario";
import { venderPacote } from "@/lib/actions/pacientes";
import type { Resultado } from "@/lib/actions/recursos";
import { Campo, Input, Select, Botao } from "@/components/ui/primitivos";
import { GatilhoModal, AcoesModal } from "@/components/ui/modal";
import type { Procedimento } from "@/lib/types/database";
import { FORMAS_PAGAMENTO } from "@/lib/schemas/pacientes";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function Salvar() {
  const { pending } = useEnvioFormulario();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Vendendo…" : "Vender pacote"}
    </Botao>
  );
}

export function FormularioPacote({
  pacienteId,
  procedimentos,
  variante,
}: {
  pacienteId: string;
  procedimentos: Procedimento[];
  variante?: "primario" | "secundario";
}) {
  const [aberto, setAberto] = useState(false);
  const [procId, setProcId] = useState("");
  const [sessoes, setSessoes] = useState(1);
  const [valor, setValor] = useState(0);
  const [desconto, setDesconto] = useState(0);
  const [parcelas, setParcelas] = useState(1);

  const [estado, acao, enviando] = useActionState<Resultado, FormData>(async (anterior, formData) => {
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
  const porParcela = parcelas > 0 ? liquido / parcelas : 0;
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );

  return (
    <GatilhoModal
      rotulo="Vender pacote"
      variante={variante}
      titulo="Vender pacote"
      descricao="O valor fica congelado na venda — reajuste depois não altera este pacote."
      aberto={aberto}
      aoMudar={setAberto}
    >
      <Formulario acao={acao} enviando={enviando} estado={estado} className="space-y-4">
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

      {/* RF-80 · a venda já gera as cobranças: o caixa nasce aqui. */}
      <fieldset className="space-y-3 rounded-[var(--r-md)] border border-[var(--traco)] p-3">
        <legend className="px-1 text-[13px] font-medium">Pagamento</legend>
        <div className="grid grid-cols-3 gap-3">
          <Campo label="Forma">
            <Select name="forma_pagamento" defaultValue="Pix">
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo label="Parcelas" erro={estado.campos?.parcelas}>
            <Input
              name="parcelas"
              type="number"
              min={1}
              max={24}
              value={parcelas}
              onChange={(e) => setParcelas(Number(e.target.value))}
              required
            />
          </Campo>
          <Campo label="1º vencimento" erro={estado.campos?.primeiro_vencimento}>
            <Input name="primeiro_vencimento" type="date" defaultValue={hoje} required />
          </Campo>
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" name="primeira_paga" defaultChecked />
          {parcelas > 1 ? "1ª parcela paga agora" : "Pago agora"}
        </label>
        <p className="text-[12.5px] text-[var(--tinta-3)]">
          {parcelas > 1
            ? `${parcelas}× de ${brl.format(porParcela)}, vencendo todo mês a partir do 1º vencimento.`
            : `${brl.format(liquido)} à vista.`}{" "}
          As cobranças aparecem em Recebimentos.
        </p>
      </fieldset>

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
      </Formulario>
    </GatilhoModal>
  );
}
