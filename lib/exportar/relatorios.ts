import { carregarPainel, resolverPeriodo } from "@/lib/consultas/painel";
import {
  comissoesDetalhadas,
  competenciaAtual,
  despesasDaCompetencia,
  dre,
  passivoEntrega,
  rentabilidade,
} from "@/lib/consultas/financeiro";
import {
  faltasECancelamentos,
  janelasVagas,
  listarAtendimentos,
  pacotesPendentes,
  retornoEquipamentos,
} from "@/lib/consultas/relatorios";
import { cobrancas, diasDeAtraso, emAberto, receitaPorForma } from "@/lib/consultas/caixa";
import type { StatusAgendamento, TipoRecurso } from "@/lib/types/database";
import type { Planilha } from "./formato";
import { vendasDoPeriodo } from "@/lib/consultas/gestao";
import { perfilDoUsuario } from "@/lib/consultas/recursos";
import { ROTULO_CANAL } from "@/lib/domain/vendas";

/**
 * RF-102 · todo relatório exporta para CSV e XLSX.
 *
 * Cada entrada usa a MESMA consulta da tela, pela sessão de quem exporta: o
 * RLS que decide o que a pessoa vê na tela decide o que ela leva no arquivo.
 */
type Gerador = (p: URLSearchParams) => Promise<Planilha>;

const tipoDe = (p: URLSearchParams): TipoRecurso => {
  const pedido = p.get("por") ?? p.get("tipo");
  return (["sala", "equipamento", "profissional"] as const).find((t) => t === pedido) ?? "sala";
};
const periodoDe = (p: URLSearchParams) =>
  resolverPeriodo(p.get("de") ?? undefined, p.get("ate") ?? undefined);
const diaLocal = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const dataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));

export const RELATORIOS: Record<string, Gerador> = {
  atendimentos: async (p) => {
    const periodo = periodoDe(p);
    const lista = await listarAtendimentos({
      inicio: periodo.inicio,
      fim: periodo.fim,
      status: p.get("status")?.split(",") as StatusAgendamento[] | undefined,
      tipo: (p.get("tipo") as TipoRecurso) ?? undefined,
      recursoId: p.get("recurso") ?? undefined,
    });
    return {
      titulo: `Atendimentos ${periodo.de} a ${periodo.ate}`,
      colunas: [
        { chave: "quando", rotulo: "Quando" },
        { chave: "paciente", rotulo: "Paciente" },
        { chave: "procedimento", rotulo: "Procedimento" },
        { chave: "sala", rotulo: "Sala" },
        { chave: "profissionais", rotulo: "Profissionais" },
        { chave: "status", rotulo: "Status" },
        { chave: "valor", rotulo: "Valor avulso", tipo: "moeda" },
      ],
      linhas: lista.map((a) => ({
        quando: dataHora(a.inicio),
        paciente: a.paciente?.nome,
        procedimento: a.procedimento?.nome,
        sala: a.sala ? `Sala ${a.sala.numero}` : "",
        profissionais: a.profissionais.join(", "),
        status: a.status,
        valor: a.valor_avulso,
      })),
    };
  },

  ocupacao: async (p) => {
    const periodo = periodoDe(p);
    const { linhas } = await carregarPainel(tipoDe(p), periodo);
    return {
      titulo: `Ocupação por recurso ${periodo.de} a ${periodo.ate}`,
      colunas: [
        { chave: "nome", rotulo: "Recurso" },
        { chave: "agrupador", rotulo: "Grupo" },
        { chave: "capacidade_h", rotulo: "Capacidade (h)", tipo: "numero" },
        { chave: "agendadas_h", rotulo: "Agendadas (h)", tipo: "numero" },
        { chave: "realizadas_h", rotulo: "Realizadas (h)", tipo: "numero" },
        { chave: "taxa_agendada", rotulo: "Ocupação agendada", tipo: "pct" },
        { chave: "taxa_efetiva", rotulo: "Ocupação efetiva", tipo: "pct" },
        { chave: "ociosidade_h", rotulo: "Ociosas (h)", tipo: "numero" },
        { chave: "atendimentos", rotulo: "Sessões", tipo: "numero" },
        { chave: "faltas", rotulo: "Faltas", tipo: "numero" },
        { chave: "receita", rotulo: "Receita", tipo: "moeda" },
        { chave: "receita_por_hora", rotulo: "Receita por hora disponível", tipo: "moeda" },
      ],
      linhas: linhas as unknown as Record<string, unknown>[],
    };
  },

  vagas: async (p) => {
    const periodo = periodoDe(p);
    const tipo = tipoDe(p);
    const { linhas } = await carregarPainel(tipo, periodo);
    const vagas = await janelasVagas(tipo, linhas, periodo);
    return {
      titulo: `Horários vagos ${periodo.de} a ${periodo.ate}`,
      colunas: [
        { chave: "recurso", rotulo: "Recurso" },
        { chave: "de", rotulo: "De" },
        { chave: "ate", rotulo: "Até" },
        { chave: "minutos", rotulo: "Minutos", tipo: "numero" },
      ],
      linhas: vagas.map((v) => ({
        recurso: v.recurso,
        de: dataHora(v.inicio),
        ate: dataHora(v.fim),
        minutos: v.minutos,
      })),
    };
  },

  faltas: async (p) => {
    const periodo = periodoDe(p);
    const f = await faltasECancelamentos(periodo.inicio, periodo.fim);
    return {
      titulo: `Faltas e cancelamentos ${periodo.de} a ${periodo.ate}`,
      colunas: [
        { chave: "nome", rotulo: "Paciente" },
        { chave: "faltas", rotulo: "Faltas", tipo: "numero" },
        { chave: "cancelamentos", rotulo: "Cancelamentos", tipo: "numero" },
      ],
      linhas: f.ranking,
    };
  },

  rentabilidade: async (p) => {
    const periodo = periodoDe(p);
    const linhas = await rentabilidade(periodo.inicio, periodo.fim);
    return {
      titulo: `Rentabilidade por procedimento ${periodo.de} a ${periodo.ate}`,
      colunas: [
        { chave: "nome", rotulo: "Procedimento" },
        { chave: "sessoes", rotulo: "Sessões", tipo: "numero" },
        { chave: "horas", rotulo: "Horas", tipo: "numero" },
        { chave: "receita", rotulo: "Receita", tipo: "moeda" },
        { chave: "custo_direto", rotulo: "Custo direto", tipo: "moeda" },
        { chave: "comissao", rotulo: "Bonificações", tipo: "moeda" },
        { chave: "margem", rotulo: "Margem", tipo: "moeda" },
        { chave: "margem_pct", rotulo: "Margem", tipo: "pct" },
        { chave: "margem_por_hora", rotulo: "Margem por hora", tipo: "moeda" },
      ],
      linhas: linhas as unknown as Record<string, unknown>[],
    };
  },

  passivo: async () => ({
    titulo: "Passivo de entrega",
    colunas: [
      { chave: "nome", rotulo: "Procedimento" },
      { chave: "pacotes", rotulo: "Pacotes", tipo: "numero" },
      { chave: "sessoes_devidas", rotulo: "Sessões devidas", tipo: "numero" },
      { chave: "horas_devidas", rotulo: "Horas", tipo: "numero" },
      { chave: "valor_devido", rotulo: "Valor devido", tipo: "moeda" },
    ],
    linhas: (await passivoEntrega()) as unknown as Record<string, unknown>[],
  }),

  "pacotes-pendentes": async () => ({
    titulo: "Pacotes com sessões a entregar",
    colunas: [
      { chave: "paciente", rotulo: "Paciente" },
      { chave: "procedimento", rotulo: "Procedimento" },
      { chave: "sessoes", rotulo: "Sessões", tipo: "numero" },
      { chave: "realizadas", rotulo: "Realizadas", tipo: "numero" },
      { chave: "agendadas", rotulo: "Agendadas", tipo: "numero" },
      { chave: "pendentes", rotulo: "A entregar", tipo: "numero" },
      { chave: "valor_devido", rotulo: "Valor devido", tipo: "moeda" },
      { chave: "validade", rotulo: "Validade", tipo: "data" },
    ],
    linhas: (await pacotesPendentes()) as unknown as Record<string, unknown>[],
  }),

  "retorno-equipamentos": async (p) => {
    const periodo = periodoDe(p);
    return {
      titulo: `Retorno dos equipamentos ${periodo.de} a ${periodo.ate}`,
      colunas: [
        { chave: "nome", rotulo: "Aparelho" },
        { chave: "modelo", rotulo: "Modelo" },
        { chave: "sessoes", rotulo: "Sessões", tipo: "numero" },
        { chave: "horas", rotulo: "Horas", tipo: "numero" },
        { chave: "receita", rotulo: "Receita", tipo: "moeda" },
        { chave: "custo_uso", rotulo: "Custo de uso", tipo: "moeda" },
        { chave: "margem", rotulo: "Margem", tipo: "moeda" },
        { chave: "custo_aquisicao", rotulo: "Custo de aquisição", tipo: "moeda" },
        { chave: "pct_aquisicao", rotulo: "% da compra no período", tipo: "pct" },
      ],
      linhas: (await retornoEquipamentos(periodo.inicio, periodo.fim)) as unknown as Record<
        string,
        unknown
      >[],
    };
  },

  "receita-forma": async (p) => {
    const periodo = periodoDe(p);
    const linhas = await receitaPorForma(
      diaLocal(periodo.inicio),
      diaLocal(new Date(periodo.fim.getTime() - 1)),
    );
    return {
      titulo: `Receita prevista e realizada ${periodo.de} a ${periodo.ate}`,
      colunas: [
        { chave: "forma", rotulo: "Forma de pagamento" },
        { chave: "prevista", rotulo: "Prevista", tipo: "moeda" },
        { chave: "realizada", rotulo: "Realizada", tipo: "moeda" },
      ],
      linhas,
    };
  },

  cobrancas: async (p) => {
    const ver = p.get("ver") ?? "abertas";
    const todas = await cobrancas();
    const lista =
      ver === "pagas"
        ? todas.filter((c) => c.status === "pago")
        : ver === "atrasadas"
          ? todas.filter((c) => emAberto(c) && diasDeAtraso(c.vencimento) > 0)
          : todas.filter(emAberto);
    return {
      titulo: `Cobranças ${ver}`,
      colunas: [
        { chave: "paciente_nome", rotulo: "Paciente" },
        { chave: "descricao", rotulo: "Cobrança" },
        { chave: "vencimento", rotulo: "Vencimento", tipo: "data" },
        { chave: "valor", rotulo: "Valor", tipo: "moeda" },
        { chave: "status", rotulo: "Situação" },
        { chave: "atraso", rotulo: "Dias de atraso", tipo: "numero" },
        { chave: "data_pagamento", rotulo: "Pago em", tipo: "data" },
        { chave: "forma_pagamento", rotulo: "Forma" },
      ],
      linhas: lista.map((c) => ({
        ...c,
        atraso: emAberto(c) ? diasDeAtraso(c.vencimento) : null,
      })),
    };
  },

  vendas: async (p) => {
    const periodo = resolverPeriodo(p.get("de") ?? undefined, p.get("ate") ?? undefined);
    const colunas = [
      { chave: "dia", rotulo: "Data", tipo: "data" as const },
      { chave: "paciente_nome", rotulo: "Paciente" },
      { chave: "procedimento_nome", rotulo: "Procedimento" },
      { chave: "marca_nome", rotulo: "Marca" },
      { chave: "tipo", rotulo: "Tipo" },
      { chave: "canal", rotulo: "Canal" },
      { chave: "vendedor_nome", rotulo: "Vendido por" },
      { chave: "valor", rotulo: "Valor", tipo: "moeda" as const },
    ];
    // Relatório da gestão: os demais perfis recebem o arquivo vazio.
    const perfil = await perfilDoUsuario();
    if (perfil !== "admin" && perfil !== "gestao") {
      return { titulo: `Vendas ${periodo.rotulo}`, colunas, linhas: [] };
    }
    const canal = p.get("canal");
    const vendedor = p.get("vendedor");
    const lista = (await vendasDoPeriodo(periodo))
      .filter((v) => !canal || v.canal === canal)
      .filter((v) => !vendedor || (v.vendedor_id ?? "sem") === vendedor)
      .sort((a, b) => a.dia.localeCompare(b.dia));
    return {
      titulo: `Vendas ${periodo.rotulo}`,
      colunas,
      linhas: lista.map((v) => ({
        ...v,
        tipo: v.tipo === "pacote" ? "Pacote" : "Sessão avulsa",
        canal: ROTULO_CANAL[v.canal],
        vendedor_nome: v.vendedor_nome ?? "",
      })),
    };
  },

  bonificacoes: async (p) => {
    const competencia = p.get("competencia") ?? competenciaAtual();
    const lista = await comissoesDetalhadas(competencia);
    return {
      titulo: `Bonificações ${competencia}`,
      colunas: [
        { chave: "profissional", rotulo: "Profissional" },
        { chave: "sessao", rotulo: "Sessão" },
        { chave: "paciente", rotulo: "Paciente" },
        { chave: "procedimento", rotulo: "Procedimento" },
        { chave: "base", rotulo: "Base", tipo: "moeda" },
        { chave: "percentual", rotulo: "Percentual", tipo: "numero" },
        { chave: "valor", rotulo: "Bonificação", tipo: "moeda" },
        { chave: "status", rotulo: "Situação" },
      ],
      linhas: lista.map((c) => ({
        profissional: c.profissional?.nome,
        sessao: c.agendamento ? dataHora(c.agendamento.inicio) : "",
        paciente: c.agendamento?.paciente?.nome,
        procedimento: c.agendamento?.procedimento?.nome,
        base: c.base_calculo,
        percentual: c.percentual,
        valor: c.valor,
        status: c.status,
      })),
    };
  },

  despesas: async (p) => {
    const competencia = p.get("competencia") ?? competenciaAtual();
    return {
      titulo: `Despesas fixas ${competencia}`,
      colunas: [
        { chave: "descricao", rotulo: "Descrição" },
        { chave: "categoria", rotulo: "Categoria" },
        { chave: "recorrente", rotulo: "Recorrente" },
        { chave: "valor", rotulo: "Valor", tipo: "moeda" },
      ],
      linhas: (await despesasDaCompetencia(competencia)).map((d) => ({
        ...d,
        recorrente: d.recorrente ? "Sim" : "Não",
      })),
    };
  },

  dre: async (p) => {
    const competencia = p.get("competencia") ?? competenciaAtual();
    const r = await dre(competencia);
    const linhas = r
      ? [
          { item: "Receita realizada", valor: r.receita_realizada },
          { item: "(−) Custos diretos", valor: -Number(r.custos_diretos) },
          { item: "(−) Bonificações", valor: -Number(r.comissoes) },
          { item: "= Margem de contribuição", valor: r.margem_contrib },
          { item: "(−) Despesas fixas", valor: -Number(r.despesas_fixas) },
          { item: "= Resultado", valor: r.resultado },
        ]
      : [];
    return {
      titulo: `DRE ${competencia}`,
      colunas: [
        { chave: "item", rotulo: "Item" },
        { chave: "valor", rotulo: "Valor", tipo: "moeda" },
      ],
      linhas,
    };
  },
};

/** Endereço antigo da exportação, de antes de "Comissões" virar "Bonificações". */
RELATORIOS.comissoes = RELATORIOS.bonificacoes;
