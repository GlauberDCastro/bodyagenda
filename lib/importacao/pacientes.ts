import { cpfValido, limparCpf } from "@/lib/domain/cpf";

/**
 * Importação de pacientes a partir de planilha (CSV ou Excel).
 *
 * Módulo puro: a tela usa para a prévia e o servidor usa de novo antes de
 * gravar — o que vem do navegador nunca é gravado sem passar por aqui.
 */

/** Registros por chamada ao servidor: cabe folgado no limite de corpo das server actions. */
export const LOTE_IMPORTACAO = 500;

export const CAMPOS = [
  { chave: "nome", rotulo: "Nome", obrigatorio: true },
  { chave: "cpf", rotulo: "CPF", obrigatorio: false },
  { chave: "telefone", rotulo: "Telefone", obrigatorio: false },
  { chave: "email", rotulo: "E-mail", obrigatorio: false },
  { chave: "data_nascimento", rotulo: "Nascimento", obrigatorio: false },
  { chave: "endereco", rotulo: "Endereço", obrigatorio: false },
  { chave: "observacoes", rotulo: "Observações", obrigatorio: false },
] as const;

export type Campo = (typeof CAMPOS)[number]["chave"];
/** Campo → índice da coluna na planilha (null = não importar). */
export type Mapeamento = Record<Campo, number | null>;

export interface PacienteImportado {
  /** Linha na planilha, contando o cabeçalho como 1: é o número que o Excel mostra. */
  linha: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  data_nascimento: string | null;
  endereco: string | null;
  observacoes: string | null;
}

export interface LinhaAnalisada {
  linha: number;
  dados: PacienteImportado | null;
  /** Impedem a importação da linha. */
  erros: string[];
  /** A linha entra, mas um campo foi descartado ou ajustado. */
  avisos: string[];
}

/** Como os sistemas e planilhas costumam chamar cada coluna. */
const SINONIMOS: Record<Campo, string[]> = {
  nome: ["nome", "nome completo", "paciente", "nome do paciente", "cliente", "nome do cliente"],
  cpf: ["cpf", "cpf do paciente", "documento", "cpf cnpj"],
  telefone: [
    "telefone",
    "celular",
    "whatsapp",
    "fone",
    "tel",
    "contato",
    "telefone celular",
    "cel",
  ],
  email: ["email", "e mail", "correio eletronico"],
  data_nascimento: [
    "nascimento",
    "data de nascimento",
    "data nascimento",
    "dt nasc",
    "dt nascimento",
    "aniversario",
    "data nasc",
  ],
  endereco: ["endereco", "endereco completo", "logradouro", "rua"],
  observacoes: ["observacoes", "observacao", "obs", "anotacoes", "notas"],
};

/** "Dt. Nasc." → "dt nasc": sem acento, sem pontuação, minúsculo. */
function normalizarCabecalho(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function sugerirMapeamento(cabecalho: string[]): Mapeamento {
  const normalizados = cabecalho.map(normalizarCabecalho);
  const usados = new Set<number>();
  const mapa = {} as Mapeamento;
  for (const { chave } of CAMPOS) {
    const i = normalizados.findIndex((h, idx) => !usados.has(idx) && SINONIMOS[chave].includes(h));
    mapa[chave] = i >= 0 ? i : null;
    if (i >= 0) usados.add(i);
  }
  return mapa;
}

/**
 * CSV do jeito que o Excel brasileiro salva: separador `;` (ou `,`/tab),
 * aspas para campos com separador ou quebra de linha, BOM no início.
 */
export function lerCsv(texto: string): string[][] {
  const limpo = texto.replace(/^﻿/, "");
  const primeira = limpo.split(/\r?\n/, 1)[0] ?? "";
  const separador = [";", ",", "\t"].sort(
    (a, b) => primeira.split(b).length - primeira.split(a).length,
  )[0];

  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === separador) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpo[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  // Linhas totalmente vazias (comuns no fim do arquivo) não são pacientes.
  return linhas.filter((l) => l.some((v) => v.trim() !== ""));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** dd/mm/aaaa, dd/mm/aa, aaaa-mm-dd ou número de série do Excel → "aaaa-mm-dd". */
export function lerData(valor: string, hoje = new Date()): string | null {
  const v = valor.trim();
  if (!v) return null;
  let a: number, m: number, d: number;

  const br = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (br) {
    d = Number(br[1]);
    m = Number(br[2]);
    a = Number(br[3]);
    // Ano com 2 dígitos: "88" é 1988; "05" é 2005.
    if (br[3].length === 2) a += a > hoje.getFullYear() % 100 ? 1900 : 2000;
  } else if (iso) {
    a = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else if (/^\d{4,5}(\.\d+)?$/.test(v)) {
    // Série do Excel: dias desde 30/12/1899.
    const data = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(v)) * 86_400_000);
    a = data.getUTCFullYear();
    m = data.getUTCMonth() + 1;
    d = data.getUTCDate();
  } else return null;

  const data = new Date(Date.UTC(a, m - 1, d));
  if (data.getUTCFullYear() !== a || data.getUTCMonth() !== m - 1 || data.getUTCDate() !== d) {
    return null;
  }
  if (a < 1900 || data > hoje) return null;
  return `${a}-${pad(m)}-${pad(d)}`;
}

/** Celular/fixo com DDD → "(11) 98765-4321". Fora disso, mantém como veio. */
export function formatarTelefone(valor: string): string {
  let d = valor.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor.trim();
}

const vazio = (v: string | undefined) => (v ?? "").trim() === "";

export function analisarLinha(
  celulas: string[],
  mapa: Mapeamento,
  linha: number,
  hoje = new Date(),
): LinhaAnalisada {
  const valor = (c: Campo) => (mapa[c] === null ? "" : (celulas[mapa[c]!] ?? "").trim());
  const erros: string[] = [];
  const avisos: string[] = [];

  const nome = valor("nome").replace(/\s+/g, " ");
  if (nome.length < 2) erros.push("Sem nome");

  let cpf: string | null = null;
  if (!vazio(valor("cpf"))) {
    let d = limparCpf(valor("cpf"));
    // O Excel guarda CPF como número e come os zeros à esquerda.
    if (d.length >= 9 && d.length < 11) d = d.padStart(11, "0");
    if (cpfValido(d)) cpf = d;
    else erros.push(`CPF inválido (${valor("cpf")})`);
  }

  const telefoneBruto = valor("telefone");
  const telefone = vazio(telefoneBruto) ? null : formatarTelefone(telefoneBruto);
  if (telefone && !/^\(\d{2}\)/.test(telefone)) avisos.push("Telefone sem DDD ou incompleto");

  let email: string | null = valor("email").toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    avisos.push(`E-mail descartado (${email})`);
    email = null;
  }

  let data_nascimento: string | null = null;
  if (!vazio(valor("data_nascimento"))) {
    data_nascimento = lerData(valor("data_nascimento"), hoje);
    if (!data_nascimento) avisos.push(`Nascimento descartado (${valor("data_nascimento")})`);
  }

  return {
    linha,
    erros,
    avisos,
    dados:
      erros.length > 0
        ? null
        : {
            linha,
            nome,
            cpf,
            telefone,
            email,
            data_nascimento,
            endereco: valor("endereco") || null,
            observacoes: valor("observacoes") || null,
          },
  };
}

/** Mesma pessoa sem CPF: mesmo nome (sem acento/caixa) e mesmo nascimento. */
export function chaveHomonimo(nome: string, nascimento: string | null): string | null {
  return nascimento ? `${normalizarCabecalho(nome)}|${nascimento}` : null;
}

/**
 * Mesma pessoa repetida na planilha: a primeira ocorrência entra, as demais
 * são puladas. Por CPF; sem CPF, por nome + nascimento. Linha → motivo.
 */
export function repetidosNaPlanilha(registros: PacienteImportado[]): Map<number, string> {
  const porCpf = new Map<string, number>();
  const porChave = new Map<string, number>();
  const repetidos = new Map<number, string>();
  for (const r of registros) {
    const chave = chaveHomonimo(r.nome, r.data_nascimento);
    const anterior = (r.cpf && porCpf.get(r.cpf)) || (chave && porChave.get(chave));
    if (anterior) {
      repetidos.set(r.linha, `Repete a linha ${anterior} da planilha`);
      continue;
    }
    if (r.cpf) porCpf.set(r.cpf, r.linha);
    if (chave) porChave.set(chave, r.linha);
  }
  return repetidos;
}
