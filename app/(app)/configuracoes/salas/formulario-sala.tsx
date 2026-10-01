"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { salvarSala, type Resultado } from "@/lib/actions/recursos";
import { Campo, Input, Select, Botao } from "@/components/ui/primitivos";
import { GatilhoModal, AcoesModal } from "@/components/ui/modal";
import type { Procedimento, Sala } from "@/lib/types/database";

function Salvar({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Salvando…" : rotulo}
    </Botao>
  );
}

/**
 * Corpo do formulário, sem modal nem gatilho.
 *
 * Separado para servir aos dois modos: criar abre pelo próprio botão, editar
 * é montado dentro do modal de ações da linha. Duplicar o formulário seria a
 * garantia de que os dois divergissem na primeira mudança de campo.
 */
export function CamposSala({
  procedimentos,
  inicial,
  aoConcluir,
}: {
  procedimentos: Procedimento[];
  inicial?: Sala;
  aoConcluir: () => void;
}) {
  const [alocacao, setAlocacao] = useState<"dedicada" | "flexivel">(
    inicial?.tipo_alocacao ?? "flexivel",
  );

  const [estado, acao] = useActionState<Resultado, FormData>(async (anterior, formData) => {
    const r = await salvarSala(inicial?.id ?? null, anterior, formData);
    if (r.ok) aoConcluir();
    return r;
  }, {});

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <form action={acao} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Número" erro={estado.campos?.numero}>
          <Input name="numero" type="number" min={1} required defaultValue={inicial?.numero} />
        </Campo>
        <Campo label="Nome" erro={estado.campos?.nome}>
          <Input name="nome" required placeholder="Sala 1" defaultValue={inicial?.nome} />
        </Campo>
      </div>

      <Campo
        label="Alocação"
        dica="Dedicada trava um procedimento fixo; flexível recebe qualquer um."
      >
        <Select
          name="tipo_alocacao"
          value={alocacao}
          onChange={(e) => setAlocacao(e.target.value as "dedicada" | "flexivel")}
        >
          <option value="flexivel">Flexível</option>
          <option value="dedicada">Dedicada</option>
        </Select>
      </Campo>

      {alocacao === "dedicada" && (
        <Campo
          label="Procedimento fixo"
          erro={estado.campos?.procedimento_fixo_id}
          dica="Escolher o procedimento na agenda passará a definir esta sala automaticamente."
        >
          <Select
            name="procedimento_fixo_id"
            required
            defaultValue={inicial?.procedimento_fixo_id ?? ""}
          >
            <option value="">Selecione…</option>
            {procedimentos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
        </Campo>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          label="Vigência — início"
          erro={estado.campos?.vigencia_inicio}
          dica="A partir de quando conta na capacidade."
        >
          <Input
            name="vigencia_inicio"
            type="date"
            defaultValue={inicial?.vigencia_inicio ?? hoje}
            required
          />
        </Campo>
        <Campo label="Vigência — fim" erro={estado.campos?.vigencia_fim}>
          <Input name="vigencia_fim" type="date" defaultValue={inicial?.vigencia_fim ?? ""} />
        </Campo>
      </div>

      {estado.erro && !estado.campos && (
        <p role="alert" className="text-[13px] text-[color:var(--status-critico)]">
          {estado.erro}
        </p>
      )}

      <AcoesModal aoCancelar={aoConcluir}>
        <Salvar rotulo={inicial ? "Salvar alterações" : "Criar sala"} />
      </AcoesModal>
    </form>
  );
}

export function FormularioSala({ procedimentos }: { procedimentos: Procedimento[] }) {
  const [aberto, setAberto] = useState(false);

  return (
    <GatilhoModal
      rotulo="Nova sala"
      titulo="Nova sala"
      descricao="Dedicada trava um procedimento fixo; flexível recebe qualquer um."
      aberto={aberto}
      aoMudar={setAberto}
    >
      <CamposSala procedimentos={procedimentos} aoConcluir={() => setAberto(false)} />
    </GatilhoModal>
  );
}

/** Usado dentro do modal de ações da linha; o pai controla abrir e fechar. */
export function EdicaoSala({
  sala,
  procedimentos,
  aoConcluir,
}: {
  sala: Sala;
  procedimentos: Procedimento[];
  aoConcluir: () => void;
}) {
  return <CamposSala procedimentos={procedimentos} inicial={sala} aoConcluir={aoConcluir} />;
}
