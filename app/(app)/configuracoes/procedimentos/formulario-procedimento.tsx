"use client";

import { useActionState, useState } from "react";
import { Formulario, useEnvioFormulario } from "@/components/ui/formulario";
import { salvarProcedimento } from "@/lib/actions/procedimentos";
import type { Resultado } from "@/lib/actions/recursos";
import { calcularMargem, type LinhaCusto } from "@/lib/domain/margem";
import type { Procedimento } from "@/lib/types/database";
import { Campo, Input, Textarea, Botao } from "@/components/ui/primitivos";
import { GatilhoModal, AcoesModal } from "@/components/ui/modal";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function Salvar() {
  const { pending } = useEnvioFormulario();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Salvar procedimento"}
    </Botao>
  );
}

/** Cadastro (sem `inicial`) ou edição de procedimento (RF-19). */
export function FormularioProcedimento({
  inicial,
  custos = [],
}: {
  inicial?: Procedimento;
  /** Custos já lançados: a margem da prévia sai real, não só a receita. */
  custos?: LinhaCusto[];
}) {
  const [aberto, setAberto] = useState(false);
  const [duracao, setDuracao] = useState(inicial?.duracao_min ?? 30);
  const [valor, setValor] = useState(Number(inicial?.valor_sessao ?? 0));
  const [sessoes, setSessoes] = useState(inicial?.sessoes_padrao ?? 1);

  const [estado, acao, enviando] = useActionState<Resultado, FormData>(async (anterior, formData) => {
    const r = await salvarProcedimento(inicial?.id ?? null, anterior, formData);
    if (r.ok) setAberto(false);
    return r;
  }, {});

  // RF-32 · margem ao vivo enquanto o gestor digita, sem ida ao servidor.
  const previa = calcularMargem({ valorSessao: valor, duracaoMin: duracao, custos });

  return (
    <GatilhoModal
      rotulo={inicial ? "Editar" : "Novo procedimento"}
      titulo={inicial ? `Editar ${inicial.nome}` : "Novo procedimento"}
      descricao="O valor é POR SESSÃO, não do pacote."
      aberto={aberto}
      aoMudar={setAberto}
      variante={inicial ? "secundario" : "primario"}
    >
      <Formulario acao={acao} enviando={enviando} estado={estado} className="space-y-4">
      <Campo label="Nome" erro={estado.campos?.nome}>
        <Input
          name="nome"
          required
          autoFocus
          placeholder="Ultraformer Olhos"
          defaultValue={inicial?.nome}
        />
      </Campo>

      <Campo label="Descrição" erro={estado.campos?.descricao}>
        <Textarea name="descricao" rows={2} defaultValue={inicial?.descricao ?? ""} />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo label="Duração (min)" erro={estado.campos?.duracao_min}>
          <Input
            name="duracao_min"
            type="number"
            min={1}
            value={duracao}
            onChange={(e) => setDuracao(Number(e.target.value))}
            required
          />
        </Campo>
        <Campo
          label="Preparo (min)"
          erro={estado.campos?.buffer_min}
          dica="Troca de paciente e higienização."
        >
          <Input name="buffer_min" type="number" min={0} defaultValue={inicial?.buffer_min ?? 0} />
        </Campo>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Campo label="Sessões do protocolo" erro={estado.campos?.sessoes_padrao}>
          <Input
            name="sessoes_padrao"
            type="number"
            min={1}
            value={sessoes}
            onChange={(e) => setSessoes(Number(e.target.value))}
            required
          />
        </Campo>
        <Campo
          label="Valor POR SESSÃO"
          erro={estado.campos?.valor_sessao}
          dica="Não é o valor do pacote."
        >
          <Input
            name="valor_sessao"
            type="number"
            step="0.01"
            min="0"
            value={valor}
            onChange={(e) => setValor(Number(e.target.value))}
            required
          />
        </Campo>
      </div>

      <Campo
        label="Carência entre sessões (dias)"
        erro={estado.campos?.intervalo_min_dias}
        dica="A agenda avisa se for desrespeitada, mas não bloqueia."
      >
        <Input
          name="intervalo_min_dias"
          type="number"
          min={0}
          defaultValue={inicial?.intervalo_min_dias ?? 0}
        />
      </Campo>

      <div className="space-y-1 rounded-lg bg-[var(--superficie-2)] p-3 text-sm ">
        <div className="flex justify-between">
          <span className="text-[var(--tinta-3)]">Receita por hora</span>
          <span className="font-medium tabular-nums">
            {previa.receitaPorHora === null ? "—" : brl.format(previa.receitaPorHora)}
          </span>
        </div>
        {sessoes > 1 && (
          <div className="flex justify-between">
            <span className="text-[var(--tinta-3)]">Protocolo de {sessoes}</span>
            <span className="font-medium tabular-nums">
              {brl.format(valor * sessoes)} · {(duracao * sessoes) / 60} h de agenda
            </span>
          </div>
        )}
        {custos.length > 0 ? (
          <>
            <div className="flex justify-between">
              <span className="text-[var(--tinta-3)]">Custo direto por sessão</span>
              <span className="font-medium tabular-nums">{brl.format(previa.custoDireto)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--tinta-3)]">Margem de contribuição</span>
              <span className="font-medium tabular-nums">
                {brl.format(previa.margem)}
                {previa.margemPct !== null && ` · ${(previa.margemPct * 100).toFixed(1)}%`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--tinta-3)]">Margem por hora</span>
              <span className="font-medium tabular-nums">
                {previa.margemPorHora === null ? "—" : brl.format(previa.margemPorHora)}
              </span>
            </div>
          </>
        ) : (
          <p className="pt-1 text-xs text-[var(--tinta-3)]">
            Margem só aparece depois de cadastrar os custos, na página do procedimento.
          </p>
        )}
      </div>

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
