"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { salvarProtocolo, removerProtocolo } from "@/lib/actions/regioes";
import { UNIDADES } from "@/lib/constantes";
import type { Resultado } from "@/lib/actions/recursos";
import { Campo, Input, Select, Textarea, Botao } from "@/components/ui/primitivos";
import { GatilhoModal, AcoesModal, Modal } from "@/components/ui/modal";

export interface RegiaoOpcao {
  id: string;
  nome: string;
  grupo: string | null;
}

export interface Protocolo {
  id: string;
  regiao_id: string;
  duracao_min: number | null;
  sessoes_padrao: number | null;
  valor_sessao: number | null;
  intervalo_min_dias: number | null;
  unidade: string;
  quantidade_padrao: number;
  observacoes: string | null;
}

function Salvar({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Salvando…" : rotulo}
    </Botao>
  );
}

function CamposProtocolo({
  procedimentoId,
  regioes,
  inicial,
  aoConcluir,
}: {
  procedimentoId: string;
  regioes: RegiaoOpcao[];
  inicial?: Protocolo;
  aoConcluir: () => void;
}) {
  const [unidade, setUnidade] = useState(inicial?.unidade ?? "sessao");

  const [estado, acao] = useActionState<Resultado, FormData>(async (anterior, formData) => {
    const r = await salvarProtocolo(inicial?.id ?? null, anterior, formData);
    if (r.ok) aoConcluir();
    return r;
  }, {});

  // Agrupa no <optgroup> para uma lista de 29 regiões continuar navegável.
  const grupos = [...new Set(regioes.map((r) => r.grupo ?? "Outras"))];

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="procedimento_id" value={procedimentoId} />

      <Campo label="Região" erro={estado.campos?.regiao_id}>
        <Select
          name="regiao_id"
          required
          defaultValue={inicial?.regiao_id ?? ""}
          disabled={!!inicial}
        >
          <option value="">Selecione…</option>
          {grupos.map((g) => (
            <optgroup key={g} label={g}>
              {regioes
                .filter((r) => (r.grupo ?? "Outras") === g)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
        {inicial && <input type="hidden" name="regiao_id" value={inicial.regiao_id} />}
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Unidade de medida" dica="Harmonização se mede em UI ou ml, não em sessão.">
          <Select name="unidade" value={unidade} onChange={(e) => setUnidade(e.target.value)}>
            {UNIDADES.map((u) => (
              <option key={u.valor} value={u.valor}>
                {u.rotulo}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo
          label={`Quantidade por aplicação`}
          erro={estado.campos?.quantidade_padrao}
          dica={unidade === "sessao" ? "1 para sessão simples." : undefined}
        >
          <Input
            name="quantidade_padrao"
            type="number"
            step="0.01"
            min="0.01"
            required
            defaultValue={inicial?.quantidade_padrao ?? 1}
          />
        </Campo>
      </div>

      <div className="rounded-[var(--r-md)] bg-[var(--superficie-2)] p-3">
        <p className="mb-3 text-[12.5px] text-[var(--tinta-2)]">
          Em branco, herda do procedimento. Preencher só para repetir o mesmo número garante que os
          dois divirjam quando o procedimento mudar.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Duração (min)" erro={estado.campos?.duracao_min}>
            <Input
              name="duracao_min"
              type="number"
              min={1}
              defaultValue={inicial?.duracao_min ?? ""}
            />
          </Campo>
          <Campo label="Sessões do protocolo" erro={estado.campos?.sessoes_padrao}>
            <Input
              name="sessoes_padrao"
              type="number"
              min={1}
              defaultValue={inicial?.sessoes_padrao ?? ""}
            />
          </Campo>
          <Campo label="Valor por sessão" erro={estado.campos?.valor_sessao}>
            <Input
              name="valor_sessao"
              type="number"
              step="0.01"
              min="0"
              defaultValue={inicial?.valor_sessao ?? ""}
            />
          </Campo>
          <Campo label="Carência (dias)" erro={estado.campos?.intervalo_min_dias}>
            <Input
              name="intervalo_min_dias"
              type="number"
              min={0}
              defaultValue={inicial?.intervalo_min_dias ?? ""}
            />
          </Campo>
        </div>
      </div>

      <Campo label="Observações">
        <Textarea name="observacoes" rows={2} defaultValue={inicial?.observacoes ?? ""} />
      </Campo>

      {estado.erro && !estado.campos && (
        <p role="alert" className="text-[13px] text-[color:var(--status-critico)]">
          {estado.erro}
        </p>
      )}

      <AcoesModal aoCancelar={aoConcluir}>
        <Salvar rotulo={inicial ? "Salvar alterações" : "Adicionar região"} />
      </AcoesModal>
    </form>
  );
}

export function FormularioRegiao({
  procedimentoId,
  regioes,
}: {
  procedimentoId: string;
  regioes: RegiaoOpcao[];
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <GatilhoModal
      rotulo="Adicionar região"
      titulo="Região do procedimento"
      descricao="Define duração, preço e dosagem desta região específica."
      aberto={aberto}
      aoMudar={setAberto}
      desabilitado={regioes.length === 0}
    >
      <CamposProtocolo
        procedimentoId={procedimentoId}
        regioes={regioes}
        aoConcluir={() => setAberto(false)}
      />
    </GatilhoModal>
  );
}

export function AcoesProtocolo({
  procedimentoId,
  regioes,
  protocolo,
  nomeRegiao,
}: {
  procedimentoId: string;
  regioes: RegiaoOpcao[];
  protocolo: Protocolo;
  nomeRegiao: string;
}) {
  const [editando, setEditando] = useState(false);
  const [removendo, setRemovendo] = useState(false);

  const botao =
    "grid size-7 place-items-center rounded-full text-[var(--tinta-3)] transition-colors hover:bg-[var(--superficie-2)] hover:text-[var(--tinta-1)]";

  return (
    <div className="flex items-center justify-end gap-0.5">
      <button
        type="button"
        onClick={() => setEditando(true)}
        aria-label={`Editar ${nomeRegiao}`}
        title={`Editar ${nomeRegiao}`}
        className={botao}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => setRemovendo(true)}
        aria-label={`Remover ${nomeRegiao}`}
        title={`Remover ${nomeRegiao}`}
        className={botao}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13" />
        </svg>
      </button>

      <Modal
        aberto={editando}
        aoFechar={() => setEditando(false)}
        titulo={`${nomeRegiao}`}
        descricao="Protocolo desta região."
      >
        <CamposProtocolo
          procedimentoId={procedimentoId}
          regioes={regioes}
          inicial={protocolo}
          aoConcluir={() => setEditando(false)}
        />
      </Modal>

      <Modal
        aberto={removendo}
        aoFechar={() => setRemovendo(false)}
        titulo={`Remover ${nomeRegiao}?`}
        descricao="A região continua cadastrada; sai apenas deste procedimento."
        largura="max-w-md"
      >
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setRemovendo(false)}
            className="rounded-full px-4 py-2.5 text-[13.5px] font-medium text-[var(--tinta-2)] transition-colors hover:bg-[var(--superficie-2)]"
          >
            Cancelar
          </button>
          <form
            action={async () => {
              await removerProtocolo(protocolo.id, procedimentoId);
              setRemovendo(false);
            }}
          >
            <Botao type="submit" variante="perigo">
              Remover
            </Botao>
          </form>
        </div>
      </Modal>
    </div>
  );
}
