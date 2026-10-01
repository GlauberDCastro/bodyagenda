"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { pacienteSchema, pacoteSchema } from "@/lib/schemas/pacientes";
import type { Resultado } from "./recursos";

function erroDeValidacao(issues: { path: PropertyKey[]; message: string }[]): Resultado {
  const campos: Record<string, string> = {};
  for (const i of issues) campos[String(i.path[0] ?? "_")] ??= i.message;
  return { erro: issues[0]?.message ?? "Dados inválidos", campos };
}

function erroDeBanco(erro: { code?: string; message: string }): Resultado {
  if (erro.code === "42501" || erro.message.includes("row-level security")) {
    return { erro: "Seu perfil não tem permissão para esta operação." };
  }
  if (erro.code === "23505" && erro.message.includes("cpf")) {
    return { erro: "Já existe um paciente com este CPF.", campos: { cpf: "CPF já cadastrado" } };
  }
  if (erro.code === "23505") return { erro: "Já existe um registro com esse valor único." };
  if (erro.code === "23514") return { erro: erro.message };
  return { erro: erro.message };
}

export async function salvarPaciente(
  id: string | null,
  _anterior: Resultado,
  formData: FormData,
): Promise<Resultado> {
  const parsed = pacienteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return erroDeValidacao(parsed.error.issues);

  const { consentimento_lgpd, ...paciente } = parsed.data;
  const supabase = await createServerSupabase();

  // RF-14 · o consentimento carrega a data em que foi dado. Marcar `true` sem
  // registrar quando não comprova nada perante a LGPD.
  const dados = {
    ...paciente,
    consentimento_lgpd,
    consentimento_em: consentimento_lgpd ? new Date().toISOString() : null,
  };

  const { error } = id
    ? await supabase.from("paciente").update(dados).eq("id", id)
    : await supabase.from("paciente").insert(dados);

  if (error) return erroDeBanco(error);
  revalidatePath("/pacientes");
  return { ok: true };
}

/**
 * Cadastro rápido no meio do agendamento: paciente novo ao telefone não pode
 * obrigar a recepção a sair da agenda. Só o essencial; o resto (endereço,
 * consentimento LGPD) completa-se depois na ficha do paciente.
 */
export async function cadastrarPacienteRapido(dados: {
  nome: string;
  telefone?: string;
  cpf?: string;
}): Promise<Resultado & { paciente?: { id: string; nome: string } }> {
  const parsed = pacienteSchema.safeParse({ ...dados, consentimento_lgpd: false });
  if (!parsed.success) return erroDeValidacao(parsed.error.issues);

  const { consentimento_lgpd, ...paciente } = parsed.data;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("paciente")
    .insert({ ...paciente, consentimento_lgpd, consentimento_em: null })
    .select("id, nome")
    .single();

  if (error) return erroDeBanco(error);
  revalidatePath("/pacientes");
  return { ok: true, paciente: data };
}

/**
 * RF-15 · paciente é inativado, nunca deletado.
 * O histórico financeiro e de ocupação depende de o registro continuar existindo.
 */
export async function inativarPaciente(id: string): Promise<Resultado> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("paciente").update({ ativo: false }).eq("id", id);
  if (error) return erroDeBanco(error);
  revalidatePath("/pacientes");
  return { ok: true };
}

export async function venderPacote(_anterior: Resultado, formData: FormData): Promise<Resultado> {
  const parsed = pacoteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return erroDeValidacao(parsed.error.issues);

  const supabase = await createServerSupabase();
  const { data: sessao } = await supabase.auth.getUser();

  const { error } = await supabase.from("pacote").insert({
    ...parsed.data,
    vendido_por: sessao.user?.id ?? null,
  });

  if (error) return erroDeBanco(error);
  revalidatePath(`/pacientes/${parsed.data.paciente_id}`);
  return { ok: true };
}

/**
 * RF-65 · cancelar pacote com saldo.
 *
 * Não cancela os agendamentos já marcados — decisão deliberada: remarcar ou
 * cancelar sessão é ato da recepção com o paciente, não efeito colateral.
 */
export async function cancelarPacote(id: string, pacienteId: string): Promise<Resultado> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("pacote").update({ status: "cancelado" }).eq("id", id);
  if (error) return erroDeBanco(error);
  revalidatePath(`/pacientes/${pacienteId}`);
  return { ok: true };
}
