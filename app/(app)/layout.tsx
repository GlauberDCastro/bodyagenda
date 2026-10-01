import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { sair } from "@/lib/actions/auth";
import { Navegacao, Migalha } from "@/components/shell/navegacao";
import { BuscaPaciente } from "@/components/shell/busca-paciente";
import { SUBTITULO_PRODUTO } from "@/components/ui/logo";
import { ROTULO_PERFIL } from "@/lib/perfis";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();

  // getUser() revalida no servidor do Supabase. getSession() só lê o cookie,
  // que o cliente poderia ter forjado — não serve como guarda.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuario")
    .select("nome, perfil")
    .eq("id", user.id)
    .maybeSingle();

  const nome = (perfil?.nome ?? user.email?.split("@")[0] ?? "Usuário").replace(
    /^./,
    (c) => c.toUpperCase(),
  );
  const inicial = nome.charAt(0).toUpperCase();

  return (
    <div className="flex min-h-dvh gap-3 p-3">
      {/* Coluna de navegação: cartões flutuantes, não uma barra colada na borda. */}
      <aside className="hidden w-[228px] shrink-0 lg:block">
        <div className="sticky top-3 h-[calc(100dvh-1.5rem)]">
          <Navegacao />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <header className="cartao flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <Migalha />

          <div className="flex flex-1 items-center justify-end gap-2.5">
            <BuscaPaciente />

            <div className="hidden items-center gap-2 rounded-full border border-[var(--traco)] px-3 py-1.5 sm:flex">
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ background: "var(--status-bom)" }}
              />
              <span className="text-[13px] text-[var(--tinta-2)]">{SUBTITULO_PRODUTO}</span>
            </div>

            <div className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition-colors hover:bg-[var(--superficie-2)]">
              <span
                className="grid size-7 place-items-center rounded-full text-[12px] font-semibold text-white"
                style={{
                  background: "linear-gradient(135deg, var(--marca), oklch(0.6 0.19 300))",
                }}
                aria-hidden
              >
                {inicial}
              </span>
              <span className="hidden leading-tight sm:block">
                <span className="block text-[13px] font-medium text-[var(--tinta-1)]">{nome}</span>
                <span className="block text-[11px] text-[var(--tinta-3)]">
                  {ROTULO_PERFIL[perfil?.perfil ?? ""] ?? "Sem perfil"}
                </span>
              </span>
            </div>

            <form action={sair}>
              <button
                type="submit"
                className="rounded-full px-3 py-1.5 text-[13px] text-[var(--tinta-3)] transition-colors hover:bg-[var(--superficie-2)] hover:text-[var(--tinta-1)]"
              >
                Sair
              </button>
            </form>
          </div>
        </header>

        <main className="min-w-0 flex-1 pb-3">{children}</main>
      </div>
    </div>
  );
}
