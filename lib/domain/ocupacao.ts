/**
 * Matemática de ocupação — RN-02, RN-03, RN-08 do PRD.
 *
 * Módulo PURO: não importa Supabase, React nem Next. É o que permite testar
 * as regras sem banco e sem mock.
 *
 * A fonte de verdade em produção são as funções SQL (migrações 0005 e 0006).
 * Isto aqui existe para (a) provar as regras em teste e (b) fazer cálculo
 * otimista em tela. Nunca para gravar.
 */

export interface Intervalo {
  inicio: Date;
  fim: Date;
}

const MS_POR_HORA = 3_600_000;

export function duracaoHoras({ inicio, fim }: Intervalo): number {
  return (fim.getTime() - inicio.getTime()) / MS_POR_HORA;
}

/** Interseção de dois intervalos, ou null quando não se tocam. */
export function intersectar(a: Intervalo, b: Intervalo): Intervalo | null {
  const inicio = new Date(Math.max(a.inicio.getTime(), b.inicio.getTime()));
  const fim = new Date(Math.min(a.fim.getTime(), b.fim.getTime()));
  return inicio < fim ? { inicio, fim } : null;
}

/**
 * Sobreposição entre dois intervalos, com semântica semiaberta `[inicio, fim)`.
 *
 * É o que faz um atendimento que termina às 10:00 NÃO conflitar com outro que
 * começa às 10:00 — mesma regra do `&&` sobre tstzrange '[)' no Postgres (RN-01).
 */
export function sobrepoe(a: Intervalo, b: Intervalo): boolean {
  return a.inicio < b.fim && b.inicio < a.fim;
}

/** Une intervalos sobrepostos ou encostados, devolvendo-os ordenados. */
export function unir(intervalos: Intervalo[]): Intervalo[] {
  if (intervalos.length === 0) return [];

  const ordenados = [...intervalos].sort(
    (x, y) => x.inicio.getTime() - y.inicio.getTime(),
  );
  const saida: Intervalo[] = [{ ...ordenados[0] }];

  for (const atual of ordenados.slice(1)) {
    const ultimo = saida[saida.length - 1];
    if (atual.inicio <= ultimo.fim) {
      if (atual.fim > ultimo.fim) ultimo.fim = atual.fim;
    } else {
      saida.push({ ...atual });
    }
  }
  return saida;
}

/**
 * Subtrai `remover` de `base` — equivalente à subtração de multirange usada em
 * `janela_util_multirange()` (migração 0005).
 */
export function subtrair(base: Intervalo[], remover: Intervalo[]): Intervalo[] {
  const aRemover = unir(remover);
  let resultado = unir(base);

  for (const corte of aRemover) {
    const proximo: Intervalo[] = [];
    for (const faixa of resultado) {
      if (!sobrepoe(faixa, corte)) {
        proximo.push(faixa);
        continue;
      }
      if (faixa.inicio < corte.inicio) {
        proximo.push({ inicio: faixa.inicio, fim: corte.inicio });
      }
      if (corte.fim < faixa.fim) {
        proximo.push({ inicio: corte.fim, fim: faixa.fim });
      }
    }
    resultado = proximo;
  }
  return resultado;
}

/**
 * RN-02 · capacidade = disponibilidade − bloqueios.
 *
 * Bloqueio fora da janela de atendimento não subtrai nada: não se perde
 * capacidade que nunca existiu.
 */
export function capacidadeHoras(
  disponibilidade: Intervalo[],
  bloqueios: Intervalo[],
): number {
  return subtrair(disponibilidade, bloqueios).reduce(
    (total, faixa) => total + duracaoHoras(faixa),
    0,
  );
}

export interface Ocupacao {
  capacidadeHoras: number;
  agendadasHoras: number;
  realizadasHoras: number;
  /** null quando a capacidade é zero — dividir por zero não é 0%, é "sem base". */
  taxaAgendada: number | null;
  taxaEfetiva: number | null;
  ociosidadeHoras: number;
}

export type StatusAgendamento =
  | "agendado"
  | "confirmado"
  | "em_atendimento"
  | "realizado"
  | "falta"
  | "cancelado";

export interface ReservaCalculo extends Intervalo {
  status: StatusAgendamento;
}

/**
 * RN-03 · ocupação agendada e efetiva.
 *
 * As duas são medidas separadamente de propósito: a diferença entre elas é o
 * custo do no-show. `falta` conta como agendada (a sala ficou bloqueada e
 * ninguém a usou) mas não como realizada. `cancelado` não conta em nenhuma —
 * o horário voltou a ficar disponível.
 */
export function calcularOcupacao(
  disponibilidade: Intervalo[],
  bloqueios: Intervalo[],
  reservas: ReservaCalculo[],
  periodo: Intervalo,
): Ocupacao {
  const capacidade = capacidadeHoras(
    disponibilidade
      .map((d) => intersectar(d, periodo))
      .filter((d): d is Intervalo => d !== null),
    bloqueios,
  );

  const somar = (filtro: (r: ReservaCalculo) => boolean) =>
    reservas
      .filter(filtro)
      .map((r) => intersectar(r, periodo))
      .filter((r): r is Intervalo => r !== null)
      .reduce((total, r) => total + duracaoHoras(r), 0);

  const agendadas = somar((r) => r.status !== "cancelado");
  const realizadas = somar((r) => r.status === "realizado");

  const taxa = (valor: number) =>
    capacidade > 0 ? Number((valor / capacidade).toFixed(4)) : null;

  return {
    capacidadeHoras: capacidade,
    agendadasHoras: agendadas,
    realizadasHoras: realizadas,
    taxaAgendada: taxa(agendadas),
    taxaEfetiva: taxa(realizadas),
    ociosidadeHoras: Math.max(0, capacidade - realizadas),
  };
}

/**
 * RN-08 · receita por hora disponível.
 *
 * Responde à pergunta financeira, não à operacional: uma sala 90% ocupada com
 * procedimento barato rende menos que uma 60% ocupada com procedimento caro.
 * Foi essa métrica que o Anexo B do PRD expôs — salas 4 e 5 a ~R$ 200/h contra
 * a sala 6 a ~R$ 3.996/h, todas marcando 100% de ocupação.
 */
export function receitaPorHoraDisponivel(
  receitaRealizada: number,
  capacidadeHoras: number,
): number | null {
  return capacidadeHoras > 0 ? receitaRealizada / capacidadeHoras : null;
}
