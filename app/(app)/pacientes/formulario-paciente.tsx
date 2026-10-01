"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { salvarPaciente } from "@/lib/actions/pacientes";
import type { Resultado } from "@/lib/actions/recursos";
import type { Paciente } from "@/lib/types/database";
import { Aviso, Campo, Input, Textarea, Botao } from "@/components/ui/primitivos";
import { GatilhoModal, AcoesModal } from "@/components/ui/modal";

function Salvar({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Salvando…" : rotulo}
    </Botao>
  );
}

type Estado = Resultado & { homonimo?: { id: string; nome: string } };

/** Cadastro (sem `inicial`) ou edição da ficha (RF-10, RF-14). */
export function FormularioPaciente({ inicial }: { inicial?: Paciente }) {
  const [aberto, setAberto] = useState(false);
  // Remontar o formulário ao reabrir zera avisos e valores digitados.
  const [chave, setChave] = useState(0);

  return (
    <GatilhoModal
      rotulo={inicial ? "Editar dados" : "Novo paciente"}
      titulo={inicial ? `Editar ${inicial.nome}` : "Novo paciente"}
      descricao={inicial ? undefined : "Cadastro básico. Só o nome é obrigatório."}
      aberto={aberto}
      aoMudar={(v) => {
        if (v) setChave((c) => c + 1);
        setAberto(v);
      }}
      variante={inicial ? "secundario" : "primario"}
    >
      <Campos key={chave} inicial={inicial} aoConcluir={() => setAberto(false)} />
    </GatilhoModal>
  );
}

function Campos({ inicial, aoConcluir }: { inicial?: Paciente; aoConcluir: () => void }) {
  const [estado, acao] = useActionState<Estado, FormData>(async (anterior, formData) => {
    const r = await salvarPaciente(inicial?.id ?? null, anterior, formData);
    if (r.ok) aoConcluir();
    return r;
  }, {});

  return (
    <form action={acao} className="space-y-4">
      <Campo label="Nome completo" erro={estado.campos?.nome}>
        <Input name="nome" required autoFocus defaultValue={inicial?.nome} />
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="CPF" erro={estado.campos?.cpf}>
          <Input
            name="cpf"
            placeholder="000.000.000-00"
            inputMode="numeric"
            defaultValue={inicial?.cpf ?? ""}
          />
        </Campo>
        <Campo label="Nascimento" erro={estado.campos?.data_nascimento}>
          <Input name="data_nascimento" type="date" defaultValue={inicial?.data_nascimento ?? ""} />
        </Campo>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Telefone" erro={estado.campos?.telefone}>
          <Input name="telefone" inputMode="tel" defaultValue={inicial?.telefone ?? ""} />
        </Campo>
        <Campo label="E-mail" erro={estado.campos?.email}>
          <Input name="email" type="email" defaultValue={inicial?.email ?? ""} />
        </Campo>
      </div>

      <Campo label="Endereço" erro={estado.campos?.endereco}>
        <Input name="endereco" defaultValue={inicial?.endereco ?? ""} />
      </Campo>

      <Campo label="Observações" erro={estado.campos?.observacoes}>
        <Textarea name="observacoes" rows={2} defaultValue={inicial?.observacoes ?? ""} />
      </Campo>

      <label className="flex items-start gap-2.5 rounded-[var(--r-md)] bg-[var(--superficie-2)] p-3 text-[13px]">
        <input
          type="checkbox"
          name="consentimento_lgpd"
          className="mt-0.5"
          defaultChecked={inicial?.consentimento_lgpd}
        />
        <span>
          Paciente consentiu com o tratamento de dados (LGPD)
          <span className="mt-0.5 block text-[12px] text-[var(--tinta-3)]">
            {inicial?.consentimento_em
              ? `Consentimento registrado em ${new Date(inicial.consentimento_em).toLocaleDateString("pt-BR")}.`
              : "A data do consentimento é registrada automaticamente."}
          </span>
        </span>
      </label>

      {/* RF-11 · mesmo nome e nascimento: confere antes de duplicar. */}
      {estado.homonimo && (
        <Aviso>
          <p>
            Já existe{" "}
            <Link href={`/pacientes/${estado.homonimo.id}`} className="font-medium underline">
              {estado.homonimo.nome}
            </Link>{" "}
            com esta data de nascimento. Confira se não é a mesma pessoa.
          </p>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" name="confirmar_homonimo" />
            É outra pessoa, cadastrar mesmo assim
          </label>
        </Aviso>
      )}

      {estado.erro && !estado.campos && !estado.homonimo && (
        <p role="alert" className="text-[13px] text-[color:var(--status-critico)]">
          {estado.erro}
        </p>
      )}

      <AcoesModal aoCancelar={aoConcluir}>
        <Salvar rotulo={inicial ? "Salvar alterações" : "Salvar paciente"} />
      </AcoesModal>
    </form>
  );
}
