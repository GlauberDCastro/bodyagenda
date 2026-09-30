import { createServerSupabase } from "@/lib/supabase/server";
import type { Paciente, Pacote, Procedimento, Agendamento } from "@/lib/types/database";

export interface PacoteComSaldo extends Pacote {
  procedimento: Pick<Procedimento, "id" | "nome" | "duracao_min"> | null;
  /** Sessões já consumidas — agendadas ou realizadas, mas não canceladas. */
  usadas: number;
  restantes: number;
}

export async function buscarPacientes(termo: string): Promise<Paciente[]> {
  const supabase = await createServerSupabase();
  let query = supabase.from("paciente").select("*").order("nome").limit(50);

  if (termo.trim()) {
    const limpo = termo.replace(/\D/g, "");
    // Busca por nome, ou por CPF/telefone quando o termo parece numérico (RF-12).
    query =
      limpo.length >= 3 && limpo.length === termo.replace(/\s|\.|-|\(|\)/g, "").length
        ? query.or(`cpf.ilike.%${limpo}%,telefone.ilike.%${limpo}%`)
        : query.ilike("nome", `%${termo}%`);
  }

  const { data } = await query;
  return data ?? [];
}

export async function buscarPaciente(id: string): Promise<Paciente | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("paciente").select("*").eq("id", id).maybeSingle();
  return data;
}

/**
 * RF-62 · saldo no formato "sessão 3 de 10".
 *
 * As sessões consumidas contam agendamentos com status diferente de
 * `cancelado` — inclusive `falta`, porque falta consome a sessão (RN-06).
 */
export async function pacotesDoPaciente(pacienteId: string): Promise<PacoteComSaldo[]> {
  const supabase = await createServerSupabase();

  const { data: pacotes } = await supabase
    .from("pacote")
    .select("*, procedimento:procedimento_id (id, nome, duracao_min)")
    .eq("paciente_id", pacienteId)
    .order("data_venda", { ascending: false });

  if (!pacotes?.length) return [];

  const { data: agendamentos } = await supabase
    .from("agendamento")
    .select("pacote_id, status")
    .in("pacote_id", pacotes.map((p) => p.id))
    .neq("status", "cancelado");

  const consumo = new Map<string, number>();
  for (const a of agendamentos ?? []) {
    if (a.pacote_id) consumo.set(a.pacote_id, (consumo.get(a.pacote_id) ?? 0) + 1);
  }

  return pacotes.map((p) => {
    const usadas = consumo.get(p.id) ?? 0;
    return {
      ...p,
      usadas,
      restantes: Math.max(0, p.quantidade_sessoes - usadas),
    } as PacoteComSaldo;
  });
}

export async function agendamentosDoPaciente(
  pacienteId: string,
): Promise<(Agendamento & { procedimento: { nome: string } | null })[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("agendamento")
    .select("*, procedimento:procedimento_id (nome)")
    .eq("paciente_id", pacienteId)
    .order("inicio", { ascending: false })
    .limit(50);
  return (data ?? []) as (Agendamento & { procedimento: { nome: string } | null })[];
}

/** Pacotes ativos com saldo — o que a agenda pode consumir (RF-63). */
export async function pacotesAgendaveis(pacienteId: string): Promise<PacoteComSaldo[]> {
  const hoje = new Date().toISOString().slice(0, 10);
  return (await pacotesDoPaciente(pacienteId)).filter(
    (p) =>
      p.status === "ativo" &&
      p.restantes > 0 &&
      (!p.validade || p.validade >= hoje),
  );
}
