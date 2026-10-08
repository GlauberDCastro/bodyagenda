"use client";

import { useActionState, useState, useTransition } from "react";
import { ativarMarca, salvarMarca } from "@/lib/actions/marcas";
import type { Resultado } from "@/lib/actions/recursos";
import { Formulario, useEnvioFormulario } from "@/components/ui/formulario";
import { AcoesModal, Modal } from "@/components/ui/modal";
import { Aviso, Botao, Campo, Input, Vazio } from "@/components/ui/primitivos";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export interface Marca {
  id: string;
  nome: string;
  valor_sessao: number;
  valor_parcelado: number | null;
  ativo: boolean;
}

function Salvar({ rotulo }: { rotulo: string }) {
  const { pending } = useEnvioFormulario();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Salvando…" : rotulo}
    </Botao>
  );
}

function FormularioMarca({
  procedimentoId,
  marca,
  aoFechar,
}: {
  procedimentoId: string;
  marca: Marca | null;
  aoFechar: () => void;
}) {
  const [avista, setAvista] = useState(marca ? String(marca.valor_sessao) : "");
  const [estado, acao, enviando] = useActionState<Resultado, FormData>(async (a, fd) => {
    const r = await salvarMarca(marca?.id ?? null, a, fd);
    if (r.ok) aoFechar();
    return r;
  }, {});
  const sugestao =
    Number(avista.replace(",", ".")) > 0
      ? Math.ceil((Number(avista.replace(",", ".")) / 0.85) * 100) / 100
      : null;

  return (
    <Formulario acao={acao} enviando={enviando} className="space-y-4">
      <input type="hidden" name="procedimento_id" value={procedimentoId} />
      <Campo label="Marca" erro={estado.campos?.nome}>
        <Input name="nome" required autoFocus defaultValue={marca?.nome} placeholder="Botox" />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="À vista por sessão" erro={estado.campos?.valor_sessao}>
          <Input
            name="valor_sessao"
            inputMode="decimal"
            required
            value={avista}
            onChange={(e) => setAvista(e.target.value)}
          />
        </Campo>
        <Campo
          label="Parcelado por sessão"
          erro={estado.campos?.valor_parcelado}
          dica={
            sugestao
              ? `À vista ÷ 0,85 = ${brl.format(sugestao)}. Vazio = mesmo valor.`
              : "Vazio = mesmo valor à vista."
          }
        >
          <Input
            name="valor_parcelado"
            inputMode="decimal"
            defaultValue={marca?.valor_parcelado ?? ""}
          />
        </Campo>
      </div>
      {estado.erro && !estado.campos && <Aviso tom="critico">{estado.erro}</Aviso>}
      <AcoesModal aoCancelar={aoFechar}>
        <Salvar rotulo={marca ? "Salvar marca" : "Adicionar marca"} />
      </AcoesModal>
    </Formulario>
  );
}

function Ativar({ marca }: { marca: Marca }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <>
      {erro && (
        <span role="alert" className="mr-2 text-[12px]" style={{ color: "var(--status-critico)" }}>
          {erro}
        </span>
      )}
      <Botao
        type="button"
        variante="fantasma"
        tamanho="sm"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => setErro((await ativarMarca(marca.id, !marca.ativo)).erro ?? null))
        }
      >
        {marca.ativo ? "Desativar" : "Reativar"}
      </Botao>
    </>
  );
}

/** Marcas do produto: cada uma com preço à vista e parcelado (toxina Botox, Dysport…). */
export function MarcasDoProcedimento({
  procedimentoId,
  marcas,
}: {
  procedimentoId: string;
  marcas: Marca[];
}) {
  // undefined = fechado; null = nova
  const [editando, setEditando] = useState<Marca | null | undefined>(undefined);
  const fechar = () => setEditando(undefined);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="titulo-md">Marcas do produto</h2>
          <p className="mt-0.5 text-[12.5px] text-[var(--tinta-3)]">
            Quando a marca muda o preço (toxina, preenchedor). Na venda, o preço da marca vale no
            lugar do procedimento; na meta, todas as marcas contam juntas.
          </p>
        </div>
        <Botao type="button" variante="secundario" onClick={() => setEditando(null)}>
          Adicionar marca
        </Botao>
      </div>
      {marcas.length === 0 ? (
        <Vazio>Sem marcas: o preço é o do procedimento.</Vazio>
      ) : (
        <div className="cartao overflow-x-auto p-0">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-[var(--traco)] text-left text-[12px] font-medium text-[var(--tinta-3)]">
                <th className="px-4 py-2.5">Marca</th>
                <th className="px-4 py-2.5 text-right">À vista</th>
                <th className="px-4 py-2.5 text-right">Parcelado</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {marcas.map((m) => (
                <tr key={m.id} className="border-b border-[var(--traco)] last:border-0">
                  <td className="px-4 py-2.5 font-medium">
                    {m.nome}
                    {!m.ativo && (
                      <span className="ml-2 text-[12px] font-normal text-[var(--tinta-3)]">
                        inativa
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {brl.format(m.valor_sessao)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {brl.format(m.valor_parcelado ?? m.valor_sessao)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <Botao
                      type="button"
                      variante="secundario"
                      tamanho="sm"
                      onClick={() => setEditando(m)}
                    >
                      Editar
                    </Botao>{" "}
                    <Ativar marca={m} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal
        aberto={editando !== undefined}
        aoFechar={fechar}
        titulo={editando ? `Editar marca ${editando.nome}` : "Nova marca"}
      >
        {editando !== undefined && (
          <FormularioMarca
            key={editando?.id ?? "nova"}
            procedimentoId={procedimentoId}
            marca={editando}
            aoFechar={fechar}
          />
        )}
      </Modal>
    </section>
  );
}
