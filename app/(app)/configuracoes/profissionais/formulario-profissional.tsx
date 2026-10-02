"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { salvarProfissional, type Resultado } from "@/lib/actions/recursos";
import { Campo, Input, Select, Botao } from "@/components/ui/primitivos";
import { GatilhoModal, AcoesModal } from "@/components/ui/modal";
import type { Procedimento, Profissional, TipoComissao } from "@/lib/types/database";

export type ProfissionalCompleto = Profissional & {
  custo_hora?: number;
  comissao_tipo?: TipoComissao;
  comissao_valor?: number;
  procedimentos?: string[];
};

function Salvar({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Salvando…" : rotulo}
    </Botao>
  );
}

export function CamposProfissional({
  procedimentos,
  inicial,
  aoConcluir,
}: {
  procedimentos: Procedimento[];
  inicial?: ProfissionalCompleto;
  aoConcluir: () => void;
}) {
  const [comissao, setComissao] = useState<"percentual" | "valor_fixo" | "nenhuma">(
    (inicial?.comissao_tipo as "percentual" | "valor_fixo" | "nenhuma") ?? "nenhuma",
  );

  const [estado, acao] = useActionState<Resultado, FormData>(async (anterior, formData) => {
    const r = await salvarProfissional(inicial?.id ?? null, anterior, formData);
    if (r.ok) aoConcluir();
    return r;
  }, {});


  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <form action={acao} className="space-y-4">
      <Campo label="Nome" erro={estado.campos?.nome}>
        <Input name="nome" required  defaultValue={inicial?.nome} />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo label="CPF" erro={estado.campos?.cpf}>
          <Input name="cpf"  defaultValue={inicial?.cpf ?? ""} />
        </Campo>
        <Campo label="Especialidade" erro={estado.campos?.especialidade}>
          <Input name="especialidade"  defaultValue={inicial?.especialidade ?? ""} />
        </Campo>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Campo label="Telefone" erro={estado.campos?.telefone}>
          <Input name="telefone" type="tel" defaultValue={inicial?.telefone ?? ""} />
        </Campo>
        <Campo label="Nascimento" erro={estado.campos?.data_nascimento}>
          <Input name="data_nascimento" type="date" defaultValue={inicial?.data_nascimento ?? ""} />
        </Campo>
        <Campo label="Registro no conselho" erro={estado.campos?.registro_conselho}>
          <Input name="registro_conselho" defaultValue={inicial?.registro_conselho ?? ""} />
        </Campo>
      </div>

      <Campo label="Cor na agenda" erro={estado.campos?.cor_agenda}>
        <Input name="cor_agenda" type="color" defaultValue={inicial?.cor_agenda ?? "#64748b"} className="h-10" />
      </Campo>

      <Campo
        label="Procedimentos habilitados"
        dica="A agenda só oferece profissionais habilitados para o procedimento escolhido."
      >
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-[var(--traco)] p-2 ">
          {procedimentos.length === 0 && (
            <p className="text-xs text-[var(--tinta-3)]">Nenhum procedimento cadastrado.</p>
          )}
          {procedimentos.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="procedimentos"
                value={p.id}
                defaultChecked={inicial?.procedimentos?.includes(p.id)}
              />
              {p.nome}
            </label>
          ))}
        </div>
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo label="Tipo de comissão">
          <Select
            name="comissao_tipo"
            value={comissao}
            onChange={(e) => setComissao(e.target.value as "percentual" | "valor_fixo" | "nenhuma")}
          >
            <option value="nenhuma">Sem comissão</option>
            <option value="percentual">Percentual</option>
            <option value="valor_fixo">Valor fixo</option>
          </Select>
        </Campo>
        <Campo
          label={comissao === "percentual" ? "Percentual (%)" : "Valor (R$)"}
          erro={estado.campos?.comissao_valor}
        >
          <Input
            name="comissao_valor"
            type="number"
            step="0.01"
            min="0"
            defaultValue={inicial?.comissao_valor ?? 0}
            disabled={comissao === "nenhuma"}
          />
        </Campo>
      </div>

      <Campo
        label="Custo por hora"
        erro={estado.campos?.custo_hora}
        dica="Opcional. Entra no custo direto da sessão, separado da comissão."
      >
        <Input name="custo_hora" type="number" step="0.01" min="0" defaultValue={inicial?.custo_hora ?? 0} />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo label="Admissão" erro={estado.campos?.vigencia_inicio}>
          <Input name="vigencia_inicio" type="date" defaultValue={inicial?.vigencia_inicio ?? hoje} required />
        </Campo>
        <Campo label="Desligamento" erro={estado.campos?.vigencia_fim}>
          <Input name="vigencia_fim" type="date" defaultValue={inicial?.vigencia_fim ?? ""} />
        </Campo>
      </div>

      {estado.erro && !estado.campos && (
        <p role="alert" className="text-sm text-[color:var(--status-critico)]">
          {estado.erro}
        </p>
      )}

      <AcoesModal aoCancelar={aoConcluir}>
        <Salvar rotulo={inicial ? "Salvar alterações" : "Criar profissional"} />
      </AcoesModal>
    </form>
  );
}

export function FormularioProfissional({
  procedimentos,
}: {
  procedimentos: Procedimento[];
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <GatilhoModal
      rotulo="Novo profissional"
      titulo="Novo profissional"
      descricao="Pode existir sem login: o vínculo com usuário é opcional."
      aberto={aberto}
      aoMudar={setAberto}
    >
      <CamposProfissional procedimentos={procedimentos} aoConcluir={() => setAberto(false)} />
    </GatilhoModal>
  );
}
