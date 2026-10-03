"use client";

import { useActionState } from "react";
import { salvarClinica } from "@/lib/actions/clinica";
import type { Resultado } from "@/lib/actions/recursos";
import { Formulario, useEnvioFormulario } from "@/components/ui/formulario";
import { Aviso, Botao, Campo, Input } from "@/components/ui/primitivos";

function Salvar() {
  const { pending } = useEnvioFormulario();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Salvar"}
    </Botao>
  );
}

export function FormularioClinica({ nome, podeEditar }: { nome: string; podeEditar: boolean }) {
  const [estado, acao, enviando] = useActionState<Resultado, FormData>(salvarClinica, {});

  return (
    <Formulario acao={acao} enviando={enviando} className="space-y-4">
      <Campo
        label="Nome da clínica"
        erro={estado.campos?.nome}
        dica="Aparece no topo do sistema, na página de convite dos profissionais e nas mensagens de WhatsApp."
      >
        <Input name="nome" defaultValue={nome} required maxLength={80} disabled={!podeEditar} />
      </Campo>
      {estado.erro && !estado.campos && <Aviso tom="critico">{estado.erro}</Aviso>}
      {estado.ok && <Aviso tom="neutro">Dados da clínica salvos.</Aviso>}
      {podeEditar ? (
        <div className="flex justify-end">
          <Salvar />
        </div>
      ) : (
        <p className="text-[13px] text-[var(--tinta-3)]">
          Só administração e gestão alteram estes dados.
        </p>
      )}
    </Formulario>
  );
}
