"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Resultado } from "./recursos";

/** "0,5" e "0.5" valem o mesmo: a gestão digita do jeito brasileiro. */
const decimal = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : Number(v.replace(",", "."))) : v),
  z.number({ error: "Informe um número" }).positive("Precisa ser maior que zero"),
);
const mesValido = z.string().regex(/^\d{4}-\d{2}$/, "Mês inválido");

function invalido(issues: { path: PropertyKey[]; message: string }[]): Resultado {
  const campos: Record<string, string> = {};
  for (const i of issues) campos[String(i.path[0] ?? "_")] ??= i.message;
  return { erro: issues[0]?.message ?? "Dados inválidos", campos };
}

const recusado = (e: { code?: string; message: string }): Resultado =>
  e.code === "42501" || e.message.includes("row-level security")
    ? { erro: "Só administração e gestão definem metas." }
    : { erro: e.message };

function revalidar() {
  revalidatePath("/configuracoes/metas");
  revalidatePath("/gestao");
  revalidatePath("/");
}

const ocupacaoSchema = z.object({
  mes: mesValido,
  ocupacao: z.preprocess(
    (v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v),
    z.number().gt(0, "Informe a meta em %").max(100, "No máximo 100%"),
  ),
});

export async function salvarMetaOcupacao(_a: Resultado, formData: FormData): Promise<Resultado> {
  const parsed = ocupacaoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalido(parsed.error.issues);
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("meta_mes")
    .upsert({ mes: parsed.data.mes, ocupacao: parsed.data.ocupacao / 100 }, { onConflict: "mes" });
  if (error) return recusado(error);
  revalidar();
  return { ok: true };
}

const metaSchema = z
  .object({
    mes: mesValido,
    rotulo: z.string().trim().min(2, "Dê um nome à meta"),
    procedimento_id: z.uuid("Escolha o procedimento"),
    regioes: z.array(z.uuid()).default([]),
    contagem: z.enum(["venda", "pacote"]),
    por_dia_min: decimal,
    por_dia_max: z.preprocess((v) => (v === "" ? undefined : v), decimal.optional()),
  })
  .refine((d) => d.por_dia_max === undefined || d.por_dia_max >= d.por_dia_min, {
    path: ["por_dia_max"],
    message: "O máximo não pode ser menor que o mínimo",
  });

export async function salvarMetaVenda(
  id: string | null,
  _a: Resultado,
  formData: FormData,
): Promise<Resultado> {
  const parsed = metaSchema.safeParse({
    ...Object.fromEntries(formData),
    regioes: formData.getAll("regioes"),
  });
  if (!parsed.success) return invalido(parsed.error.issues);
  const d = { ...parsed.data, por_dia_max: parsed.data.por_dia_max ?? null };
  const supabase = await createServerSupabase();

  if (id) {
    const { error } = await supabase.from("meta_venda").update(d).eq("id", id);
    if (error) return recusado(error);
  } else {
    const { data: ultima } = await supabase
      .from("meta_venda")
      .select("ordem")
      .eq("mes", d.mes)
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase
      .from("meta_venda")
      .insert({ ...d, ordem: (ultima?.ordem ?? 0) + 1 });
    if (error) return recusado(error);
  }
  revalidar();
  return { ok: true };
}

export async function excluirMetaVenda(id: string): Promise<Resultado> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("meta_venda").delete().eq("id", id).select("id");
  if (error) return recusado(error);
  if (!data?.length) return { erro: "Só administração e gestão definem metas." };
  revalidar();
  return { ok: true };
}

/** Repete as metas de um mês em outro (o ponto de partida do mês novo). */
export async function copiarMetas(de: string, para: string): Promise<Resultado> {
  if (!/^\d{4}-\d{2}$/.test(de) || !/^\d{4}-\d{2}$/.test(para)) return { erro: "Mês inválido" };
  const supabase = await createServerSupabase();
  const [{ data: m }, { data: lista }] = await Promise.all([
    supabase.from("meta_mes").select("ocupacao").eq("mes", de).maybeSingle(),
    supabase.from("meta_venda").select("*").eq("mes", de),
  ]);
  if (m) {
    const { error } = await supabase
      .from("meta_mes")
      .upsert({ mes: para, ocupacao: m.ocupacao }, { onConflict: "mes" });
    if (error) return recusado(error);
  }
  if (lista?.length) {
    const { error } = await supabase
      .from("meta_venda")
      .insert(lista.map(({ id: _id, created_at: _c, ...x }) => ({ ...x, mes: para })));
    if (error) return recusado(error);
  }
  revalidar();
  return { ok: true };
}
