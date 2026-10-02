"use client";

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useRef,
  type ComponentProps,
} from "react";

const ContextoEnvio = createContext({ pending: false });

/** Substitui o `useFormStatus` dentro de um `<Formulario>`. */
export function useEnvioFormulario() {
  return useContext(ContextoEnvio);
}

/**
 * Formulário que NÃO se limpa quando o servidor devolve erro.
 *
 * Com `<form action={...}>`, o React 19 reseta os campos não controlados
 * depois de todo envio — inclusive quando a ação recusou por validação, e
 * quem digitou perde tudo. Aqui o envio passa pelo `onSubmit`, e o reset só
 * acontece quando a ação devolve `ok` (o comportamento que se espera depois
 * de salvar: o formulário reaberto vem em branco).
 *
 * `enviando` vem do terceiro valor do `useActionState`; os botões leem com
 * `useEnvioFormulario()`, como antes liam com `useFormStatus()`.
 */
export function Formulario({
  acao,
  enviando,
  estado,
  children,
  ...props
}: Omit<ComponentProps<"form">, "action" | "onSubmit"> & {
  acao: (dados: FormData) => void;
  enviando: boolean;
  estado?: { ok?: boolean };
}) {
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado?.ok) ref.current?.reset();
  }, [estado]);

  return (
    <ContextoEnvio.Provider value={{ pending: enviando }}>
      <form
        {...props}
        ref={ref}
        onSubmit={(e) => {
          e.preventDefault();
          // O botão clicado entra nos dados, como num envio nativo (name/value do submit).
          const dados = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          startTransition(() => acao(dados));
        }}
      >
        {children}
      </form>
    </ContextoEnvio.Provider>
  );
}
