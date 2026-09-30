"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { entrar, type EstadoFormulario } from "@/lib/actions/auth";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white
                 transition hover:bg-slate-800 disabled:opacity-50
                 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
    >
      {pending ? "Entrando…" : "Entrar"}
    </button>
  );
}

export function LoginForm({ redirecionar }: { redirecionar: string }) {
  const [estado, acao] = useActionState<EstadoFormulario, FormData>(entrar, {});

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="redirecionar" value={redirecionar} />

      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm
                     outline-none focus:border-slate-900
                     dark:border-slate-700 dark:bg-slate-900 dark:focus:border-slate-400"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="senha" className="text-sm font-medium">
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm
                     outline-none focus:border-slate-900
                     dark:border-slate-700 dark:bg-slate-900 dark:focus:border-slate-400"
        />
      </div>

      {estado.erro && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {estado.erro}
        </p>
      )}

      <Botao />
    </form>
  );
}
