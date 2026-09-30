"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Resultado } from "./recursos";

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

  revalidatePath("/financeiro/despesas");
  revalidatePath("/relatorios/financeiro");
  return { ok: true };
}

/** RF-85 · fecha a competência marcando as comissões previstas como pagas. */
export async function pagarComissoes(competencia: string): Promise<Resultado> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("comissao")
    .update({ status: "paga" })
    .eq("competencia", competencia)
    .neq("status", "paga");

  if (error) return erroDeBanco(error);
  revalidatePath("/relatorios/financeiro");
  return { ok: true };
}
