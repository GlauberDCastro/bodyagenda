/** Tipo da coluna: define a formatação no CSV e o formato numérico no XLSX. */
export type TipoColuna = "texto" | "moeda" | "numero" | "pct" | "data";

export interface Coluna {
  chave: string;
  rotulo: string;
  tipo?: TipoColuna;
}

export interface Planilha {
  titulo: string;
  colunas: Coluna[];
  linhas: Record<string, unknown>[];
}

/** Número no padrão do Excel em pt-BR: vírgula decimal, sem milhar. */
function numeroBr(v: number, casas: number): string {
  return v.toFixed(casas).replace(".", ",");
}

function celulaCsv(v: unknown, tipo: TipoColuna = "texto"): string {
  if (v === null || v === undefined || v === "") return "";
  let s: string;
  if (tipo === "moeda") s = numeroBr(Number(v), 2);
  else if (tipo === "numero") s = numeroBr(Number(v), Number.isInteger(Number(v)) ? 0 : 2);
  else if (tipo === "pct") s = numeroBr(Number(v) * 100, 1);
  else if (tipo === "data") s = String(v).slice(0, 10).split("-").reverse().join("/");
  else s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV que o Excel em português abre certo: ponto e vírgula (a vírgula é o
 * decimal), BOM para os acentos e percentual já multiplicado por 100.
 */
export function gerarCsv(p: Planilha): string {
  const cabecalho = p.colunas
    .map((c) => (c.tipo === "pct" ? `${c.rotulo} (%)` : c.rotulo))
    .map((r) => celulaCsv(r))
    .join(";");
  const corpo = p.linhas.map((l) => p.colunas.map((c) => celulaCsv(l[c.chave], c.tipo)).join(";"));
  return "﻿" + [cabecalho, ...corpo].join("\r\n");
}

/** Nome de arquivo seguro: "Recebimentos em aberto" → "recebimentos-em-aberto". */
export function nomeDeArquivo(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
