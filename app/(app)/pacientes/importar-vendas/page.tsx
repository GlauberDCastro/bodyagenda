import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { perfilDoUsuario } from "@/lib/consultas/recursos";
import { regrasDoCatalogo } from "@/lib/consultas/agenda";
import { Aviso } from "@/components/ui/primitivos";
import { ImportadorVendas } from "@/components/pacientes/importador-vendas";

export const metadata = { title: "Importar vendas" };

export default async function ImportarVendasPage() {
  const perfil = await perfilDoUsuario();
  const pode = perfil === "admin" || perfil === "gestao";
  const supabase = await createServerSupabase();
  const [{ data: procs }, regras, { data: equipe }] = pode
    ? await Promise.all([
        supabase
          .from("procedimento")
          .select("id, nome, valor_sessao")
          .eq("ativo", true)
          .order("nome"),
        regrasDoCatalogo(),
        supabase.from("usuario").select("id, nome, perfil").eq("ativo", true).order("nome"),
      ])
    : [{ data: [] }, { regioes: [] }, { data: [] }];

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/pacientes"
          className="text-[14px] text-[var(--tinta-3)] underline-offset-4 hover:text-[var(--tinta-1)] hover:underline"
        >
          ← Pacientes
        </Link>
        <h1 className="titulo-xl mt-1">Importar vendas</h1>
        <p className="mt-1 text-[15px] text-[var(--tinta-2)]">
          Traga os planos vendidos no sistema anterior: cada serviço vira um pacote pago, no nome de
          quem vendeu.
        </p>
      </header>
      {pode ? (
        <ImportadorVendas
          procedimentos={(procs ?? []).map((p) => ({ ...p, valor_sessao: Number(p.valor_sessao) }))}
          regioes={regras.regioes}
          usuarios={equipe ?? []}
        />
      ) : (
        <Aviso>Só administração e gestão importam vendas.</Aviso>
      )}
    </div>
  );
}
