"use server";

import {
  buscarPacientes,
  pacotesAgendaveis,
  resumoDoPaciente,
  type ResumoPaciente,
} from "@/lib/consultas/pacientes";
import { carenciaViolada, horariosLivres } from "@/lib/consultas/agenda";
import { horarioDaClinica } from "@/lib/schemas/agenda";
import { createServerSupabase } from "@/lib/supabase/server";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Busca incremental de paciente para a agenda. Passa pelo RLS como qualquer leitura. */
export async function buscarPacientesAction(
  termo: string,
): Promise<{ id: string; nome: string }[]> {
  const pacientes = await buscarPacientes(termo);
  return pacientes
    .filter((p) => p.ativo)
    .slice(0, 20)
    .map((p) => ({ id: p.id, nome: p.nome }));
}

/**
 * RF-63 · só pacotes que a agenda pode consumir: ativos, com saldo e dentro
 * da validade. Oferecer um pacote sem saldo só para o banco recusar depois
 * é fazer a recepção descobrir o problema na frente do paciente.
 */
export async function pacotesDoPacienteAction(
  pacienteId: string,
): Promise<{ id: string; rotulo: string }[]> {
  const pacotes = await pacotesAgendaveis(pacienteId);
  return pacotes.map((p) => {
    const liquido = Number(p.valor_total) - Number(p.desconto);
    return {
      id: p.id,
      rotulo: `${p.procedimento?.nome ?? "—"} · sessão ${p.usadas + 1} de ${p.quantidade_sessoes} · ${brl.format(liquido / p.quantidade_sessoes)}/sessão`,
    };
  });
}

/**
 * RF-48 · próximos horários em que todos os recursos escolhidos estão livres,
 * a partir do dia do formulário, por 7 dias.
 */
export async function horariosLivresAction(params: {
  procedimentoId: string;
  dia: string;
  salaId?: string;
  equipamentos: string[];
  profissionais: string[];
  duracaoMin?: number | null;
}): Promise<string[]> {
  const de = new Date(horarioDaClinica(`${params.dia}T00:00`));
  const ate = new Date(de.getTime() + 7 * 86_400_000);
  const livres = await horariosLivres({
    procedimentoId: params.procedimentoId,
    de,
    ate,
    salaId: params.salaId || null,
    equipamentos: params.equipamentos,
    profissionais: params.profissionais,
    passoMin: 30,
    duracaoMin: params.duracaoMin,
  });
  return livres.slice(0, 60).map((l) => l.inicio);
}

/** RF-53 · alerta (sem bloquear) de sessão antes da carência mínima. */
export async function carenciaAction(pacienteId: string, procedimentoId: string, inicioLocal: string) {
  return carenciaViolada(pacienteId, procedimentoId, horarioDaClinica(inicioLocal));
}

/** Resumo do paciente para o painel do atendimento na agenda. */
export async function resumoPacienteAction(
  pacienteId: string,
  atendimentoAtual?: string,
): Promise<ResumoPaciente | null> {
  return resumoDoPaciente(pacienteId, atendimentoAtual);
}

/**
 * Quantos atendimentos há em cada dia do mês ("2026-10"), para marcar os dias
 * no mini-calendário da agenda. Passa pelo RLS: cada perfil conta o que vê.
 */
export async function atendimentosPorDiaAction(mes: string): Promise<Record<string, number>> {
  if (!/^\d{4}-\d{2}$/.test(mes)) return {};
  const [a, m] = mes.split("-").map(Number);
  const fim = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("agendamento")
    .select("inicio")
    .gte("inicio", horarioDaClinica(`${mes}-01T00:00`))
    .lt("inicio", horarioDaClinica(`${fim}T00:00`))
    .neq("status", "cancelado")
    .limit(5000);
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
  const contagem: Record<string, number> = {};
  for (const { inicio } of data ?? []) {
    const d = dia.format(new Date(inicio));
    contagem[d] = (contagem[d] ?? 0) + 1;
  }
  return contagem;
}
