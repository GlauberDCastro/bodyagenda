import { createServerSupabase } from "@/lib/supabase/server";
import type { TipoRecurso } from "@/lib/types/database";

export interface LinhaPainel {
  recurso_id: string;
  nome: string;
  agrupador: string;
  capacidade_h: number;
  agendadas_h: number;
  realizadas_h: number;
  taxa_agendada: number | null;
  taxa_efetiva: number | null;
  ociosidade_h: number;
  atendimentos: number;
  faltas: number;
  receita: number;
  receita_por_hora: number | null;
}

export interface Periodo {
  inicio: Date;
  fim: Date;
  rotulo: string;
}

const TZ = "America/Sao_Paulo";

/** "Hoje" no fuso da clínica, não no do servidor. */
export function hojeNaClinica(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

function instante(dia: string, fimDoDia = false): Date {
  return new Date(`${dia}T${fimDoDia ? "23:59:59" : "00:00:00"}-03:00`);
}

/**
 * Períodos nomeados. O intervalo vive na URL, então qualquer visão do painel
 * é compartilhável por link (RF-72).
 */
export function resolverPeriodo(de?: string, ate?: string): Periodo {
  const hoje = hojeNaClinica();

  if (de && ate) {
    return { inicio: instante(de), fim: instante(ate, true), rotulo: `${de} a ${ate}` };
  }

  const agora = new Date(`${hoje}T12:00:00-03:00`);
  const primeiroDoMes = new Date(agora);
  primeiroDoMes.setDate(1);

  return {
    inicio: instante(new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(primeiroDoMes)),
    fim: instante(hoje, true),
    rotulo: "Mês corrente",
  };
}

export async function carregarPainel(
  tipo: TipoRecurso,
  periodo: Periodo,
): Promise<{ linhas: LinhaPainel[]; semSchema: boolean }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("painel_ocupacao", {
    p_tipo: tipo,
    p_inicio: periodo.inicio.toISOString(),
    p_fim: periodo.fim.toISOString(),
  });

  if (error) {
    return { linhas: [], semSchema: error.code === "PGRST202" || error.code === "PGRST205" };
  }
  return { linhas: (data ?? []) as LinhaPainel[], semSchema: false };
}

export interface Consolidado {
  capacidade: number;
  agendadas: number;
  realizadas: number;
  ociosidade: number;
  receita: number;
  atendimentos: number;
  faltas: number;
  taxaAgendada: number | null;
  taxaEfetiva: number | null;
  taxaNoShow: number | null;
  receitaPorHora: number | null;
}

/**
 * Consolida o painel. As taxas são recalculadas sobre os totais, nunca pela
 * média das taxas individuais: média de percentuais ignora que recursos têm
 * capacidades diferentes e distorce o número.
 */
export function consolidar(linhas: LinhaPainel[]): Consolidado {
  const soma = (f: (l: LinhaPainel) => number) => linhas.reduce((t, l) => t + f(l), 0);

  const capacidade = soma((l) => Number(l.capacidade_h));
  const agendadas = soma((l) => Number(l.agendadas_h));
  const realizadas = soma((l) => Number(l.realizadas_h));
  const receita = soma((l) => Number(l.receita));
  const atendimentos = soma((l) => l.atendimentos);
  const faltas = soma((l) => l.faltas);

  return {
    capacidade,
    agendadas,
    realizadas,
    ociosidade: Math.max(0, capacidade - realizadas),
    receita,
    atendimentos,
    faltas,
    taxaAgendada: capacidade > 0 ? agendadas / capacidade : null,
    taxaEfetiva: capacidade > 0 ? realizadas / capacidade : null,
    taxaNoShow: atendimentos + faltas > 0 ? faltas / (atendimentos + faltas) : null,
    receitaPorHora: capacidade > 0 ? receita / capacidade : null,
  };
}

export interface CelulaCalor {
  dia_semana: number;
  hora: number;
  atendimentos: number;
  horas: number;
}

export async function mapaDeCalor(tipo: TipoRecurso, periodo: Periodo): Promise<CelulaCalor[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("mapa_calor_ocupacao", {
    p_tipo: tipo,
    p_inicio: periodo.inicio.toISOString(),
    p_fim: periodo.fim.toISOString(),
  });
  return (data ?? []) as CelulaCalor[];
}

export interface Gargalo {
  modelo: string;
  unidades: number;
  procedimentos: number;
  taxa_media: number;
  horas_livres: number;
}

/** RF-78 · modelos que atendem vários procedimentos e estão saturados. */
export async function gargalos(periodo: Periodo, limiar = 0.75): Promise<Gargalo[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("gargalos_equipamento", {
    p_inicio: periodo.inicio.toISOString(),
    p_fim: periodo.fim.toISOString(),
    p_limiar: limiar,
  });
  return (data ?? []) as Gargalo[];
}
