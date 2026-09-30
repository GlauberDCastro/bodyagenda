/**
 * Margem de procedimento — RN-04 do PRD.
 *
 * Módulo puro. Espelha `margem_sessao()` (migração 0010), que é a fonte de
 * verdade em produção. Aqui serve para o cálculo ao vivo na tela de cadastro
 * (RF-32), onde o gestor precisa ver a margem mudar enquanto digita o custo,
 * sem ida ao servidor a cada tecla.
 */

export interface LinhaCusto {
  valor_unitario: number;
  quantidade: number;
}

export interface EntradaMargem {
  valorSessao: number;
  duracaoMin: number;
  custos: LinhaCusto[];
  /** Soma dos custos/hora dos aparelhos que o procedimento usa. */
  custoHoraEquipamento?: number;
  custoHoraProfissional?: number;
  /** Percentual de comissão, quando houver. */
  comissaoPct?: number;
  comissaoFixa?: number;
}

export interface ResultadoMargem {
  receita: number;
  custoInsumos: number;
  custoRecursos: number;
  custoDireto: number;
  comissao: number;
  margem: number;
  margemPct: number | null;
  margemPorHora: number | null;
  /** Receita bruta por hora — o indicador do Anexo B do PRD. */
  receitaPorHora: number | null;
}

const arredondar = (v: number) => Math.round(v * 100) / 100;

export function calcularMargem(e: EntradaMargem): ResultadoMargem {
  const horas = e.duracaoMin / 60;

  const custoInsumos = arredondar(
    e.custos.reduce((t, c) => t + c.valor_unitario * c.quantidade, 0),
  );

  const custoRecursos = arredondar(
    ((e.custoHoraEquipamento ?? 0) + (e.custoHoraProfissional ?? 0)) * horas,
  );

  const custoDireto = arredondar(custoInsumos + custoRecursos);

  const comissao = arredondar(e.comissaoFixa ?? (e.valorSessao * (e.comissaoPct ?? 0)) / 100);

  const margem = arredondar(e.valorSessao - custoDireto - comissao);

  return {
    receita: e.valorSessao,
    custoInsumos,
    custoRecursos,
    custoDireto,
    comissao,
    margem,
    margemPct: e.valorSessao > 0 ? margem / e.valorSessao : null,
    // Indicador correto para comparar procedimentos de durações diferentes:
    // margem menor em metade do tempo pode render mais por hora de sala.
    margemPorHora: horas > 0 ? arredondar(margem / horas) : null,
    receitaPorHora: horas > 0 ? arredondar(e.valorSessao / horas) : null,
  };
}

/**
 * Valor por sessão de um pacote fechado.
 *
 * "R$ 799 / 8 sessões" na tabela da Body Prime é o PACOTE inteiro (D-11),
 * então a sessão sai a R$ 99,88 — e é esse número, não os R$ 799, que entra
 * em qualquer cálculo de margem ou de receita por hora.
 */
export function valorPorSessao(
  valorTotal: number,
  quantidadeSessoes: number,
  desconto = 0,
): number {
  if (quantidadeSessoes <= 0) return 0;
  return arredondar((valorTotal - desconto) / quantidadeSessoes);
}
