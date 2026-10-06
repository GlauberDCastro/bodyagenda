/**
 * Vendas da Central de Gestão — módulo puro.
 *
 * O banco devolve uma linha por venda (pacote ou sessão avulsa); aqui saem os
 * totais, a divisão por canal, o ranking de quem vende e a série por dia.
 */

export type Canal = "comercial" | "clinica" | "recepcao";

export const ROTULO_CANAL: Record<Canal, string> = {
  comercial: "Comercial (SDR e closer)",
  clinica: "Clínica (upsell e doutoras)",
  recepcao: "Recepção",
};

export interface Venda {
  tipo: "pacote" | "avulsa";
  id: string;
  dia: string;
  valor: number;
  paciente_id: string;
  paciente_nome: string;
  procedimento_id: string;
  procedimento_nome: string;
  /** Regiões vendidas (vazio = sem região informada). */
  regioes: string[];
  vendedor_id: string | null;
  vendedor_nome: string | null;
  vendedor_perfil: string | null;
  canal: Canal;
}

export interface LinhaCanal {
  canal: Canal;
  valor: number;
  quantidade: number;
  /** Fatia do valor total vendido (0–1). */
  participacao: number;
}

export interface LinhaVendedor {
  id: string | null;
  nome: string;
  perfil: string | null;
  valor: number;
  quantidade: number;
  pacotes: number;
  avulsas: number;
  ticket: number;
}

export interface ResumoVendas {
  total: number;
  quantidade: number;
  ticket: number | null;
  porCanal: LinhaCanal[];
  porVendedor: LinhaVendedor[];
  /** Valor vendido em cada dia do período, inclusive os dias sem venda. */
  porDia: { dia: string; valor: number }[];
}

const CANAIS: Canal[] = ["comercial", "clinica", "recepcao"];

function diasEntre(de: string, ate: string): string[] {
  const dias: string[] = [];
  for (let d = new Date(`${de}T12:00:00Z`); d <= new Date(`${ate}T12:00:00Z`);) {
    dias.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86_400_000);
  }
  return dias;
}

export function resumirVendas(vendas: Venda[], de: string, ate: string): ResumoVendas {
  const total = vendas.reduce((t, v) => t + v.valor, 0);

  const porCanal = CANAIS.map((canal) => {
    const doCanal = vendas.filter((v) => v.canal === canal);
    const valor = doCanal.reduce((t, v) => t + v.valor, 0);
    return {
      canal,
      valor,
      quantidade: doCanal.length,
      participacao: total > 0 ? valor / total : 0,
    };
  });

  const mapa = new Map<string, LinhaVendedor>();
  for (const v of vendas) {
    const chave = v.vendedor_id ?? "sem-vendedor";
    const linha = mapa.get(chave) ?? {
      id: v.vendedor_id,
      nome: v.vendedor_nome ?? "Sem vendedor registrado",
      perfil: v.vendedor_perfil,
      valor: 0,
      quantidade: 0,
      pacotes: 0,
      avulsas: 0,
      ticket: 0,
    };
    linha.valor += v.valor;
    linha.quantidade += 1;
    if (v.tipo === "pacote") linha.pacotes += 1;
    else linha.avulsas += 1;
    mapa.set(chave, linha);
  }
  const porVendedor = [...mapa.values()]
    .map((l) => ({ ...l, ticket: l.valor / l.quantidade }))
    .sort((a, b) => b.valor - a.valor || b.quantidade - a.quantidade);

  const porDiaMapa = new Map(diasEntre(de, ate).map((d) => [d, 0]));
  for (const v of vendas) {
    if (porDiaMapa.has(v.dia)) porDiaMapa.set(v.dia, porDiaMapa.get(v.dia)! + v.valor);
  }

  return {
    total,
    quantidade: vendas.length,
    ticket: vendas.length > 0 ? total / vendas.length : null,
    porCanal,
    porVendedor,
    porDia: [...porDiaMapa].map(([dia, valor]) => ({ dia, valor })),
  };
}
