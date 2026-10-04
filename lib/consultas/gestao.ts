import { createServerSupabase } from "@/lib/supabase/server";
import type { Canal, Venda } from "@/lib/domain/vendas";
import type { Periodo } from "./painel";

/** Vendas do período: pacotes e sessões avulsas cobradas, com canal e vendedor. */
export async function vendasDoPeriodo(periodo: Periodo): Promise<Venda[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("vendas_periodo", { p_de: periodo.de, p_ate: periodo.ate });
  return (data ?? []).map((v) => ({
    ...v,
    tipo: v.tipo as Venda["tipo"],
    canal: v.canal as Canal,
    valor: Number(v.valor),
  }));
}

export interface Funil {
  avaliados: number;
  compraram: number;
  diasAteCompra: number | null;
  conversao: number | null;
}

/** Avaliados no período e quantos compraram depois da avaliação. */
export async function funilDaAvaliacao(periodo: Periodo): Promise<Funil> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("funil_avaliacao", { p_de: periodo.de, p_ate: periodo.ate });
  const f = data?.[0];
  const avaliados = f?.avaliados ?? 0;
  const compraram = f?.compraram ?? 0;
  return {
    avaliados,
    compraram,
    diasAteCompra: f?.dias_ate_compra == null ? null : Number(f.dias_ate_compra),
    conversao: avaliados > 0 ? compraram / avaliados : null,
  };
}

/** Pacientes cadastrados no período: a entrada do funil. */
export async function novosPacientes(periodo: Periodo): Promise<number> {
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("paciente")
    .select("id", { count: "exact", head: true })
    .gte("created_at", periodo.inicio.toISOString())
    .lte("created_at", periodo.fim.toISOString());
  return count ?? 0;
}
