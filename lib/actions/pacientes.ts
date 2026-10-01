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
): Promise<Resultado & { homonimo?: { id: string; nome: string } }> {
  const parsed = pacienteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return erroDeValidacao(parsed.error.issues);

  const { consentimento_lgpd, ...paciente } = parsed.data;
  const supabase = await createServerSupabase();

  // RF-11 · mesmo nome e mesma data de nascimento quase sempre é a mesma
  // pessoa cadastrada duas vezes. Avisa e pede confirmação; não bloqueia,
  // porque homônimo existe.
  if (!id && paciente.data_nascimento && formData.get("confirmar_homonimo") !== "on") {
    const { data: igual } = await supabase
      .from("paciente")
      .select("id, nome")
      .ilike("nome", paciente.nome.trim())
      .eq("data_nascimento", paciente.data_nascimento)
      .limit(1)
      .maybeSingle();
    if (igual) {
      return {
        erro: "Já existe um paciente com este nome e esta data de nascimento.",
        homonimo: igual,
      };
    }
  }

  // RF-14 · o consentimento carrega a data em que foi dado. Marcar `true` sem
  // registrar quando não comprova nada perante a LGPD — e editar a ficha
  // depois não pode trocar essa data.
  let consentimentoEm: string | null = consentimento_lgpd ? new Date().toISOString() : null;
  if (id && consentimento_lgpd) {
    const { data: atual } = await supabase
      .from("paciente")
      .select("consentimento_em")
      .eq("id", id)
      .maybeSingle();
    consentimentoEm = atual?.consentimento_em ?? consentimentoEm;
  }
  const dados = { ...paciente, consentimento_lgpd, consentimento_em: consentimentoEm };

  const { error } = id
    ? await supabase.from("paciente").update(dados).eq("id", id)
    : await supabase.from("paciente").insert(dados);

  if (error) return erroDeBanco(error);
  revalidatePath("/pacientes");
  if (id) revalidatePath(`/pacientes/${id}`);
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
  revalidatePath(`/pacientes/${id}`);
  return { ok: true };
}

export async function reativarPaciente(id: string): Promise<Resultado> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("paciente").update({ ativo: true }).eq("id", id);
  if (error) return erroDeBanco(error);
  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${id}`);
  return { ok: true };
}

export async function venderPacote(_anterior: Resultado, formData: FormData): Promise<Resultado> {
  const parsed = pacoteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return erroDeValidacao(parsed.error.issues);
  const d = parsed.data;

  // RF-80 · pacote e parcelas numa transação só (migração 0028).
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("vender_pacote", {
    p_paciente: d.paciente_id,
    p_procedimento: d.procedimento_id,
    p_sessoes: d.quantidade_sessoes,
    p_valor_total: d.valor_total,
    p_desconto: d.desconto,
    p_validade: d.validade,
    p_regiao: null,
    p_parcelas: d.parcelas,
    p_primeiro_vencimento: d.primeiro_vencimento,
    p_forma: d.forma_pagamento,
    p_primeira_paga: d.primeira_paga,
  });

  if (error) return erroDeBanco(error);
  revalidatePath(`/pacientes/${d.paciente_id}`);
  revalidatePath("/recebimentos");
  return { ok: true };
}

/**
 * RF-65 · cancelar pacote com saldo.
 *
 * Cancela as parcelas em aberto e apura pago × consumido (migração 0028):
 * pago a mais vira estorno a devolver, pago a menos vira saldo a cobrar.
 * Não cancela os agendamentos já marcados — remarcar ou cancelar sessão é ato
 * da recepção com o paciente, não efeito colateral.
 */
export async function cancelarPacote(
  id: string,
  pacienteId: string,
): Promise<Resultado & { saldo?: number; pago?: number; consumido?: number }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("cancelar_pacote", { p_pacote: id });
  if (error) return erroDeBanco(error);
  const r = data as { saldo: number; pago: number; consumido: number };
  revalidatePath(`/pacientes/${pacienteId}`);
  revalidatePath("/recebimentos");
  return { ok: true, saldo: Number(r.saldo), pago: Number(r.pago), consumido: Number(r.consumido) };
}
