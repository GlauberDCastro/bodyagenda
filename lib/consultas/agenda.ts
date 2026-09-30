import { createServerSupabase } from "@/lib/supabase/server";
import type { StatusAgendamento, TipoRecurso } from "@/lib/types/database";

export interface AgendamentoNaAgenda {
  id: string;
  inicio: string;
  fim: string;
  status: StatusAgendamento;
  numero_sessao: number | null;
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
      sala_id: linha.sala_id,
      paciente: linha.paciente,
      procedimento: linha.procedimento,
      equipamentos: linha.agendamento_equipamento
        .map((x) => x.equipamento)
        .filter((x): x is { id: string; nome: string } => x !== null),
      profissionais: linha.agendamento_profissional
        .map((x) => x.profissional)
        .filter(
          (x): x is { id: string; nome: string; cor_agenda: string } => x !== null,
        ),
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
    .map((x) => (x as unknown as { profissional: { id: string; nome: string; cor_agenda: string; ativo: boolean } | null }).profissional)
    .filter((p): p is { id: string; nome: string; cor_agenda: string; ativo: boolean } => !!p?.ativo);
}
