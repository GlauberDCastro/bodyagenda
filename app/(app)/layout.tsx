import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { sair } from "@/lib/actions/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();

  // getUser() revalida no servidor do Supabase. getSession() só lê o cookie,
  // que o cliente poderia ter forjado — não serve como guarda.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // O perfil vem da tabela `usuario`, protegida por RLS. Se a linha não
  // existir, o usuário autenticou mas não foi cadastrado no sistema.
  const { data: perfil } = await supabase
    .from("usuario")
    .select("nome, perfil")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold tracking-tight">Body Prime</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500 dark:text-slate-400">
              {perfil?.nome ?? user.email}
            </span>
            <form action={sair}>
              <button
                type="submit"
                className="rounded-md px-2 py-1 text-slate-500 transition
                           hover:bg-slate-100 hover:text-slate-900
                           dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
