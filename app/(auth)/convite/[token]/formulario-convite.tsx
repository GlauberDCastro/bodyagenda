"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { aceitarConvite } from "@/lib/actions/convites";
import type { Resultado } from "@/lib/actions/recursos";
import { Botao, Campo, Input } from "@/components/ui/primitivos";

function Criar() {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending} className="w-full">
      {pending ? "Criando seu acesso…" : "Criar meu acesso"}
    </Botao>
  );
}

export function FormularioConvite({
  token,
  inicial,
}: {
  token: string;
  inicial: {
    nome: string;
    cpf: string | null;
    especialidade: string | null;
    telefone: string | null;
    data_nascimento: string | null;
    registro_conselho: string | null;
  };
}) {
  const [estado, acao] = useActionState<Resultado, FormData>(aceitarConvite.bind(null, token), {});
  const erro = (c: string) => estado.campos?.[c];

  // Campos controlados: o React 19 limpa o formulário depois de cada envio, e
  // um erro de validação não pode apagar o que o profissional já digitou.
  const [v, setV] = useState<Record<string, string>>({
    nome: inicial.nome,
    cpf: inicial.cpf ?? "",
    data_nascimento: inicial.data_nascimento ?? "",
    telefone: inicial.telefone ?? "",
    especialidade: inicial.especialidade ?? "",
    registro_conselho: inicial.registro_conselho ?? "",
    email: "",
    senha: "",
    confirmacao: "",
  });
  const campo = (nome: string) => ({
    name: nome,
    value: v[nome],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setV((atual) => ({ ...atual, [nome]: e.target.value })),
  });

  return (
    <form action={acao} className="space-y-5">
      <fieldset className="space-y-4">
        <legend className="mb-3 text-[13px] font-medium text-[var(--tinta-2)]">Seus dados</legend>
        <Campo label="Nome completo" erro={erro("nome")}>
          <Input {...campo("nome")} required autoComplete="name" />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="CPF" erro={erro("cpf")}>
            <Input {...campo("cpf")} required inputMode="numeric" />
          </Campo>
          <Campo label="Data de nascimento" erro={erro("data_nascimento")}>
            <Input {...campo("data_nascimento")} type="date" autoComplete="bday" />
          </Campo>
          <Campo label="Telefone (WhatsApp)" erro={erro("telefone")}>
            <Input
              {...campo("telefone")}
              type="tel"
              required
              placeholder="(11) 90000-0000"
              autoComplete="tel"
            />
          </Campo>
          <Campo label="Especialidade" erro={erro("especialidade")}>
            <Input {...campo("especialidade")} />
          </Campo>
        </div>
        <Campo
          label="Registro no conselho"
          erro={erro("registro_conselho")}
          dica="Ex.: CRM-SP 123456, COREN-SP 654321, CRBM 1234. Deixe em branco se não tiver."
        >
          <Input {...campo("registro_conselho")} />
        </Campo>
      </fieldset>

      <hr className="border-[var(--traco)]" />

      <fieldset className="space-y-4">
        <legend className="mb-3 text-[13px] font-medium text-[var(--tinta-2)]">Seu acesso</legend>
        <Campo label="E-mail" erro={erro("email")} dica="É com ele que você vai entrar no sistema.">
          <Input {...campo("email")} type="email" required autoComplete="email" />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Senha" erro={erro("senha")} dica="Ao menos 8 caracteres.">
            <Input
              {...campo("senha")}
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Campo>
          <Campo label="Repita a senha" erro={erro("confirmacao")}>
            <Input
              {...campo("confirmacao")}
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Campo>
        </div>
      </fieldset>

      {estado.erro && !estado.campos && (
        <p role="alert" className="text-[13px]" style={{ color: "var(--status-critico)" }}>
          {estado.erro}
        </p>
      )}

      <Criar />
    </form>
  );
}
