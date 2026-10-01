import { createServerSupabase } from "@/lib/supabase/server";
import type { StatusAgendamento, TipoRecurso } from "@/lib/types/database";

export interface AgendamentoNaAgenda {
  id: string;
  inicio: string;
  fim: string;
  status: StatusAgendamento;
  numero_sessao: number | null;
  /** Total de sessões do pacote, para "sessão 3 de 10" (RF-62). */
  sessoes_pacote: number | null;
  paciente: { id: string; nome: string } | null;
  procedimento: { id: string; nome: string; duracao_min: number } | null;
  sala_id: string;
  equipamentos: { id: string; nome: string }[];
  profissionais: { id: string; nome: string; cor_agenda: string }[];
}

/** Coluna da timeline: cada recurso vira uma faixa vertical (RF-41). */
export interface ColunaRecurso {
  tipo: TipoRecurso;
  id: string;
  rotulo: string;
  subtitulo?: string;
}

export async function agendamentosDoPeriodo(
  inicio: Date,
  fim: Date,
): Promise<AgendamentoNaAgenda[]> {
  const supabase = await createServerSupabase();

  const { data } = await supabase
    .from("agendamento")
    .select(
      `id, inicio, fim, status, numero_sessao, sala_id,
       pacote:pacote_id (quantidade_sessoes),
       paciente:paciente_id (id, nome),
       procedimento:procedimento_id (id, nome, duracao_min),
       agendamento_equipamento ( equipamento:equipamento_id (id, nome) ),
       agendamento_profissional ( profissional:profissional_id (id, nome, cor_agenda) )`,
    )
    .gte("inicio", inicio.toISOString())
    .lt("inicio", fim.toISOString())
    .neq("status", "cancelado")
    .order("inicio");

  return (data ?? []).map((a) => {
    const linha = a as unknown as {
      id: string;
      inicio: string;
      fim: string;
      status: StatusAgendamento;
      numero_sessao: number | null;
      pacote: { quantidade_sessoes: number } | null;
      sala_id: string;
      paciente: { id: string; nome: string } | null;
      procedimento: { id: string; nome: string; duracao_min: number } | null;
      agendamento_equipamento: { equipamento: { id: string; nome: string } | null }[];
      agendamento_profissional: {
        profissional: { id: string; nome: string; cor_agenda: string } | null;
      }[];
    };

    return {
      id: linha.id,
      inicio: linha.inicio,
      fim: linha.fim,
      status: linha.status,
      numero_sessao: linha.numero_sessao,
      sessoes_pacote: linha.pacote?.quantidade_sessoes ?? null,
      sala_id: linha.sala_id,
      paciente: linha.paciente,
      procedimento: linha.procedimento,
      equipamentos: linha.agendamento_equipamento
        .map((x) => x.equipamento)
        .filter((x): x is { id: string; nome: string } => x !== null),
      profissionais: linha.agendamento_profissional
        .map((x) => x.profissional)
        .filter((x): x is { id: string; nome: string; cor_agenda: string } => x !== null),
    };
  });
}

/**
 * RF-48 · horários em que TODOS os recursos exigidos estão livres ao mesmo
 * tempo. Delega para a função SQL, que já cruza disponibilidade, bloqueio e
 * reservas existentes — repetir essa lógica em TypeScript garantiria divergência.
 */
export async function horariosLivres(params: {
  procedimentoId: string;
  de: Date;
  ate: Date;
  salaId?: string | null;
  equipamentos?: string[];
  profissionais?: string[];
  passoMin?: number;
  duracaoMin?: number | null;
}): Promise<{ inicio: string; fim: string }[]> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("horarios_livres", {
    p_procedimento: params.procedimentoId,
    p_de: params.de.toISOString(),
    p_ate: params.ate.toISOString(),
    p_sala: params.salaId ?? undefined,
    p_equipamentos: params.equipamentos ?? [],
    p_profissionais: params.profissionais ?? [],
    p_passo_min: params.passoMin ?? 15,
    p_duracao: params.duracaoMin ?? undefined,
  });

  if (error) return [];
  return (data ?? []) as { inicio: string; fim: string }[];
}

/** Requisitos de recurso do procedimento, para pré-seleção na agenda (RF-44). */
export async function requisitosDoProcedimento(procedimentoId: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("procedimento_requisito")
    .select("*")
    .eq("procedimento_id", procedimentoId);
  return data ?? [];
}

/** Profissionais habilitados para o procedimento (RF-23a / CA-18). */
export async function profissionaisHabilitados(procedimentoId: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("profissional_habilitacao")
    .select("profissional:profissional_id (id, nome, cor_agenda, ativo)")
    .eq("procedimento_id", procedimentoId);

  return (data ?? [])
    .map(
      (x) =>
        (
          x as unknown as {
            profissional: { id: string; nome: string; cor_agenda: string; ativo: boolean } | null;
          }
        ).profissional,
    )
    .filter(
      (p): p is { id: string; nome: string; cor_agenda: string; ativo: boolean } => !!p?.ativo,
    );
}

/**
 * Regras do catálogo que o formulário de agendamento aplica sozinho: quem é
 * habilitado em cada procedimento (RF-23a) e que aparelho ele exige (RF-44).
 */
export async function regrasDoCatalogo(): Promise<{
  habilitacoes: { profissional_id: string; procedimento_id: string }[];
  requisitos: { procedimento_id: string; modelo: string | null; quantidade: number }[];
}> {
  const supabase = await createServerSupabase();
  const [h, r] = await Promise.all([
    supabase.from("profissional_habilitacao").select("profissional_id, procedimento_id"),
    supabase
      .from("procedimento_requisito")
      .select("procedimento_id, modelo, quantidade")
      .eq("recurso_tipo", "equipamento"),
  ]);
  return { habilitacoes: h.data ?? [], requisitos: r.data ?? [] };
}

/**
 * RF-53 · carência entre sessões: a última sessão do mesmo procedimento,
 * antes do horário pretendido, se ela estiver mais perto que o mínimo.
 */
export async function carenciaViolada(
  pacienteId: string,
  procedimentoId: string,
  inicio: string,
): Promise<{ ultima: string; dias: number; minimo: number } | null> {
  const supabase = await createServerSupabase();
  const [{ data: proc }, { data: ultimas }] = await Promise.all([
    supabase.from("procedimento").select("intervalo_min_dias").eq("id", procedimentoId).single(),
    supabase
      .from("agendamento")
      .select("inicio")
      .eq("paciente_id", pacienteId)
      .eq("procedimento_id", procedimentoId)
      .not("status", "in", "(cancelado,falta)")
      .lt("inicio", inicio)
      .order("inicio", { ascending: false })
      .limit(1),
  ]);
  const minimo = proc?.intervalo_min_dias ?? 0;
  const ultima = ultimas?.[0]?.inicio;
  if (!minimo || !ultima) return null;
  const dias = Math.floor((new Date(inicio).getTime() - new Date(ultima).getTime()) / 86_400_000);
  return dias < minimo ? { ultima, dias, minimo } : null;
}
