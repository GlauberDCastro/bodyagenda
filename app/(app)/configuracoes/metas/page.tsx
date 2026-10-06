import { createServerSupabase } from "@/lib/supabase/server";
import { metasDoMes } from "@/lib/consultas/metas";
import { regrasDoCatalogo } from "@/lib/consultas/agenda";
import { perfilDoUsuario } from "@/lib/consultas/recursos";
import { hojeNaClinica } from "@/lib/consultas/painel";
import { Cartao, Secao } from "@/components/ui/primitivos";
import { CopiarMetas, FormularioOcupacao, ListaMetas } from "./editor-metas";

export const metadata = { title: "Metas" };

function mesVizinho(mes: string, delta: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export default async function MetasPage(props: { searchParams: Promise<{ mes?: string }> }) {
  const { mes: pedido } = await props.searchParams;
  const mes = pedido && /^\d{4}-\d{2}$/.test(pedido) ? pedido : hojeNaClinica().slice(0, 7);
  const anterior = mesVizinho(mes, -1);
  const supabase = await createServerSupabase();

  const [definidas, doAnterior, perfil, regras, { data: procs }] = await Promise.all([
    metasDoMes(mes),
    metasDoMes(anterior),
    perfilDoUsuario(),
    regrasDoCatalogo(),
    supabase.from("procedimento").select("id, nome").eq("ativo", true).order("nome"),
  ]);
  const podeEditar = perfil === "admin" || perfil === "gestao";
  const procedimentos = procs ?? [];
  const nomeProc = new Map(procedimentos.map((p) => [p.id, p.nome]));
  const nomeRegiao = new Map(regras.regioes.map((r) => [r.regiao_id, r.nome]));
  const vazio = definidas.ocupacao === null && definidas.metas.length === 0;
  const temAnterior = doAnterior.ocupacao !== null || doAnterior.metas.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-[var(--tinta-2)]">
          Metas valem por mês. A venda conta no dia em que foi feita; o andamento aparece no Painel
          e na Central 360.
        </p>
        <form method="get" className="flex items-center gap-2">
          <label htmlFor="mes-metas" className="text-[13px] font-medium">
            Mês
          </label>
          <input
            id="mes-metas"
            type="month"
            name="mes"
            defaultValue={mes}
            className="rounded-md border border-[var(--traco)] px-2 py-1 text-sm"
          />
          <button
            type="submit"
            className="rounded-full border border-[var(--traco-forte)] px-3 py-1 text-[13px] font-medium hover:bg-[var(--superficie-2)]"
          >
            Ver
          </button>
        </form>
      </div>

      {vazio && temAnterior && podeEditar && <CopiarMetas de={anterior} para={mes} />}

      <Secao
        titulo="Ocupação das salas"
        descricao="Horas atendidas sobre as horas de sala disponíveis no mês."
      >
        <Cartao className="max-w-2xl">
          <FormularioOcupacao mes={mes} ocupacao={definidas.ocupacao} podeEditar={podeEditar} />
        </Cartao>
      </Secao>

      <ListaMetas
        mes={mes}
        podeEditar={podeEditar}
        procedimentos={procedimentos}
        regioes={regras.regioes}
        metas={definidas.metas.map((m) => ({
          ...m,
          procedimento: nomeProc.get(m.procedimento_id) ?? "Procedimento inativo",
          nomesRegioes: m.regioes.map((r) => nomeRegiao.get(r) ?? "região").join(", "),
        }))}
      />
    </div>
  );
}
