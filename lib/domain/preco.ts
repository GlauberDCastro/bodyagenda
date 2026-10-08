/**
 * Preço, duração e sessões que valem para um procedimento numa região.
 *
 * A região sobrescreve o procedimento quando o campo dela está preenchido.
 * O parcelado segue o preço à vista de onde ele veio: região com preço
 * próprio e sem parcelado cobra o mesmo à vista e parcelado — nunca herda o
 * parcelado do procedimento, que é de outro preço.
 *
 * A marca do produto (toxina Botox, Dysport…) define o preço e passa na
 * frente da região; duração e sessões continuam da região/procedimento.
 */
export interface PrecoBase {
  valor_sessao: number | null;
  valor_parcelado: number | null;
  duracao_min: number | null;
  sessoes_padrao: number | null;
}

export interface PrecoEfetivo {
  avista: number;
  parcelado: number;
  duracao_min: number;
  sessoes_padrao: number;
}

export function precoEfetivo(
  proc: PrecoBase & { valor_sessao: number; duracao_min: number; sessoes_padrao: number },
  regiao?: PrecoBase | null,
  marca?: { valor_sessao: number; valor_parcelado: number | null } | null,
): PrecoEfetivo {
  const avista = marca?.valor_sessao ?? regiao?.valor_sessao ?? proc.valor_sessao;
  const parcelado = marca
    ? (marca.valor_parcelado ?? marca.valor_sessao)
    : regiao?.valor_sessao != null
      ? (regiao.valor_parcelado ?? regiao.valor_sessao)
      : (regiao?.valor_parcelado ?? proc.valor_parcelado ?? proc.valor_sessao);
  return {
    avista: Number(avista),
    parcelado: Number(parcelado),
    duracao_min: regiao?.duracao_min ?? proc.duracao_min,
    sessoes_padrao: regiao?.sessoes_padrao ?? proc.sessoes_padrao,
  };
}

/** Valor do pacote pela tabela: parcelado quando a venda tem 2 ou mais parcelas. */
export const valorDaTabela = (p: PrecoEfetivo, sessoes: number, parcelas: number) =>
  Math.round((parcelas > 1 ? p.parcelado : p.avista) * sessoes * 100) / 100;
