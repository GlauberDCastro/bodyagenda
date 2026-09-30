"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { entrar, type EstadoFormulario } from "@/lib/actions/auth";
import { Campo, Input, Botao } from "@/components/ui/primitivos";

function Entrar() {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending} className="w-full">
      {pending ? "Entrando…" : "Entrar"}
    </Botao>
  );
}

export function LoginForm({ redirecionar }: { redirecionar: string }) {
  const [estado, acao] = useActionState<EstadoFormulario, FormData>(entrar, {});

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="redirecionar" value={redirecionar} />

      <Campo label="E-mail">
        <Input id="email" name="email" type="email" required autoComplete="email" autoFocus />
      </Campo>

      <Campo label="Senha">
        <Input id="senha" name="senha" type="password" required autoComplete="current-password" />
      </Campo>

      {estado.erro && (
        <p role="alert" className="text-[13px]" style={{ color: "var(--status-critico)" }}>
          {estado.erro}
        </p>
      )}

      <Entrar />
    </form>
  );
}
