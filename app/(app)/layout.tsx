import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { Navegacao, Migalha } from "@/components/shell/navegacao";
import { BuscaPaciente } from "@/components/shell/busca-paciente";
import { nomeDaClinica } from "@/lib/consultas/clinica";
import { MenuUsuario } from "@/components/shell/menu-usuario";
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

  const nome = (perfil?.nome ?? user.email?.split("@")[0] ?? "Usuário").replace(/^./, (c) =>
    c.toUpperCase(),
  );
  return (
    <div className="flex min-h-dvh gap-5 p-3 lg:p-4">
      <Navegacao
        recolhidoInicial={(await cookies()).get("hd_menu_recolhido")?.value === "1"}
        perfil={perfil?.perfil}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* Topo solto sobre o fundo: sem cartão, cada controle é a sua pílula. */}
        <header className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <Migalha />

          <div className="flex flex-1 items-center justify-end gap-3">
            <BuscaPaciente />

            <div className="hidden h-[52px] items-center gap-2.5 rounded-full bg-[var(--superficie)] px-5 shadow-[var(--sombra-2)] sm:flex">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ background: "var(--status-bom)" }}
              />
              <span className="text-[15px] text-[var(--tinta-1)]">{await nomeDaClinica()}</span>
            </div>

            <MenuUsuario nome={nome} perfil={ROTULO_PERFIL[perfil?.perfil ?? ""] ?? "Sem perfil"} />
          </div>
        </header>

        <main className="min-w-0 flex-1 pb-3">{children}</main>
      </div>
    </div>
  );
}
