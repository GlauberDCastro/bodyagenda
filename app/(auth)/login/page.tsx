import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar · Body Prime" };

// Next 16: searchParams é uma Promise. O acesso síncrono foi removido.
export default async function LoginPage(props: {
  searchParams: Promise<{ redirecionar?: string }>;
}) {
  const { redirecionar } = await props.searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Body Prime</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Gestão de ocupação e agenda
          </p>
        </header>
        <LoginForm redirecionar={redirecionar ?? "/"} />
      </div>
    </main>
  );
}
