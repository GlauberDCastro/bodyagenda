import { Logotipo, SUBTITULO_PRODUTO } from "@/components/ui/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar" };

export default async function LoginPage(props: {
  searchParams: Promise<{ redirecionar?: string }>;
}) {
  const { redirecionar } = await props.searchParams;

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[360px] space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logotipo />
          <div>
            <h1 className="titulo-lg">{SUBTITULO_PRODUTO}</h1>
            <p className="mt-1 text-[13.5px] text-[var(--tinta-2)]">
              Ocupação, agenda e resultado da clínica
            </p>
          </div>
        </div>

        <div className="cartao p-6">
          <LoginForm redirecionar={redirecionar ?? "/"} />
        </div>

        <p className="text-center text-[12px] text-[var(--tinta-3)]">
          Acesso restrito à equipe da clínica.
        </p>
      </div>
    </main>
  );
}
