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
  pacote_id: string | null;
  valor_avulso: number | null;
  observacoes: string | null;
  motivo_cancelamento: string | null;
  paciente: { id: string; nome: string; telefone: string | null } | null;
  procedimento: {
    id: string;
    nome: string;
    duracao_min: number;
    buffer_min: number;
    avaliacao: boolean;
  } | null;
  /** agenda, comercial (SDR/closer) ou upsell (vendido num atendimento). */
  origem: "agenda" | "comercial" | "upsell";
  vendedor: { id: string; nome: string } | null;
  atendimento_origem_id: string | null;
  /** Paciente nunca fez avaliação inicial (e este atendimento não é uma). */
  sem_avaliacao: boolean;
  sala_id: string;
  sala: { numero: number; nome: string } | null;
  /** Regiões do atendimento (Ultraformer: papada, pálpebras…). */
  regioes: string[];
  equipamentos: { id: string; nome: string }[];
  profissionais: { id: string; nome: string; cor_agenda: string }[];
}

const CAMPOS_AGENDA = `id, inicio, fim, status, numero_sessao, sala_id, pacote_id, valor_avulso,
       observacoes, motivo_cancelamento, origem, atendimento_origem_id, vendido_por,
       pacote:pacote_id (quantidade_sessoes),
       sala:sala_id (numero, nome),
       paciente:paciente_id (id, nome, telefone),
       procedimento:procedimento_id (id, nome, duracao_min, buffer_min, avaliacao),
       agendamento_equipamento ( equipamento:equipamento_id (id, nome) ),
       agendamento_regiao ( regiao:regiao_id (nome) ),
       agendamento_profissional ( profissional:profissional_id (id, nome, cor_agenda) )`;

type LinhaAgenda = Omit<
  AgendamentoNaAgenda,
  "sessoes_pacote" | "equipamentos" | "profissionais" | "sem_avaliacao" | "vendedor" | "regioes"
> & {
  agendamento_regiao: { regiao: { nome: string } | null }[];
  vendido_por: string | null;
  pacote: { quantidade_sessoes: number } | null;
  agendamento_equipamento: { equipamento: { id: string; nome: string } | null }[];
  agendamento_profissional: {
    profissional: { id: string; nome: string; cor_agenda: string } | null;
  }[];
};

function paraAgenda(linha: LinhaAgenda): AgendamentoNaAgenda {
  const {
    pacote,
    agendamento_equipamento,
    agendamento_profissional,
    agendamento_regiao,
    vendido_por,
    ...resto
  } = linha;
  return {
    ...resto,
    valor_avulso: resto.valor_avulso === null ? null : Number(resto.valor_avulso),
    sessoes_pacote: pacote?.quantidade_sessoes ?? null,
    sem_avaliacao: false,
    regioes: (agendamento_regiao ?? []).map((x) => x.regiao?.nome).filter((x): x is string => !!x),
    vendedor: vendido_por ? { id: vendido_por, nome: "" } : null,
    equipamentos: agendamento_equipamento
      .map((x) => x.equipamento)
      .filter((x): x is { id: string; nome: string } => x !== null),
    profissionais: agendamento_profissional
      .map((x) => x.profissional)
      .filter((x): x is { id: string; nome: string; cor_agenda: string } => x !== null),
  };
}

/** Coluna da timeline: cada recurso vira uma faixa vertical (RF-41). */
export interface ColunaRecurso {
  tipo: TipoRecurso;
  id: string;
  rotulo: string;
  subtitulo?: string;
}

/**
 * Marca quem nunca fez avaliação inicial: o comercial agenda procedimento
 * direto, e a profissional precisa saber que é a primeira vez do paciente.
 */
async function marcarSemAvaliacao(lista: AgendamentoNaAgenda[]): Promise<AgendamentoNaAgenda[]> {
  const pacientes = [...new Set(lista.map((a) => a.paciente?.id).filter((x): x is string => !!x))];
  if (pacientes.length === 0) return lista;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("agendamento")
    .select("paciente_id, procedimento:procedimento_id!inner (avaliacao)")
    .eq("procedimento.avaliacao", true)
    .eq("status", "realizado")
    .in("paciente_id", pacientes);
  const avaliados = new Set((data ?? []).map((a) => a.paciente_id));

  // Nome de quem vendeu, pela função que só expõe o nome (0043).
  const vendedores = [...new Set(lista.map((a) => a.vendedor?.id).filter((x): x is string => !!x))];
  const { data: nomes } = vendedores.length
    ? await supabase.rpc("nomes_da_equipe", { p_ids: vendedores })
    : { data: [] as { id: string; nome: string }[] };
  const nomeDe = new Map((nomes ?? []).map((n) => [n.id, n.nome]));

  return lista.map((a) => ({
    ...a,
    vendedor: a.vendedor ? { id: a.vendedor.id, nome: nomeDe.get(a.vendedor.id) ?? "equipe" } : null,
    sem_avaliacao: !!a.paciente && !a.procedimento?.avaliacao && !avaliados.has(a.paciente.id),
  }));
}

export async function agendamentosDoPeriodo(
  inicio: Date,
  fim: Date,
): Promise<AgendamentoNaAgenda[]> {
  const supabase = await createServerSupabase();

  const { data } = await supabase
    .from("agendamento")
    .select(CAMPOS_AGENDA)
    .gte("inicio", inicio.toISOString())
    .lt("inicio", fim.toISOString())
    .neq("status", "cancelado")
    .order("inicio");

  return marcarSemAvaliacao(((data ?? []) as unknown as LinhaAgenda[]).map(paraAgenda));
}

/** Todos os atendimentos do paciente, no mesmo formato da agenda (inclui cancelados). */
export async function agendamentosDoPacienteNaAgenda(
  pacienteId: string,
): Promise<AgendamentoNaAgenda[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("agendamento")
    .select(CAMPOS_AGENDA)
    .eq("paciente_id", pacienteId)
    .order("inicio", { ascending: false })
    .limit(200);
  return marcarSemAvaliacao(((data ?? []) as unknown as LinhaAgenda[]).map(paraAgenda));
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

export interface RegiaoDoProcedimento {
  procedimento_id: string;
  regiao_id: string;
  nome: string;
  valor_sessao: number | null;
  valor_parcelado: number | null;
  duracao_min: number | null;
  sessoes_padrao: number | null;
}

/**
 * Regras do catálogo que o formulário de agendamento aplica sozinho: quem é
 * habilitado em cada procedimento (RF-23a) e que aparelho ele exige (RF-44).
 */
export async function regrasDoCatalogo(): Promise<{
  habilitacoes: { profissional_id: string; procedimento_id: string }[];
  requisitos: {
    procedimento_id: string;
    recurso_tipo: string;
    recurso_id: string | null;
    modelo: string | null;
    quantidade: number;
  }[];
  /** Regiões de cada procedimento (Ultraformer: papada, pálpebras, terços…),
   * com o que a região sobrescreve do procedimento (null = herda). */
  regioes: RegiaoDoProcedimento[];
}> {
  const supabase = await createServerSupabase();
  const [h, r, g] = await Promise.all([
    supabase.from("profissional_habilitacao").select("profissional_id, procedimento_id"),
    supabase
      .from("procedimento_requisito")
      .select("procedimento_id, recurso_tipo, recurso_id, modelo, quantidade"),
    supabase
      .from("procedimento_regiao")
      .select(
        "procedimento_id, regiao_id, valor_sessao, valor_parcelado, duracao_min, sessoes_padrao, regiao:regiao_id (nome, ordem)",
      )
      .eq("ativo", true),
  ]);
  const regioes = ((g.data ?? []) as unknown as (Omit<RegiaoDoProcedimento, "nome"> & {
    regiao: { nome: string; ordem: number } | null;
  })[])
    .filter((x) => x.regiao)
    .sort((a, b) => a.regiao!.ordem - b.regiao!.ordem || a.regiao!.nome.localeCompare(b.regiao!.nome))
    .map(({ regiao, ...x }) => ({
      ...x,
      valor_sessao: x.valor_sessao === null ? null : Number(x.valor_sessao),
      valor_parcelado: x.valor_parcelado === null ? null : Number(x.valor_parcelado),
      nome: regiao!.nome,
    }));
  return { habilitacoes: h.data ?? [], requisitos: r.data ?? [], regioes };
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

/** Quantos atendimentos ainda esperam confirmação no intervalo. */
export async function contarAConfirmar(inicio: Date, fim: Date): Promise<number> {
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("agendamento")
    .select("id", { count: "exact", head: true })
    .eq("status", "agendado")
    .gte("inicio", inicio.toISOString())
    .lt("inicio", fim.toISOString());
  return count ?? 0;
}
