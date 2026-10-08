import { describe, expect, it } from "vitest";
import {
  dataBr,
  dividirValor,
  ehRetorno,
  lerRelatorioDePlanos,
  numeroBr,
  sugerirServico,
} from "@/lib/importacao/vendas";

const CAB_PLANO = [
  "ID.",
  "Plano",
  "Cliente",
  "Pagador",
  "Status",
  "Dt. Venda",
  "Validade",
  "Valor (R$)",
  "Desconto",
  "Valor Final (R$)",
  "Tipo",
  "Avaliação",
  "Origem",
  "Campanha",
  "Vendedor",
  "Vendedor Auxiliar",
  "Indicação",
  "Observação",
  "Forma Pgto.",
];
const CAB_SERVICO = ["", "Id", "Serviço", "", "", "", "", "Sessões", "Restantes", "Agendados"];
const plano = (id: string, cliente: string, valor: string, vendedor: string) => [
  id,
  "Plano Personalizado",
  cliente,
  cliente,
  "Aprovado",
  "05/10/2026",
  "05/08/2027",
  valor,
  "0,00",
  valor,
  "Personalizado ",
  "---",
  "Presencial",
  "",
  `${vendedor} `,
  "Ana Auxiliar ",
  "",
  "Pago no pix\nconferido",
  "pix / transferencia",
];
const servico = (id: string, nome: string, s: string, r: string, a: string) => [
  "",
  id,
  nome,
  "",
  "",
  "",
  "",
  s,
  r,
  a,
];

// Como o .xls chega depois da leitura (linhas vazias já descartadas).
const RELATORIO = [
  ["Relatório de Planos"],
  CAB_PLANO,
  plano("409714370", "Paciente Um", "1.390,00", "Vendedora A"),
  CAB_SERVICO,
  servico(
    "56276748",
    "Ultraformer MPT - Terço Inferior Face (1 sessao) OCTOBER FEST à vista",
    "1",
    "1",
    "0",
  ),
  CAB_PLANO,
  plano("409713500", "Paciente Dois", "1.175,30", "Vendedora B"),
  CAB_SERVICO,
  servico("1", "Retorno - Toxina ", "1", "1", "0"),
  servico("2", "Toxina botulínica - 50 UI OCTOBER FEST- parcelado", "1", "0", "1"),
  ["", "", "", "", "", "", "", "", "Valor Total dos Planos", "R$ 2.565,30"],
];

const CATALOGO = [
  { id: "ultra", nome: "Ultraformer MPT", valor_sessao: 799 },
  { id: "tox", nome: "Toxina Botulínica 50 UI", valor_sessao: 799 },
  { id: "ret", nome: "Retorno de toxina", valor_sessao: 0 },
  { id: "intimo", nome: "Fotona Íntimo + PRP", valor_sessao: 0 },
  { id: "fotona", nome: "Fotona 1D", valor_sessao: 999 },
  { id: "melasma", nome: "Fotona Melasma", valor_sessao: 999 },
  { id: "cm", nome: "CM Slim", valor_sessao: 99.88 },
  { id: "onda", nome: "Onda Coolwaves", valor_sessao: 99.88 },
  { id: "dep", nome: "Depilação a laser", valor_sessao: 0 },
  { id: "quantum", nome: "Quantum", valor_sessao: 0 },
];
const REGIOES = [
  { procedimento_id: "ultra", regiao_id: "inf", nome: "Terço inferior" },
  { procedimento_id: "ultra", regiao_id: "sup", nome: "Terço superior" },
  { procedimento_id: "ultra", regiao_id: "palp-sup", nome: "Pálpebra superior" },
  { procedimento_id: "dep", regiao_id: "axilas", nome: "Axilas" },
];

describe("lerRelatorioDePlanos", () => {
  it("lê planos e serviços em blocos", () => {
    const { planos, erro } = lerRelatorioDePlanos(RELATORIO);
    expect(erro).toBeUndefined();
    expect(planos).toHaveLength(2);
    expect(planos[0]).toMatchObject({
      linha: 3,
      idExterno: "409714370",
      cliente: "Paciente Um",
      status: "Aprovado",
      dataVenda: "2026-10-05",
      validade: "2027-08-05",
      valorFinal: 1390,
      vendedor: "Vendedora A",
      vendedorAuxiliar: "Ana Auxiliar",
      forma: "pix / transferencia",
      observacao: "Pago no pix conferido",
    });
    expect(planos[1].servicos).toEqual([
      {
        idExterno: "1",
        nome: "Retorno - Toxina",
        sessoes: 1,
        restantes: 1,
        agendados: 0,
        feitas: 0,
      },
      expect.objectContaining({ idExterno: "2", sessoes: 1, agendados: 1, feitas: 0 }),
    ]);
  });

  it("conta as sessões já feitas", () => {
    const { planos } = lerRelatorioDePlanos([
      CAB_PLANO,
      plano("9", "X", "100,00", "V"),
      CAB_SERVICO,
      servico("1", "CMSlim", "8", "3", "1"),
    ]);
    expect(planos[0].servicos[0].feitas).toBe(4);
  });

  it("recusa arquivo que não é o relatório", () => {
    expect(
      lerRelatorioDePlanos([
        ["Nome", "CPF"],
        ["Maria", "1"],
      ]).erro,
    ).toMatch(/Relatório de Planos/);
  });
});

describe("sugerirServico", () => {
  const s = (nome: string) => sugerirServico(nome, CATALOGO, REGIOES);
  it("liga o nome do sistema anterior ao procedimento e à região", () => {
    expect(s("Ultraformer MPT - Terço Inferior Face (1 sessao) OCTOBER FEST à vista")).toEqual({
      procedimento_id: "ultra",
      regiao_id: "inf",
    });
    expect(
      s("Ultraformer MPT - Pálpebra Superior ( 1 sessao) OCTOBER FEST à vista").regiao_id,
    ).toBe("palp-sup");
    expect(s("Depilação a laser Axilas - pacote de 10 sessões - 2024")).toEqual({
      procedimento_id: "dep",
      regiao_id: "axilas",
    });
  });
  it("específico antes do genérico", () => {
    expect(s("Retorno - Toxina ").procedimento_id).toBe("ret");
    expect(s("Toxina botulínica - 50 UI OCTOBER FEST- parcelado").procedimento_id).toBe("tox");
    expect(s("Fotona Intimo - 01 sessão de rejuvenescimento + PRP").procedimento_id).toBe("intimo");
    expect(s("Laser Fotona Melasma( 1 sessao) OCTOBER FEST à vista").procedimento_id).toBe(
      "melasma",
    );
    expect(s("Cmslim 8 sessões OCTOBER FEST parcelado").procedimento_id).toBe("cm");
    expect(s("CMSlim - a vista").procedimento_id).toBe("cm");
    expect(s("Onda Coolwaves 8 sessões").procedimento_id).toBe("onda");
    expect(s("Quantum Braços").procedimento_id).toBe("quantum");
  });
  it("sem correspondência fica para escolher na tela", () => {
    expect(s("Massagem modeladora")).toEqual({ procedimento_id: null, regiao_id: null });
  });
});

describe("dividirValor", () => {
  const it_ = (preco: number, sessoes = 1, retorno = false) => ({ preco, sessoes, retorno });
  it("um serviço leva o total", () => {
    expect(dividirValor(1008, [it_(99.88, 8)])).toEqual([1008]);
  });
  it("retorno fica com zero", () => {
    expect(dividirValor(1175.3, [it_(0, 1, true), it_(799)])).toEqual([0, 1175.3]);
  });
  it("proporcional ao preço de tabela", () => {
    expect(dividirValor(2780, [it_(799), it_(799)])).toEqual([1390, 1390]);
  });
  it("sem preço divide o que sobra da tabela", () => {
    expect(dividirValor(7165, [it_(0, 2), it_(799), it_(0, 1, true)])).toEqual([6366, 799, 0]);
  });
  it("centavos fecham o total", () => {
    const v = dividirValor(100, [it_(10), it_(10), it_(10)]);
    expect(v.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
  });
});

describe("conversões", () => {
  it("número e data no formato brasileiro", () => {
    expect(numeroBr("1.390,00")).toBe(1390);
    expect(numeroBr("R$ 39.981,88")).toBe(39981.88);
    expect(numeroBr("")).toBeNull();
    expect(dataBr("5/10/2026")).toBe("2026-10-05");
    expect(dataBr("---")).toBeNull();
    expect(ehRetorno("Retorno - Toxina")).toBe(true);
  });
});
