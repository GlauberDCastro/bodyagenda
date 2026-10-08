"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Resultado } from "./recursos";

const procedimentoSchema = z.object({
  nome: z.string().min(1, "Informe o nome"),
  descricao: z.preprocess((v) => (v === "" ? null : v), z.string().nullable()),
  duracao_min: z.coerce.number().int().positive("Duração deve ser maior que zero"),
  // A-09 · tempo de preparo/limpeza entre pacientes.
  buffer_min: z.coerce.number().int().min(0).default(0),
  sessoes_padrao: z.coerce.number().int().positive("Ao menos 1 sessão"),
  valor_sessao: z.coerce.number().nonnegative("Valor não pode ser negativo"),
  // Preço na venda parcelada; vazio = o parcelado cobra o mesmo que à vista.
  valor_parcelado: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.coerce.number().nonnegative("Valor não pode ser negativo").nullable(),
  ),
  intervalo_min_dias: z.coerce.number().int().min(0).default(0),
});

const custoSchema = z.object({
  procedimento_id: z.uuid(),
  tipo: z.enum(["insumo", "mao_de_obra", "equipamento", "outro"]),
  descricao: z.string().min(1, "Descreva o custo"),
  valor_unitario: z.coerce.number().nonnegative(),
  quantidade: z.coerce.number().positive("Quantidade deve ser maior que zero"),
});

// RF-33 · aparelho por modelo, sala específica ou N profissionais.
const requisitoSchema = z
  .object({
    procedimento_id: z.uuid(),
    recurso_tipo: z.enum(["sala", "equipamento", "profissional"]),
    modelo: z.string().nullish().transform((v) => v || null),
    recurso_id: z
      .string()
      .nullish()
      .transform((v) => v || null),
    quantidade: z.coerce.number().int().positive().default(1),
    obrigatorio: z.preprocess((v) => v === "on" || v === true, z.boolean()),
  })
  .superRefine((d, ctx) => {
    if (d.recurso_tipo === "equipamento" && !d.modelo) {
      ctx.addIssue({ code: "custom", path: ["modelo"], message: "Informe o modelo do equipamento" });
    }
    if (d.recurso_tipo === "sala" && !d.recurso_id) {
      ctx.addIssue({ code: "custom", path: ["recurso_id"], message: "Escolha a sala" });
    }
  })
  .transform((d) => ({
    ...d,
    // Cada tipo guarda só o seu alvo.
    modelo: d.recurso_tipo === "equipamento" ? d.modelo : null,
    recurso_id: d.recurso_tipo === "sala" ? d.recurso_id : null,
    quantidade: d.recurso_tipo === "sala" ? 1 : d.quantidade,
  }));

function validacao(issues: { path: PropertyKey[]; message: string }[]): Resultado {
  const campos: Record<string, string> = {};
  for (const i of issues) campos[String(i.path[0] ?? "_")] ??= i.message;
  return { erro: issues[0]?.message ?? "Dados inválidos", campos };
}

function erroDeBanco(erro: { code?: string; message: string }): Resultado {
  if (erro.code === "42501" || erro.message.includes("row-level security")) {
    return { erro: "Apenas o administrador altera o catálogo e seus custos." };
  }
  return { erro: erro.message };
}

export async function salvarProcedimento(
  id: string | null,
  _anterior: Resultado,
  formData: FormData,
): Promise<Resultado> {
  const parsed = procedimentoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validacao(parsed.error.issues);

  const supabase = await createServerSupabase();

  // RF-34 · alterar preço ou custo NÃO altera pacotes já vendidos nem
  // agendamentos realizados: aqueles guardam o valor do momento da venda.
  const { error } = id
    ? await supabase.from("procedimento").update(parsed.data).eq("id", id)
    : await supabase.from("procedimento").insert(parsed.data);

  if (error) return erroDeBanco(error);
  revalidatePath("/configuracoes/procedimentos");
  if (id) revalidatePath(`/configuracoes/procedimentos/${id}`);
  return { ok: true };
}

export async function adicionarCusto(_anterior: Resultado, formData: FormData): Promise<Resultado> {
  const parsed = custoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validacao(parsed.error.issues);

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("procedimento_custo").insert(parsed.data);
  if (error) return erroDeBanco(error);

  revalidatePath(`/configuracoes/procedimentos/${parsed.data.procedimento_id}`);
  return { ok: true };
}

export async function removerCusto(id: string, procedimentoId: string): Promise<Resultado> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("procedimento_custo").delete().eq("id", id);
  if (error) return erroDeBanco(error);
  revalidatePath(`/configuracoes/procedimentos/${procedimentoId}`);
  return { ok: true };
}

/**
 * RF-33 · requisito por MODELO, não por unidade.
 *
 * "Ultraformer Olhos exige um Ultraformer" deixa o sistema achar sozinho qual
 * das 4 unidades está livre. Amarrar à unidade #1 inventaria um gargalo que
 * não existe.
 */
export async function adicionarRequisito(
  _anterior: Resultado,
  formData: FormData,
): Promise<Resultado> {
  const parsed = requisitoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validacao(parsed.error.issues);

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("procedimento_requisito").insert(parsed.data);
  if (error) return erroDeBanco(error);

  revalidatePath(`/configuracoes/procedimentos/${parsed.data.procedimento_id}`);
  return { ok: true };
}

export async function removerRequisito(id: string, procedimentoId: string): Promise<Resultado> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("procedimento_requisito").delete().eq("id", id);
  if (error) return erroDeBanco(error);
  revalidatePath(`/configuracoes/procedimentos/${procedimentoId}`);
  return { ok: true };
}

export async function alternarAtivoProcedimento(id: string, ativo: boolean): Promise<Resultado> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("procedimento").update({ ativo }).eq("id", id);
  if (error) return erroDeBanco(error);
  revalidatePath("/configuracoes/procedimentos");
  revalidatePath(`/configuracoes/procedimentos/${id}`);
  revalidatePath("/agenda");
  return { ok: true };
}

/**
 * RF-19b · cria uma variação do procedimento sem refazer o cadastro: copia
 * custos, requisitos, regiões e quem é habilitado. A cópia nasce inativa,
 * para não aparecer na agenda antes de ser revisada.
 */
export async function duplicarProcedimento(id: string): Promise<Resultado & { id?: string }> {
  const supabase = await createServerSupabase();
  const [{ data: origem, error }, { data: custos }, { data: requisitos }, { data: regioes }, { data: habilitacoes }] =
    await Promise.all([
      supabase
        .from("procedimento")
        .select(
          "nome, descricao, duracao_min, buffer_min, sessoes_padrao, valor_sessao, intervalo_min_dias, valor_tabela, valor_parcelado",
        )
        .eq("id", id)
        .single(),
      supabase
        .from("procedimento_custo")
        .select("tipo, descricao, valor_unitario, quantidade")
        .eq("procedimento_id", id),
      supabase
        .from("procedimento_requisito")
        .select("recurso_tipo, recurso_id, modelo, quantidade, obrigatorio")
        .eq("procedimento_id", id),
      supabase
        .from("procedimento_regiao")
        .select(
          "regiao_id, duracao_min, sessoes_padrao, valor_sessao, intervalo_min_dias, unidade, quantidade_padrao, observacoes, ativo, valor_tabela, valor_parcelado",
        )
        .eq("procedimento_id", id),
      supabase.from("profissional_habilitacao").select("profissional_id").eq("procedimento_id", id),
    ]);
  if (error) return erroDeBanco(error);

  const { data: copia, error: erroInsert } = await supabase
    .from("procedimento")
    .insert({ ...origem, nome: `${origem.nome} (cópia)`, ativo: false })
    .select("id")
    .single();
  if (erroInsert) return erroDeBanco(erroInsert);

  const comNovo = <T extends object>(linhas: T[] | null) =>
    (linhas ?? []).map((l) => ({ ...l, procedimento_id: copia.id }));
  for (const [tabela, linhas] of [
    ["procedimento_custo", comNovo(custos)],
    ["procedimento_requisito", comNovo(requisitos)],
    ["procedimento_regiao", comNovo(regioes)],
    ["profissional_habilitacao", comNovo(habilitacoes)],
  ] as const) {
    if (linhas.length === 0) continue;
    const { error: e } = await supabase.from(tabela).insert(linhas as never);
    if (e) return erroDeBanco(e);
  }

  revalidatePath("/configuracoes/procedimentos");
  return { ok: true, id: copia.id };
}
