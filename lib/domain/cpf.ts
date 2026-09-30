/**
 * Validação de CPF — RF-11.
 *
 * Módulo puro. O banco tem `unique` na coluna, mas unicidade não impede
 * cadastrar um CPF inválido; e CPF errado só aparece meses depois, quando o
 * paciente vira duplicata ou a nota não sai.
 */

export function limparCpf(valor: string): string {
  return valor.replace(/\D/g, "");
}

export function formatarCpf(valor: string): string {
  const d = limparCpf(valor);
  if (d.length !== 11) return valor;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Dígito verificador pelo módulo 11, conforme a Receita Federal. */
function digito(base: string, pesoInicial: number): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) {
    soma += Number(base[i]) * (pesoInicial - i);
  }
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

export function cpfValido(valor: string): boolean {
  const d = limparCpf(valor);
  if (d.length !== 11) return false;

  // Sequências repetidas passam no módulo 11 mas não são CPF válido.
  if (/^(\d)\1{10}$/.test(d)) return false;

  return digito(d.slice(0, 9), 10) === Number(d[9]) && digito(d.slice(0, 10), 11) === Number(d[10]);
}
