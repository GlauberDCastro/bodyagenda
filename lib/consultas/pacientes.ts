import { createServerSupabase } from "@/lib/supabase/server";
import type { Paciente, Pacote, Procedimento, Agendamento } from "@/lib/types/database";
import type { Database } from "@/lib/types/supabase";

export interface PacoteComSaldo extends Pacote {
  procedimento: Pick<Procedimento, "id" | "nome" | "duracao_min"> | null;
  /** Sessões já consumidas — agendadas ou realizadas, mas não canceladas. */
  usadas: number;
  restantes: number;
  /** RF-62 · realizadas (ou falta, que consome a sessão) e só agendadas. */
  realizadas: number;
  agendadas: number;
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
    .in(
      "pacote_id",
      pacotes.map((p) => p.id),
    )
    .neq("status", "cancelado");

  const consumo = new Map<string, { realizadas: number; agendadas: number }>();
  for (const a of agendamentos ?? []) {
    if (!a.pacote_id) continue;
    const c = consumo.get(a.pacote_id) ?? { realizadas: 0, agendadas: 0 };
    if (a.status === "realizado" || a.status === "falta") c.realizadas++;
    else c.agendadas++;
    consumo.set(a.pacote_id, c);
  }

  return pacotes.map((p) => {
    const { realizadas, agendadas } = consumo.get(p.id) ?? { realizadas: 0, agendadas: 0 };
    const usadas = realizadas + agendadas;
    return {
      ...p,
      usadas,
      realizadas,
      agendadas,
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
    (p) => p.status === "ativo" && p.restantes > 0 && (!p.validade || p.validade >= hoje),
  );
}

export interface ResumoPaciente {
  id: string;
  nome: string;
  telefone: string | null;
  observacoes: string | null;
  consentimento_lgpd: boolean;
  realizados: number;
  faltas: number;
  ultimo: { inicio: string; procedimento: string; status: string } | null;
  proximo: { inicio: string; procedimento: string } | null;
  /** Soma das cobranças vencidas e não pagas. 0 para quem não lê o caixa. */
  emAtraso: number;
}

/**
 * O que a recepção precisa ver do paciente ao abrir um atendimento: alerta
 * clínico, contato para confirmar, frequência e se há débito. `atual` é o
 * atendimento aberto, que não conta como "último" nem "próximo".
 */
export async function resumoDoPaciente(id: string, atual?: string): Promise<ResumoPaciente | null> {
  const supabase = await createServerSupabase();
  const [{ data: p }, { data: ags }, { data: cobs }] = await Promise.all([
    supabase
      .from("paciente")
      .select("id, nome, telefone, observacoes, consentimento_lgpd")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("agendamento")
      .select("id, inicio, status, procedimento:procedimento_id (nome)")
      .eq("paciente_id", id)
      .neq("status", "cancelado")
      .order("inicio"),
    supabase.rpc("cobrancas", { p_paciente: id }),
  ]);
  if (!p) return null;

  const agora = new Date().toISOString();
  const lista = ((ags ?? []) as unknown as {
    id: string;
    inicio: string;
    status: string;
    procedimento: { nome: string } | null;
  }[]).filter((a) => a.id !== atual);
  const passados = lista.filter((a) => a.inicio < agora);
  const ultimo = passados.at(-1);
  const proximo = lista.find((a) => a.inicio >= agora);

  return {
    ...p,
    consentimento_lgpd: Boolean(p.consentimento_lgpd),
    realizados: lista.filter((a) => a.status === "realizado").length,
    faltas: lista.filter((a) => a.status === "falta").length,
    ultimo: ultimo
      ? { inicio: ultimo.inicio, procedimento: ultimo.procedimento?.nome ?? "—", status: ultimo.status }
      : null,
    proximo: proximo
      ? { inicio: proximo.inicio, procedimento: proximo.procedimento?.nome ?? "—" }
      : null,
    emAtraso: (cobs ?? [])
      .filter((c) => c.status === "atrasado")
      .reduce((t, c) => t + Number(c.valor), 0),
  };
}

export type LinhaPaciente =
  Database["public"]["Functions"]["pacientes_resumo"]["Returns"][number];

/**
 * Lista de pacientes com última visita, próximo atendimento, pacotes, faltas
 * e atraso. Marca os atrasados antes, como as telas de cobrança (RF-82).
 */
export async function listarPacientesResumo(termo: string): Promise<LinhaPaciente[]> {
  const supabase = await createServerSupabase();
  await supabase.rpc("marcar_atrasados");
  const { data } = await supabase.rpc("pacientes_resumo", { p_termo: termo });
  return (data ?? []).map((l) => ({ ...l, em_atraso: Number(l.em_atraso) }));
}
