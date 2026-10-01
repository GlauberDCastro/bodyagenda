import { createServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/supabase";

export type Cobranca = Database["public"]["Functions"]["cobrancas"]["Returns"][number];

const TZ = "America/Sao_Paulo";
export const hojeNaClinica = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

/** Dias de atraso de uma cobrança em aberto (0 se ainda não venceu). */
export function diasDeAtraso(vencimento: string, hoje = hojeNaClinica()): number {
  const ms =
    new Date(`${hoje}T12:00:00Z`).getTime() - new Date(`${vencimento}T12:00:00Z`).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/**
 * Cobranças com o paciente de cada uma. Marca os atrasados antes de ler
 * (RF-82): o que venceu ontem aparece atrasado hoje sem depender de rotina.
 */
export async function cobrancas(pacienteId?: string): Promise<Cobranca[]> {
  const supabase = await createServerSupabase();
  await supabase.rpc("marcar_atrasados");
  const { data } = await supabase.rpc("cobrancas", pacienteId ? { p_paciente: pacienteId } : {});
  return (data ?? []) as Cobranca[];
}

/** RF-94 · receita prevista × realizada no período, por forma de pagamento. */
export async function receitaPorForma(de: string, ate: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("receita_periodo", { p_de: de, p_ate: ate });
  return (data ?? []).map((l) => ({
    forma: l.forma,
    prevista: Number(l.prevista),
    realizada: Number(l.realizada),
  }));
}

export const emAberto = (c: Cobranca) => c.status === "pendente" || c.status === "atrasado";
