"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Resultado } from "./recursos";

const valor = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : Number(v.replace(",", "."))) : v),
  z.number({ error: "Informe o valor" }).nonnegative("Valor não pode ser negativo"),
);

const marcaSchema = z.object({
  procedimento_id: z.uuid(),
  nome: z.string().trim().min(1, "Informe a marca").max(80),
  valor_sessao: valor,
  valor_parcelado: z.preprocess((v) => (v === "" ? undefined : v), valor.optional()),
});

function erro(e: { code?: string; message: string }): Resultado {
  if (e.code === "42501" || e.message.includes("row-level security"))
    return { erro: "Só administração e gestão alteram o catálogo." };
  if (e.code === "23505")
    return { erro: "Esta marca já está cadastrada.", campos: { nome: "Já existe" } };
  if (e.code === "23503") return { erro: "Marca já usada em vendas: desative em vez de excluir." };
  return { erro: e.message };
}

function invalido(issues: { path: PropertyKey[]; message: string }[]): Resultado {
  const campos: Record<string, string> = {};
  for (const i of issues) campos[String(i.path[0] ?? "_")] ??= i.message;
  return { erro: issues[0]?.message ?? "Dados inválidos", campos };
}

export async function salvarMarca(
  id: string | null,
  _a: Resultado,
  fd: FormData,
): Promise<Resultado> {
  const parsed = marcaSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return invalido(parsed.error.issues);
  const d = { ...parsed.data, valor_parcelado: parsed.data.valor_parcelado ?? null };
  const supabase = await createServerSupabase();
  const { error } = id
    ? await supabase.from("procedimento_marca").update(d).eq("id", id)
    : await supabase.from("procedimento_marca").insert(d);
  if (error) return erro(error);
  revalidatePath("/configuracoes", "layout");
  return { ok: true };
}

export async function ativarMarca(id: string, ativo: boolean): Promise<Resultado> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("procedimento_marca")
    .update({ ativo })
    .eq("id", id)
    .select("id");
  if (error) return erro(error);
  if (!data?.length) return { erro: "Só administração e gestão alteram o catálogo." };
  revalidatePath("/configuracoes", "layout");
  return { ok: true };
}
