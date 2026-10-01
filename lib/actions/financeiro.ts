"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Resultado } from "./recursos";
import { recebimentoSchema } from "@/lib/schemas/pacientes";

const despesaSchema = z.object({
  descricao: z.string().min(1, "Informe a descrição"),
  categoria: z.string().nullish(),
  valor: z.coerce.number().positive("Valor deve ser maior que zero"),
  competencia: z.string().regex(/^\d{4}-\d{2}$/, "Competência no formato AAAA-MM"),
  recorrente: z.preprocess((v) => v === "on" || v === true, z.boolean()),
});

function erroDeBanco(erro: { code?: string; message: string }): Resultado {
  if (erro.code === "42501" || erro.message.includes("row-level security")) {
    return { erro: "Apenas o administrador lança despesas." };
  }
  return { erro: erro.message };
}

export async function lancarDespesa(_anterior: Resultado, formData: FormData): Promise<Resultado> {
  const parsed = despesaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const campos: Record<string, string> = {};
    for (const i of parsed.error.issues) campos[String(i.path[0] ?? "_")] ??= i.message;
    return { erro: parsed.error.issues[0].message, campos };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("despesa_fixa").insert(parsed.data);
  if (error) return erroDeBanco(error);

  revalidatePath("/configuracoes/despesas");
  revalidatePath("/relatorios/financeiro");
  return { ok: true };
}

/**
 * RF-85 · fechar a competência: as comissões previstas viram apuradas, o
 * valor que vai ser pago. Pagar vem depois, por profissional.
 */
export async function fecharComissoes(competencia: string): Promise<Resultado> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("comissao")
    .update({ status: "apurada" })
    .eq("competencia", competencia)
    .eq("status", "prevista");
  if (error) return erroComissao(error);
  revalidatePath("/comissoes");
  return { ok: true };
}

/** RF-85 · registra o pagamento das comissões de um profissional na competência. */
export async function pagarComissoes(
  competencia: string,
  profissionalId: string,
): Promise<Resultado> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("comissao")
    .update({ status: "paga" })
    .eq("competencia", competencia)
    .eq("profissional_id", profissionalId)
    .neq("status", "paga");
  if (error) return erroComissao(error);
  revalidatePath("/comissoes");
  revalidatePath("/relatorios/financeiro");
  return { ok: true };
}

function erroComissao(erro: { code?: string; message: string }): Resultado {
  if (erro.code === "42501" || erro.message.includes("row-level security")) {
    return { erro: "Só o financeiro e o administrador fecham e pagam comissões." };
  }
  return { erro: erro.message };
}

/**
 * RF-86 · lança na competência as despesas marcadas como recorrentes no mês
 * anterior que ainda não foram lançadas nela (mesma descrição).
 */
export async function lancarRecorrentes(competencia: string): Promise<Resultado> {
  const [ano, mes] = competencia.split("-").map(Number);
  const anterior = new Date(Date.UTC(ano, mes - 2, 1)).toISOString().slice(0, 7);

  const supabase = await createServerSupabase();
  const [{ data: recorrentes }, { data: atuais }] = await Promise.all([
    supabase
      .from("despesa_fixa")
      .select("descricao, categoria, valor, recorrente")
      .eq("competencia", anterior)
      .eq("recorrente", true),
    supabase.from("despesa_fixa").select("descricao").eq("competencia", competencia),
  ]);
  const ja = new Set((atuais ?? []).map((d) => d.descricao));
  const novas = (recorrentes ?? []).filter((d) => !ja.has(d.descricao));
  if (novas.length === 0) return { ok: true };

  const { error } = await supabase
    .from("despesa_fixa")
    .insert(novas.map((d) => ({ ...d, competencia })));
  if (error) return erroDeBanco(error);
  revalidatePath("/configuracoes/despesas");
  revalidatePath("/relatorios/financeiro");
  return { ok: true };
}

/**
 * RF-81 · registra o recebimento de uma cobrança, inteiro ou parcial.
 * Parcial divide a cobrança: o restante continua em aberto (migração 0028).
 */
export async function registrarRecebimento(
  _anterior: Resultado,
  formData: FormData,
): Promise<Resultado> {
  const parsed = recebimentoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const campos: Record<string, string> = {};
    for (const i of parsed.error.issues) campos[String(i.path[0] ?? "_")] ??= i.message;
    return { erro: parsed.error.issues[0].message, campos };
  }
  const d = parsed.data;

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("registrar_recebimento", {
    p_lancamento: d.lancamento_id,
    p_valor: d.valor,
    p_data: d.data,
    p_forma: d.forma,
  });

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { erro: "Seu perfil não registra recebimentos." };
    }
    return { erro: error.message };
  }

  revalidatePath("/recebimentos");
  revalidatePath("/pacientes", "layout");
  revalidatePath("/relatorios/financeiro");
  return { ok: true };
}
