"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Resultado } from "./recursos";

const vazioParaNulo = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), schema.nullable());

const regiaoSchema = z.object({
  nome: z.string().min(1, "Informe o nome da região"),
  grupo: vazioParaNulo(z.string()),
  ordem: z.coerce.number().int().default(0),
});

const protocoloSchema = z.object({
  procedimento_id: z.uuid(),
  regiao_id: z.uuid("Selecione a região"),
  duracao_min: vazioParaNulo(z.coerce.number().int().positive()),
  sessoes_padrao: vazioParaNulo(z.coerce.number().int().positive()),
  valor_sessao: vazioParaNulo(z.coerce.number().nonnegative()),
  intervalo_min_dias: vazioParaNulo(z.coerce.number().int().min(0)),
  unidade: z.enum(["sessao", "ui", "ml", "seringa", "flash", "aplicacao"]),
  quantidade_padrao: z.coerce.number().positive("Quantidade deve ser maior que zero"),
  observacoes: vazioParaNulo(z.string()),
});

function validacao(issues: { path: PropertyKey[]; message: string }[]): Resultado {
  const campos: Record<string, string> = {};
  for (const i of issues) campos[String(i.path[0] ?? "_")] ??= i.message;
  return { erro: issues[0]?.message ?? "Dados inválidos", campos };
}

function erroDeBanco(erro: { code?: string; message: string }): Resultado {
  if (erro.code === "42501" || erro.message.includes("row-level security")) {
    return { erro: "Apenas o administrador altera regiões e protocolos." };
  }
  if (erro.code === "23505") {
    return { erro: "Esta região já está cadastrada para o procedimento." };
  }
  return { erro: erro.message };
}

export async function salvarRegiao(
  id: string | null,
  _anterior: Resultado,
  formData: FormData,
): Promise<Resultado> {
  const parsed = regiaoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validacao(parsed.error.issues);

  const supabase = await createServerSupabase();
  const { error } = id
    ? await supabase.from("regiao").update(parsed.data).eq("id", id)
    : await supabase.from("regiao").insert(parsed.data);

  if (error) return erroDeBanco(error);
  revalidatePath("/configuracoes", "layout");
  return { ok: true };
}

/**
 * Protocolo do par procedimento + região.
 *
 * Campos em branco herdam do procedimento (ver `protocolo_efetivo`). Isso é
 * deliberado: preencher a duração em todas as regiões só para repetir o mesmo
 * número garante que elas divirjam quando o procedimento mudar.
 */
export async function salvarProtocolo(
  id: string | null,
  _anterior: Resultado,
  formData: FormData,
): Promise<Resultado> {
  const parsed = protocoloSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validacao(parsed.error.issues);

  const supabase = await createServerSupabase();
  const { error } = id
    ? await supabase.from("procedimento_regiao").update(parsed.data).eq("id", id)
    : await supabase.from("procedimento_regiao").insert(parsed.data);

  if (error) return erroDeBanco(error);
  revalidatePath(`/configuracoes/procedimentos/${parsed.data.procedimento_id}`);
  return { ok: true };
}

export async function removerProtocolo(
  id: string,
  procedimentoId: string,
): Promise<Resultado> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("procedimento_regiao").delete().eq("id", id);
  if (error) return erroDeBanco(error);
  revalidatePath(`/configuracoes/procedimentos/${procedimentoId}`);
  return { ok: true };
}
