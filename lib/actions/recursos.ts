"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  salaSchema,
  equipamentoSchema,
  profissionalSchema,
  disponibilidadeSchema,
  bloqueioSchema,
} from "@/lib/schemas/recursos";
import type { TipoRecurso } from "@/lib/types/database";

export interface Resultado {
  ok?: boolean;
  erro?: string;
  /** Erros por campo, para marcar o input certo no formulário. */
  campos?: Record<string, string>;
}

/** Converte ZodError no formato que os formulários consomem. */
function erroDeValidacao(issues: { path: PropertyKey[]; message: string }[]): Resultado {
  const campos: Record<string, string> = {};
  for (const i of issues) {
    const chave = String(i.path[0] ?? "_");
    campos[chave] ??= i.message;
  }
  return { erro: issues[0]?.message ?? "Dados inválidos", campos };
}

/**
 * Traduz erro do Postgres em mensagem útil.
 *
 * O RLS devolve "new row violates row-level security policy" quando o perfil
 * não pode escrever — que para o usuário significa "sem permissão", não um
 * defeito. Ver a matriz de acesso na SPEC §5.2.
 */
function erroDeBanco(erro: { code?: string; message: string }): Resultado {
  if (erro.code === "42501" || erro.message.includes("row-level security")) {
    return { erro: "Seu perfil não tem permissão para esta operação." };
  }
  if (erro.code === "23505") {
    return { erro: "Já existe um registro com esse valor único." };
  }
  if (erro.code === "23514") {
    return { erro: `Dados recusados pelas regras do cadastro: ${erro.message}` };
  }
  return { erro: erro.message };
}

function revalidarConfig() {
  revalidatePath("/configuracoes", "layout");
}

// ── Salas ────────────────────────────────────────────────────────────────────

export async function salvarSala(
  id: string | null,
  _anterior: Resultado,
  formData: FormData,
): Promise<Resultado> {
  const parsed = salaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return erroDeValidacao(parsed.error.issues);

  const supabase = await createServerSupabase();
  const { error } = id
    ? await supabase.from("sala").update(parsed.data).eq("id", id)
    : await supabase.from("sala").insert(parsed.data);

  if (error) return erroDeBanco(error);
  revalidarConfig();
  return { ok: true };
}

// ── Equipamentos ─────────────────────────────────────────────────────────────

export async function salvarEquipamento(
  id: string | null,
  _anterior: Resultado,
  formData: FormData,
): Promise<Resultado> {
  const parsed = equipamentoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return erroDeValidacao(parsed.error.issues);

  const { custo_hora, ...equipamento } = parsed.data;
  const supabase = await createServerSupabase();

  const { data, error } = id
    ? await supabase.from("equipamento").update(equipamento).eq("id", id).select("id").single()
    : await supabase.from("equipamento").insert(equipamento).select("id").single();

  if (error) return erroDeBanco(error);

  // Custo vive em tabela própria para que o RLS possa escondê-lo da recepção
  // sem view nem filtro na aplicação (SPEC §3.2).
  const { error: erroCusto } = await supabase
    .from("equipamento_custo")
    .upsert({ equipamento_id: data.id, custo_hora }, { onConflict: "equipamento_id" });

  if (erroCusto) return erroDeBanco(erroCusto);
  revalidarConfig();
  return { ok: true };
}

/**
 * RF-19b · duplica um recurso copiando atributos e agenda de disponibilidade.
 *
 * Cadastrar o 5º Ultraformer não deve exigir refazer as janelas de
 * atendimento uma a uma. Número de série e nome ficam distintos de propósito:
 * são identidade da unidade, não do modelo.
 */
export async function duplicarEquipamento(id: string): Promise<Resultado> {
  const supabase = await createServerSupabase();

  // Colunas explícitas, não `select("*")` com spread: assim o TypeScript
  // garante que `modelo` — obrigatório — sempre viaja para a cópia.
  const { data: origem, error } = await supabase
    .from("equipamento")
    .select(
      "nome, modelo, tipo_alocacao, sala_id, custo_aquisicao, vigencia_inicio, vigencia_fim, ativo",
    )
    .eq("id", id)
    .single();
  if (error) return erroDeBanco(error);

  const { data: copia, error: erroInsert } = await supabase
    .from("equipamento")
    .insert({
      modelo: origem.modelo,
      nome: `${origem.nome} (cópia)`,
      tipo_alocacao: origem.tipo_alocacao,
      sala_id: origem.sala_id,
      custo_aquisicao: origem.custo_aquisicao,
      vigencia_inicio: origem.vigencia_inicio,
      vigencia_fim: origem.vigencia_fim,
      ativo: origem.ativo,
      // Série e nome são identidade da unidade, não do modelo — não se copiam.
      numero_serie: null,
    })
    .select("id")
    .single();
  if (erroInsert) return erroDeBanco(erroInsert);

  // Copia as janelas de disponibilidade da unidade de origem.
  const { data: janelas } = await supabase
    .from("recurso_disponibilidade")
    .select("dia_semana, hora_inicio, hora_fim")
    .eq("recurso_tipo", "equipamento")
    .eq("recurso_id", id);

  if (janelas?.length) {
    const { error: erroJanelas } = await supabase.from("recurso_disponibilidade").insert(
      janelas.map((j) => ({
        ...j,
        recurso_tipo: "equipamento" as const,
        recurso_id: copia.id,
      })),
    );
    if (erroJanelas) return erroDeBanco(erroJanelas);
  }

  revalidarConfig();
  return { ok: true };
}

// ── Profissionais ────────────────────────────────────────────────────────────

export async function salvarProfissional(
  id: string | null,
  _anterior: Resultado,
  formData: FormData,
): Promise<Resultado> {
  const bruto = Object.fromEntries(formData);
  const parsed = profissionalSchema.safeParse({
    ...bruto,
    procedimentos: formData.getAll("procedimentos"),
  });
  if (!parsed.success) return erroDeValidacao(parsed.error.issues);

  const { custo_hora, comissao_tipo, comissao_valor, procedimentos, ...prof } = parsed.data;
  const supabase = await createServerSupabase();

  const { data, error } = id
    ? await supabase.from("profissional").update(prof).eq("id", id).select("id").single()
    : await supabase.from("profissional").insert(prof).select("id").single();

  if (error) return erroDeBanco(error);

  const { error: erroRemun } = await supabase
    .from("profissional_remuneracao")
    .upsert(
      { profissional_id: data.id, custo_hora, comissao_tipo, comissao_valor },
      { onConflict: "profissional_id" },
    );
  if (erroRemun) return erroDeBanco(erroRemun);

  // RF-23a · habilitação por procedimento. Substitui o conjunto inteiro.
  await supabase.from("profissional_habilitacao").delete().eq("profissional_id", data.id);
  if (procedimentos.length) {
    const { error: erroHab } = await supabase
      .from("profissional_habilitacao")
      .insert(procedimentos.map((p) => ({ profissional_id: data.id, procedimento_id: p })));
    if (erroHab) return erroDeBanco(erroHab);
  }

  revalidarConfig();
  return { ok: true };
}

// ── Inativação ───────────────────────────────────────────────────────────────

/**
 * RF-27 · inativar alerta sobre agendamentos futuros.
 *
 * Nunca deleta (princípio P5): o histórico financeiro e de ocupação depende
 * do recurso continuar existindo. Inativar também não cancela agendamento
 * nenhum — só impede novos.
 */
export async function inativarRecurso(
  tipo: TipoRecurso,
  id: string,
  confirmado = false,
): Promise<Resultado & { agendamentosFuturos?: number }> {
  const supabase = await createServerSupabase();

  const { count } = await supabase
    .from("reserva")
    .select("id", { count: "exact", head: true })
    .eq("recurso_tipo", tipo)
    .eq("recurso_id", id)
    .eq("ativo", true)
    .gte("periodo", new Date().toISOString());

  if (count && count > 0 && !confirmado) {
    return {
      erro: `Este recurso tem ${count} agendamento(s) futuro(s). Inativar não os cancela — confirme para prosseguir.`,
      agendamentosFuturos: count,
    };
  }

  const { error } = await supabase.from(tipo).update({ ativo: false }).eq("id", id);
  if (error) return erroDeBanco(error);

  revalidarConfig();
  return { ok: true };
}

export async function reativarRecurso(tipo: TipoRecurso, id: string): Promise<Resultado> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from(tipo).update({ ativo: true }).eq("id", id);
  if (error) return erroDeBanco(error);
  revalidarConfig();
  return { ok: true };
}

// ── Disponibilidade e bloqueios ──────────────────────────────────────────────

export async function adicionarDisponibilidade(
  _anterior: Resultado,
  formData: FormData,
): Promise<Resultado> {
  const parsed = disponibilidadeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return erroDeValidacao(parsed.error.issues);

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("recurso_disponibilidade").insert(parsed.data);
  if (error) return erroDeBanco(error);

  revalidarConfig();
  return { ok: true };
}

export async function removerDisponibilidade(id: string): Promise<Resultado> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("recurso_disponibilidade").delete().eq("id", id);
  if (error) return erroDeBanco(error);
  revalidarConfig();
  return { ok: true };
}

export async function adicionarBloqueio(
  _anterior: Resultado,
  formData: FormData,
): Promise<Resultado> {
  const parsed = bloqueioSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return erroDeValidacao(parsed.error.issues);

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("recurso_bloqueio").insert(parsed.data);
  if (error) return erroDeBanco(error);

  revalidarConfig();
  return { ok: true };
}

export async function removerBloqueio(id: string): Promise<Resultado> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("recurso_bloqueio").delete().eq("id", id);
  if (error) return erroDeBanco(error);
  revalidarConfig();
  return { ok: true };
}

/**
 * Exclusão de recurso.
 *
 * O banco decide (migração 0013): recurso sem nenhuma referência é apagado de
 * verdade; com histórico, recusa e devolvemos o motivo para a tela oferecer a
 * inativação. Apagar sala com agendamento passado não limpa cadastro —
 * quebra todo relatório retroativo.
 */
export async function excluirRecurso(
  tipo: TipoRecurso,
  id: string,
): Promise<Resultado & { emUso?: boolean }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("excluir_recurso", {
    p_tipo: tipo,
    p_id: id,
  });

  if (error) {
    if (error.code === "23503") {
      return { erro: error.message, emUso: true };
    }
    return erroDeBanco(error);
  }

  revalidarConfig();
  return { ok: true };
}

/** Carrega um recurso para edição, com os campos que vivem em tabela própria. */
export async function carregarEquipamento(id: string) {
  const supabase = await createServerSupabase();
  const [{ data: eq }, { data: custo }] = await Promise.all([
    supabase.from("equipamento").select("*").eq("id", id).maybeSingle(),
    supabase.from("equipamento_custo").select("custo_hora").eq("equipamento_id", id).maybeSingle(),
  ]);
  return eq ? { ...eq, custo_hora: Number(custo?.custo_hora ?? 0) } : null;
}

export async function carregarProfissional(id: string) {
  const supabase = await createServerSupabase();
  const [{ data: prof }, { data: remun }, { data: hab }] = await Promise.all([
    supabase.from("profissional").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("profissional_remuneracao")
      .select("custo_hora, comissao_tipo, comissao_valor")
      .eq("profissional_id", id)
      .maybeSingle(),
    supabase
      .from("profissional_habilitacao")
      .select("procedimento_id")
      .eq("profissional_id", id),
  ]);

  return prof
    ? {
        ...prof,
        custo_hora: Number(remun?.custo_hora ?? 0),
        comissao_tipo: remun?.comissao_tipo ?? ("nenhuma" as const),
        comissao_valor: Number(remun?.comissao_valor ?? 0),
        procedimentos: (hab ?? []).map((h) => h.procedimento_id),
      }
    : null;
}
