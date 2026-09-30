"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { salvarPaciente } from "@/lib/actions/pacientes";
import type { Resultado } from "@/lib/actions/recursos";
import { Campo, Input, Textarea, Botao } from "@/components/ui/primitivos";

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

  const [estado, acao] = useActionState<Resultado, FormData>(async (anterior, formData) => {
    const r = await salvarPaciente(null, anterior, formData);
    if (r.ok) setAberto(false);
    return r;
  }, {});

  if (!aberto) {
    return (
      <Botao type="button" onClick={() => setAberto(true)}>
        Novo paciente
      </Botao>
    );
  }

  return (
    <form
      action={acao}
      className="w-full max-w-md space-y-4 rounded-lg border border-[var(--traco)] p-4 "
    >
      <Campo label="Nome completo" erro={estado.campos?.nome}>
        <Input name="nome" required autoFocus />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo label="CPF" erro={estado.campos?.cpf}>
          <Input name="cpf" placeholder="000.000.000-00" inputMode="numeric" />
        </Campo>
        <Campo label="Nascimento" erro={estado.campos?.data_nascimento}>
          <Input name="data_nascimento" type="date" />
        </Campo>
      </div>

      <div className="grid grid-cols-2 gap-3">
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

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consentimento_lgpd" className="mt-0.5" />
        <span>
          Paciente consentiu com o tratamento de dados (LGPD)
          <span className="mt-0.5 block text-xs text-[var(--tinta-3)]">
            A data do consentimento é registrada automaticamente.
          </span>
        </span>
      </label>

      {estado.erro && !estado.campos && (
        <p role="alert" className="text-sm text-[color:var(--status-critico)]">
          {estado.erro}
        </p>
      )}

      <div className="flex gap-2">
        <Salvar />
        <Botao type="button" variante="secundario" onClick={() => setAberto(false)}>
          Cancelar
        </Botao>
      </div>
    </form>
  );
}
