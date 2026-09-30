"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { salvarPaciente } from "@/lib/actions/pacientes";
import type { Resultado } from "@/lib/actions/recursos";
import { Campo, Input, Textarea, Botao } from "@/components/ui/primitivos";
import { GatilhoModal, AcoesModal } from "@/components/ui/modal";

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Salvar paciente"}
    </Botao>
  );
}

export function FormularioPaciente() {
  const [aberto, setAberto] = useState(false);

  const [estado, acao] = useActionState<Resultado, FormData>(
    async (anterior, formData) => {
      const r = await salvarPaciente(null, anterior, formData);
      if (r.ok) setAberto(false);
      return r;
    },
    {},
  );

  return (
    <GatilhoModal
      rotulo="Novo paciente"
      titulo="Novo paciente"
      descricao="Cadastro básico. Só o nome é obrigatório."
      aberto={aberto}
      aoMudar={setAberto}
    >
      <form action={acao} className="space-y-4">
        <Campo label="Nome completo" erro={estado.campos?.nome}>
          <Input name="nome" required autoFocus />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="CPF" erro={estado.campos?.cpf}>
            <Input name="cpf" placeholder="000.000.000-00" inputMode="numeric" />
          </Campo>
          <Campo label="Nascimento" erro={estado.campos?.data_nascimento}>
            <Input name="data_nascimento" type="date" />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Telefone" erro={estado.campos?.telefone}>
            <Input name="telefone" inputMode="tel" />
          </Campo>
          <Campo label="E-mail" erro={estado.campos?.email}>
            <Input name="email" type="email" />
          </Campo>
        </div>

        <Campo label="Endereço" erro={estado.campos?.endereco}>
          <Input name="endereco" />
        </Campo>

        <Campo label="Observações" erro={estado.campos?.observacoes}>
          <Textarea name="observacoes" rows={2} />
        </Campo>

        <label className="flex items-start gap-2.5 rounded-[var(--r-md)] bg-[var(--superficie-2)] p-3 text-[13px]">
          <input type="checkbox" name="consentimento_lgpd" className="mt-0.5" />
          <span>
            Paciente consentiu com o tratamento de dados (LGPD)
            <span className="mt-0.5 block text-[12px] text-[var(--tinta-3)]">
              A data do consentimento é registrada automaticamente.
            </span>
          </span>
        </label>

        {estado.erro && !estado.campos && (
          <p role="alert" className="text-[13px] text-[color:var(--status-critico)]">
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
