/**
 * Metas de venda do mês — módulo puro.
 *
 * Uma meta diz quantas vendas de um procedimento (e, se for o caso, de quais
 * regiões) o time precisa fazer por dia de atendimento. "1 pacote a cada 2
 * dias" é 0,5 por dia. O ritmo compara o que já foi vendido no mês com o
 * esperado até hoje: mínimo × dias de atendimento já corridos.
 */

export interface Meta {
  id: string;
  rotulo: string;
  procedimento_id: string;
  /** Vazio = qualquer região (ou procedimento sem região). */
  regioes: string[];
  contagem: "venda" | "pacote";
  por_dia_min: number;
  por_dia_max: number | null;
}

export interface VendaDaMeta {
  tipo: "pacote" | "avulsa";
  dia: string;
  procedimento_id: string;
  regioes: string[];
}

export type Ritmo = "acima" | "no_ritmo" | "abaixo";

export interface MetaAvaliada extends Meta {
  hoje: number;
  /** null quando hoje a clínica não abre. */
  metaHoje: { min: number; max: number } | null;
  mes: number;
  /** Mínimo esperado até hoje, inclusive. */
  esperadoAteHoje: number;
  metaMes: { min: number; max: number };
  ritmo: Ritmo;
}

export function contaNaMeta(v: VendaDaMeta, m: Meta): boolean {
  if (v.procedimento_id !== m.procedimento_id) return false;
  if (m.contagem === "pacote" && v.tipo !== "pacote") return false;
  return m.regioes.length === 0 || v.regioes.some((r) => m.regioes.includes(r));
}

const arred = (n: number) => Math.round(n * 10) / 10;

/**
 * `diasDoMes` = os dias de atendimento do mês (sem os dias em que a clínica
 * não abre), em ordem. `hoje` decide quantos já correram.
 */
export function avaliarMetas(
  metas: Meta[],
  vendas: VendaDaMeta[],
  { hoje, diasDoMes }: { hoje: string; diasDoMes: string[] },
): MetaAvaliada[] {
  const corridos = diasDoMes.filter((d) => d <= hoje).length;
  const abreHoje = diasDoMes.includes(hoje);
  return metas.map((m) => {
    const minhas = vendas.filter((v) => contaNaMeta(v, m));
    const max = m.por_dia_max ?? m.por_dia_min;
    const mes = minhas.length;
    const esperadoAteHoje = arred(m.por_dia_min * corridos);
    const ritmo: Ritmo =
      corridos === 0 || mes >= max * corridos
        ? "acima"
        : mes >= m.por_dia_min * corridos
          ? "no_ritmo"
          : "abaixo";
    return {
      ...m,
      hoje: minhas.filter((v) => v.dia === hoje).length,
      metaHoje: abreHoje ? { min: m.por_dia_min, max } : null,
      mes,
      esperadoAteHoje,
      metaMes: { min: arred(m.por_dia_min * diasDoMes.length), max: arred(max * diasDoMes.length) },
      ritmo: corridos === 0 ? "no_ritmo" : ritmo,
    };
  });
}

/** "9 por dia", "3 a 4 por dia", "1 a cada 2 dias". */
export function textoDoRitmo(min: number, max: number | null): string {
  const teto = max ?? min;
  if (teto < 1) return `1 a cada ${Math.round(1 / min)} dias`;
  const n = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1).replace(".", ","));
  return min === teto ? `${n(min)} por dia` : `${n(min)} a ${n(teto)} por dia`;
}

/**
 * Vendas de procedimentos que têm meta por região, mas chegaram sem região:
 * não contam em meta nenhuma, e a gestão precisa saber que estão faltando.
 */
export function vendasSemRegiao(metas: Meta[], vendas: VendaDaMeta[]): number {
  const porRegiao = new Set(
    metas.filter((m) => m.regioes.length > 0).map((m) => m.procedimento_id),
  );
  return vendas.filter((v) => porRegiao.has(v.procedimento_id) && v.regioes.length === 0).length;
}
