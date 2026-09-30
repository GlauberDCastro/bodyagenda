import { createServerSupabase } from "@/lib/supabase/server";

export interface Rentabilidade {
  procedimento_id: string;
  nome: string;
  sessoes: number;
  horas: number;
  receita: number;
  custo_direto: number;
  comissao: number;
  margem: number;
  margem_pct: number | null;
  margem_por_hora: number | null;
}

export interface PassivoEntrega {
  procedimento_id: string;
  nome: string;
  pacotes: number;
  sessoes_devidas: number;
  horas_devidas: number;
  valor_devido: number;
}

export interface Dre {
  receita_realizada: number;
  custos_diretos: number;
  comissoes: number;
  margem_contrib: number;
  despesas_fixas: number;
  resultado: number;
  custo_hora_estr: number | null;
}

export interface LinhaComissao {
  id: string;
  valor: number;
  base_calculo: number;
  percentual: number | null;
  status: string;
  competencia: string;
  profissional: { id: string; nome: string } | null;
  agendamento: { inicio: string; procedimento: { nome: string } | null } | null;
}

export interface LinhaReceber {
  id: string;
  descricao: string | null;
  categoria: string | null;
  valor: number;
  vencimento: string;
  data_pagamento: string | null;
  status: string;
  parcela_num: number | null;
  parcela_total: number | null;
}

export function competenciaAtual(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
}

export async function rentabilidade(inicio: Date, fim: Date): Promise<Rentabilidade[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("rentabilidade_procedimentos", {
    p_inicio: inicio.toISOString(),
    p_fim: fim.toISOString(),
  });
  return (data ?? []) as Rentabilidade[];
}

export async function passivoEntrega(): Promise<PassivoEntrega[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("passivo_entrega");
  return (data ?? []) as PassivoEntrega[];
}

export async function dre(competencia: string): Promise<Dre | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("dre_competencia", { p_competencia: competencia });
  const linhas = (data ?? []) as Dre[];
  return linhas[0] ?? null;
}

export async function comissoesDaCompetencia(competencia: string): Promise<LinhaComissao[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("comissao")
    .select(
      `id, valor, base_calculo, percentual, status, competencia,
       profissional:profissional_id (id, nome),
       agendamento:agendamento_id (inicio, procedimento:procedimento_id (nome))`,
    )
    .eq("competencia", competencia)
    .order("valor", { ascending: false });
  return (data ?? []) as unknown as LinhaComissao[];
}

/**
 * RF-97 · contas a receber com aging.
 *
 * Marca `atrasado` na leitura em vez de depender de um job diário: lançamento
 * vencido ontem precisa aparecer como atrasado hoje, sem esperar rotina.
 */
export async function contasAReceber(): Promise<{
  linhas: (LinhaReceber & { atrasadoDias: number })[];
  aging: { faixa: string; valor: number; qtd: number }[];
}> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("lancamento")
    .select("*")
    .eq("tipo", "receita")
    .in("status", ["pendente", "atrasado"])
    .order("vencimento");

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const linhas = ((data ?? []) as LinhaReceber[]).map((l) => {
    const venc = new Date(`${l.vencimento}T00:00:00-03:00`);
    const dias = Math.floor((hoje.getTime() - venc.getTime()) / 86_400_000);
    return { ...l, atrasadoDias: Math.max(0, dias) };
  });

  const faixas = [
    { faixa: "A vencer", teste: (d: number) => d <= 0 },
    { faixa: "1–30 dias", teste: (d: number) => d >= 1 && d <= 30 },
    { faixa: "31–60 dias", teste: (d: number) => d >= 31 && d <= 60 },
    { faixa: "60+ dias", teste: (d: number) => d > 60 },
  ];

  const aging = faixas.map((f) => {
    const dela = linhas.filter((l) => f.teste(l.atrasadoDias));
    return {
      faixa: f.faixa,
      valor: dela.reduce((t, l) => t + Number(l.valor), 0),
      qtd: dela.length,
    };
  });

  return { linhas, aging };
}

export async function despesasDaCompetencia(competencia: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("despesa_fixa")
    .select("*")
    .eq("competencia", competencia)
    .order("valor", { ascending: false });
  return data ?? [];
}

/** Converte qualquer conjunto de linhas em CSV com separador brasileiro. */
export function paraCsv(
  colunas: { chave: string; rotulo: string }[],
  linhas: Record<string, unknown>[],
): string {
  const escapar = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Ponto e vírgula porque o Excel em pt-BR usa vírgula como decimal.
  return [
    colunas.map((c) => escapar(c.rotulo)).join(";"),
    ...linhas.map((l) => colunas.map((c) => escapar(l[c.chave])).join(";")),
  ].join("\n");
}
