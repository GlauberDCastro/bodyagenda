/**
 * Importação de vendas do sistema anterior ("Relatório de Planos", .xls).
 *
 * O relatório vem em blocos: cabeçalho do plano ("ID.", "Plano", "Cliente"…),
 * a linha do plano, cabeçalho dos serviços ("Id", "Serviço", "Sessões"…) e
 * uma linha por serviço. Cada serviço vira um pacote aqui.
 *
 * Módulo puro: a tela usa para a prévia e o servidor usa de novo antes de gravar.
 */

export interface ServicoDoPlano {
  idExterno: string;
  nome: string;
  sessoes: number;
  restantes: number;
  agendados: number;
  /** Já realizadas no sistema anterior. */
  feitas: number;
}

export interface PlanoImportado {
  /** Linha do plano no arquivo (1 = primeira linha com conteúdo). */
  linha: number;
  idExterno: string;
  cliente: string;
  pagador: string;
  status: string;
  dataVenda: string | null;
  validade: string | null;
  valorFinal: number | null;
  vendedor: string;
  vendedorAuxiliar: string;
  forma: string;
  observacao: string;
  servicos: ServicoDoPlano[];
}

export const sem = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const limpo = (t: string | undefined) => (t ?? "").replace(/\s+/g, " ").trim();

/** "1.390,00" → 1390; "R$ 799" → 799. */
export function numeroBr(t: string): number | null {
  const s = t.replace(/[R$\s]/g, "");
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
}

/** "05/10/2026" → "2026-10-05". */
export function dataBr(t: string): string | null {
  const m = t.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mes, a] = m;
  const iso = `${a}-${mes.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

function indices(linha: string[]) {
  const mapa = new Map<string, number>();
  linha.forEach((c, i) => {
    const k = sem(c);
    if (k && !mapa.has(k)) mapa.set(k, i);
  });
  return mapa;
}

const ehCabecalhoPlano = (l: string[]) => {
  const k = l.map(sem);
  return k.includes("id") && k.includes("plano") && k.includes("cliente");
};
const ehCabecalhoServico = (l: string[]) => {
  const k = l.map(sem);
  return k.includes("servico") && k.includes("sessoes");
};

/** Lê o relatório. Devolve erro se o arquivo não tem o formato esperado. */
export function lerRelatorioDePlanos(linhas: string[][]): {
  planos: PlanoImportado[];
  erro?: string;
} {
  const planos: PlanoImportado[] = [];
  let colPlano: Map<string, number> | null = null;
  let colServico: Map<string, number> | null = null;
  let modo: "plano" | "servico" | null = null;
  let atual: PlanoImportado | null = null;

  linhas.forEach((l, i) => {
    if (l.every((c) => !limpo(c))) return;
    if (ehCabecalhoPlano(l)) {
      colPlano = indices(l);
      modo = "plano";
      return;
    }
    if (ehCabecalhoServico(l)) {
      colServico = indices(l);
      modo = "servico";
      return;
    }
    const cel = (cols: Map<string, number>, nome: string) => limpo(l[cols.get(nome) ?? -1]);
    if (modo === "plano" && colPlano) {
      const c = colPlano;
      atual = {
        linha: i + 1,
        idExterno: cel(c, "id"),
        cliente: cel(c, "cliente"),
        pagador: cel(c, "pagador"),
        status: cel(c, "status"),
        dataVenda: dataBr(cel(c, "dt venda")),
        validade: dataBr(cel(c, "validade")),
        valorFinal: numeroBr(cel(c, "valor final r")),
        vendedor: cel(c, "vendedor"),
        vendedorAuxiliar: cel(c, "vendedor auxiliar"),
        forma: cel(c, "forma pgto"),
        observacao: limpo(l[c.get("observacao") ?? -1]),
        servicos: [],
      };
      planos.push(atual);
      modo = null;
      return;
    }
    if (modo === "servico" && colServico && atual) {
      const c = colServico;
      const nome = cel(c, "servico");
      if (!nome) return;
      const sessoes = numeroBr(cel(c, "sessoes")) ?? 0;
      const restantes = numeroBr(cel(c, "restantes")) ?? 0;
      const agendados = numeroBr(cel(c, "agendados")) ?? 0;
      atual.servicos.push({
        idExterno: cel(c, "id"),
        nome,
        sessoes,
        restantes,
        agendados,
        feitas: Math.max(0, sessoes - restantes - agendados),
      });
    }
  });

  if (planos.length === 0) {
    return {
      planos,
      erro: "Não encontrei planos neste arquivo. Use o “Relatório de Planos” exportado do sistema anterior.",
    };
  }
  return { planos };
}

/** Chave da venda no sistema anterior: plano + serviço. */
export const chaveDaVenda = (plano: PlanoImportado, s: ServicoDoPlano) =>
  `plano:${plano.idExterno}:servico:${s.idExterno}`;

export interface ProcedimentoDoCatalogo {
  id: string;
  nome: string;
  valor_sessao: number;
}
export interface RegiaoDoCatalogo {
  procedimento_id: string;
  regiao_id: string;
  nome: string;
}

/**
 * Como o sistema anterior escreve cada procedimento. A ordem importa: o
 * específico antes do genérico ("fotona intimo" antes de "fotona").
 */
const APELIDOS: [RegExp, string][] = [
  [/\bretorno\b.*\btoxina\b|\btoxina\b.*\bretorno\b/, "Retorno de toxina"],
  [/\btoxina\b|\bbotox\b/, "Toxina Botulínica 50 UI"],
  [/\bultraformer\b/, "Ultraformer MPT"],
  [/\bfotona intimo\b/, "Fotona Íntimo + PRP"],
  [/\bmelasma\b/, "Fotona Melasma"],
  [/\bcm ?slim\b|\bcmslim\b/, "CM Slim"],
  [/\bonda\b/, "Onda Coolwaves"],
  [/\bdepilacao\b/, "Depilação a laser"],
  [/\bquantum\b/, "Quantum"],
  [/\bscizer\b/, "Scizer"],
  [/\bsculptra\b/, "Sculptra"],
  [/\btricologia\b|\bcapilar\b/, "Tricologia"],
  [/\bpreenchimento\b|\bpreenchedor/, "Preenchedores"],
  [/\bfotona\b/, "Fotona 1D"],
];

/** Procedimento e região sugeridos para o nome do serviço no sistema anterior. */
export function sugerirServico(
  nome: string,
  catalogo: ProcedimentoDoCatalogo[],
  regioes: RegiaoDoCatalogo[],
): { procedimento_id: string | null; regiao_id: string | null } {
  const alvo = sem(nome);
  const porNome = new Map(catalogo.map((p) => [sem(p.nome), p]));
  let proc: ProcedimentoDoCatalogo | undefined;
  for (const [re, nomeCatalogo] of APELIDOS) {
    if (re.test(alvo)) {
      proc = porNome.get(sem(nomeCatalogo));
      if (proc) break;
    }
  }
  // Sem apelido: o procedimento cujo nome aparece no serviço (o mais longo).
  proc ??= catalogo
    .filter((p) => alvo.includes(sem(p.nome)))
    .sort((a, b) => b.nome.length - a.nome.length)[0];
  if (!proc) return { procedimento_id: null, regiao_id: null };

  const regiao = regioes
    .filter((r) => r.procedimento_id === proc.id && alvo.includes(sem(r.nome)))
    .sort((a, b) => b.nome.length - a.nome.length)[0];
  return { procedimento_id: proc.id, regiao_id: regiao?.regiao_id ?? null };
}

/** Retorno é cortesia da venda original: entra sem valor. */
export const ehRetorno = (nome: string) => /\bretorno\b/.test(sem(nome));

/**
 * Divide o valor do plano entre os serviços. Um serviço só: leva tudo.
 * Vários: retorno fica com zero; quem tem preço de tabela recebe na
 * proporção do preço × sessões; quem não tem preço divide o que sobra.
 * Centavos que não dividem vão no último.
 */
export function dividirValor(
  total: number,
  itens: { preco: number; sessoes: number; retorno: boolean }[],
): number[] {
  if (itens.length === 0) return [];
  if (itens.length === 1) return [total];
  const pagos = itens.map((it, i) => ({ ...it, i })).filter((it) => !it.retorno);
  const valores = itens.map(() => 0);
  if (pagos.length === 0) return valores;

  const base = (it: { preco: number; sessoes: number }) => it.preco * Math.max(1, it.sessoes);
  const comPreco = pagos.filter((it) => it.preco > 0);
  const semPreco = pagos.filter((it) => it.preco <= 0);
  const somaBase = comPreco.reduce((t, it) => t + base(it), 0);

  const centavos = (v: number) => Math.round(v * 100) / 100;
  if (semPreco.length === 0 || somaBase >= total) {
    // Todos com preço (ou a tabela já passa do total): proporcional.
    const alvo = comPreco.length ? comPreco : pagos;
    const soma = alvo.reduce((t, it) => t + (comPreco.length ? base(it) : 1), 0);
    for (const it of alvo)
      valores[it.i] = centavos((total * (comPreco.length ? base(it) : 1)) / soma);
  } else {
    for (const it of comPreco) valores[it.i] = centavos(base(it));
    const resto = total - comPreco.reduce((t, it) => t + valores[it.i], 0);
    for (const it of semPreco) valores[it.i] = centavos(resto / semPreco.length);
  }
  const diferenca = centavos(total - valores.reduce((t, v) => t + v, 0));
  const ultimo = [...pagos].reverse().find((it) => valores[it.i] > 0) ?? pagos[pagos.length - 1];
  valores[ultimo.i] = centavos(valores[ultimo.i] + diferenca);
  return valores;
}
