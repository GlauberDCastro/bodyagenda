"use client";

import { useActionState, useState, useTransition } from "react";
import {
  copiarMetas,
  excluirMetaVenda,
  salvarMetaOcupacao,
  salvarMetaVenda,
} from "@/lib/actions/metas";
import type { Resultado } from "@/lib/actions/recursos";
import type { Meta } from "@/lib/domain/metas";
import { textoDoRitmo } from "@/lib/domain/metas";
import { Formulario, useEnvioFormulario } from "@/components/ui/formulario";
import { AcoesModal, Modal } from "@/components/ui/modal";
import { Aviso, Botao, Campo, Input, Secao, Select, Vazio } from "@/components/ui/primitivos";

const decimal = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

function Salvar({ rotulo = "Salvar" }: { rotulo?: string }) {
  const { pending } = useEnvioFormulario();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Salvando…" : rotulo}
    </Botao>
  );
}

export function FormularioOcupacao({
  mes,
  ocupacao,
  podeEditar,
}: {
  mes: string;
  ocupacao: number | null;
  podeEditar: boolean;
}) {
  const [estado, acao, enviando] = useActionState<Resultado, FormData>(salvarMetaOcupacao, {});
  return (
    <Formulario acao={acao} enviando={enviando} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="mes" value={mes} />
      <div className="w-48">
        <Campo label="Meta de ocupação (%)" erro={estado.campos?.ocupacao}>
          <Input
            name="ocupacao"
            inputMode="decimal"
            required
            disabled={!podeEditar}
            defaultValue={ocupacao === null ? "" : decimal(Math.round(ocupacao * 1000) / 10)}
            placeholder="20"
          />
        </Campo>
      </div>
      {podeEditar && <Salvar />}
      {estado.ok && <p className="pb-2 text-[13px] text-[var(--tinta-2)]">Meta salva.</p>}
      {estado.erro && !estado.campos && (
        <div className="basis-full">
          <Aviso tom="critico">{estado.erro}</Aviso>
        </div>
      )}
    </Formulario>
  );
}

export function CopiarMetas({ de, para }: { de: string; para: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <Aviso tom="neutro">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>Este mês ainda não tem metas. Quer partir das metas de {de}?</span>
        <Botao
          type="button"
          variante="marca"
          tamanho="sm"
          disabled={pendente}
          onClick={() => iniciar(async () => setErro((await copiarMetas(de, para)).erro ?? null))}
        >
          {pendente ? "Copiando…" : `Copiar metas de ${de}`}
        </Botao>
      </div>
      {erro && (
        <p role="alert" className="mt-1 text-[12.5px]" style={{ color: "var(--status-critico)" }}>
          {erro}
        </p>
      )}
    </Aviso>
  );
}

type MetaNaLista = Meta & { procedimento: string; nomesRegioes: string };
type Regiao = { procedimento_id: string; regiao_id: string; nome: string };

function FormularioMeta({
  mes,
  meta,
  procedimentos,
  regioes,
  aoFechar,
}: {
  mes: string;
  meta: MetaNaLista | null;
  procedimentos: { id: string; nome: string }[];
  regioes: Regiao[];
  aoFechar: () => void;
}) {
  const [procId, setProcId] = useState(meta?.procedimento_id ?? "");
  const [estado, acao, enviando] = useActionState<Resultado, FormData>(async (a, fd) => {
    const r = await salvarMetaVenda(meta?.id ?? null, a, fd);
    if (r.ok) aoFechar();
    return r;
  }, {});
  const doProc = regioes.filter((r) => r.procedimento_id === procId);

  return (
    <Formulario acao={acao} enviando={enviando} className="space-y-4">
      <input type="hidden" name="mes" value={mes} />
      <Campo label="Nome da meta" erro={estado.campos?.rotulo}>
        <Input
          name="rotulo"
          required
          autoFocus
          defaultValue={meta?.rotulo}
          placeholder="Ultraformer Papada"
        />
      </Campo>
      <Campo label="Procedimento" erro={estado.campos?.procedimento_id}>
        <Select
          name="procedimento_id"
          required
          value={procId}
          onChange={(e) => setProcId(e.target.value)}
        >
          <option value="">Escolha…</option>
          {procedimentos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </Select>
      </Campo>
      {doProc.length > 0 && (
        <Campo label="Regiões" dica="Sem nenhuma marcada, conta qualquer região do procedimento.">
          <div className="grid grid-cols-2 gap-1.5">
            {doProc.map((r) => (
              <label key={r.regiao_id} className="flex items-center gap-2 text-[13.5px]">
                <input
                  type="checkbox"
                  name="regioes"
                  value={r.regiao_id}
                  defaultChecked={meta?.regioes.includes(r.regiao_id)}
                />
                {r.nome}
              </label>
            ))}
          </div>
        </Campo>
      )}
      <Campo label="O que conta" erro={estado.campos?.contagem}>
        <Select name="contagem" defaultValue={meta?.contagem ?? "venda"}>
          <option value="venda">Cada venda (avulsa ou pacote)</option>
          <option value="pacote">Só pacotes vendidos</option>
        </Select>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo
          label="Mínimo por dia"
          erro={estado.campos?.por_dia_min}
          dica="1 a cada 2 dias = 0,5"
        >
          <Input
            name="por_dia_min"
            inputMode="decimal"
            required
            defaultValue={decimal(meta?.por_dia_min)}
          />
        </Campo>
        <Campo
          label="Máximo por dia"
          erro={estado.campos?.por_dia_max}
          dica="Opcional, para faixas (3 a 4)"
        >
          <Input name="por_dia_max" inputMode="decimal" defaultValue={decimal(meta?.por_dia_max)} />
        </Campo>
      </div>
      {estado.erro && !estado.campos && <Aviso tom="critico">{estado.erro}</Aviso>}
      <AcoesModal aoCancelar={aoFechar}>
        <Salvar rotulo={meta ? "Salvar meta" : "Criar meta"} />
      </AcoesModal>
    </Formulario>
  );
}

function Excluir({ id }: { id: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  if (!confirmando)
    return (
      <Botao type="button" variante="fantasma" tamanho="sm" onClick={() => setConfirmando(true)}>
        Excluir
      </Botao>
    );
  return (
    <span className="inline-flex items-center gap-1">
      {erro && (
        <span role="alert" className="text-[12px]" style={{ color: "var(--status-critico)" }}>
          {erro}
        </span>
      )}
      <Botao
        type="button"
        variante="perigo"
        tamanho="sm"
        disabled={pendente}
        onClick={() => iniciar(async () => setErro((await excluirMetaVenda(id)).erro ?? null))}
      >
        {pendente ? "Excluindo…" : "Confirmar exclusão"}
      </Botao>
      <Botao type="button" variante="fantasma" tamanho="sm" onClick={() => setConfirmando(false)}>
        Manter
      </Botao>
    </span>
  );
}

export function ListaMetas({
  mes,
  metas,
  procedimentos,
  regioes,
  podeEditar,
}: {
  mes: string;
  metas: MetaNaLista[];
  procedimentos: { id: string; nome: string }[];
  regioes: Regiao[];
  podeEditar: boolean;
}) {
  // undefined = fechado; null = nova; meta = editando
  const [editando, setEditando] = useState<MetaNaLista | null | undefined>(undefined);
  const fechar = () => setEditando(undefined);

  return (
    <Secao
      titulo="Metas de venda"
      descricao="Quantas vendas por dia de atendimento o time precisa fazer de cada procedimento."
      acao={
        podeEditar && (
          <Botao type="button" onClick={() => setEditando(null)}>
            Nova meta
          </Botao>
        )
      }
    >
      {metas.length === 0 ? (
        <Vazio>Nenhuma meta de venda neste mês.</Vazio>
      ) : (
        <div className="cartao overflow-x-auto p-0">
          <table className="w-full text-[14px]">
            <thead className="text-left text-[12.5px] text-[var(--tinta-2)]">
              <tr className="border-b border-[var(--traco)]">
                <th className="px-4 py-2.5 font-medium">Meta</th>
                <th className="px-3 py-2.5 font-medium">Procedimento</th>
                <th className="px-3 py-2.5 font-medium">Conta</th>
                <th className="px-3 py-2.5 font-medium">Ritmo</th>
                {podeEditar && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {metas.map((m) => (
                <tr key={m.id} className="border-b border-[var(--traco)] last:border-0">
                  <td className="px-4 py-2.5 font-medium">{m.rotulo}</td>
                  <td className="px-3 py-2.5">
                    {m.procedimento}
                    {m.nomesRegioes && (
                      <span className="block text-[12.5px] text-[var(--tinta-2)]">
                        {m.nomesRegioes}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--tinta-2)]">
                    {m.contagem === "pacote" ? "Pacotes" : "Vendas"}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {textoDoRitmo(m.por_dia_min, m.por_dia_max)}
                  </td>
                  {podeEditar && (
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <Botao
                        type="button"
                        variante="secundario"
                        tamanho="sm"
                        onClick={() => setEditando(m)}
                      >
                        Editar
                      </Botao>{" "}
                      <Excluir id={m.id} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        aberto={editando !== undefined}
        aoFechar={fechar}
        titulo={editando ? `Editar “${editando.rotulo}”` : "Nova meta de venda"}
        descricao={`Vale para ${mes}.`}
      >
        {editando !== undefined && (
          <FormularioMeta
            key={editando?.id ?? "nova"}
            mes={mes}
            meta={editando}
            procedimentos={procedimentos}
            regioes={regioes}
            aoFechar={fechar}
          />
        )}
      </Modal>
    </Secao>
  );
}
