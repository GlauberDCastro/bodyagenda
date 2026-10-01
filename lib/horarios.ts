import { DIAS_SEMANA } from "@/lib/types/database";

/**
 * Horário de funcionamento: uma janela por dia da semana.
 *
 * `dia` segue extract(dow) do Postgres: 0 = domingo, 6 = sábado.
 * O banco aceita várias janelas no mesmo dia; a tela trabalha com uma, que é
 * como a clínica opera hoje.
 */
export interface Janela {
  dia: number;
  inicio: string;
  fim: string;
}

export interface DiaDaSemana {
  dia: number;
  aberto: boolean;
  inicio: string;
  fim: string;
}

export const NOMES_DIA = DIAS_SEMANA.map((d) => d.curto);

/** Segunda primeiro: é como a recepção lê a semana. */
export const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;

const PADRAO_SEM_DADOS: Janela[] = [1, 2, 3, 4, 5].map((dia) => ({
  dia,
  inicio: "08:00",
  fim: "18:00",
}));

/** "08:00:00" do Postgres → "08:00". */
const hhmm = (h: string) => h.slice(0, 5);

function normalizar(janelas: Janela[]): Janela[] {
  return janelas
    .map((j) => ({ dia: j.dia, inicio: hhmm(j.inicio), fim: hhmm(j.fim) }))
    .sort((a, b) => ORDEM_SEMANA.indexOf(a.dia as never) - ORDEM_SEMANA.indexOf(b.dia as never));
}

/** Chave para comparar horários de recursos diferentes. */
export function assinatura(janelas: Janela[]): string {
  return normalizar(janelas)
    .map((j) => `${j.dia}@${j.inicio}-${j.fim}`)
    .join("|");
}

/** "Seg–Sex 08:00–18:00 · Sáb 08:00–12:00" */
export function resumirHorario(janelas: Janela[]): string {
  const lista = normalizar(janelas);
  if (lista.length === 0) return "Sem horário";

  const grupos: { de: number; ate: number; inicio: string; fim: string }[] = [];
  for (const j of lista) {
    const ultimo = grupos.at(-1);
    const seguido =
      ultimo &&
      ultimo.inicio === j.inicio &&
      ultimo.fim === j.fim &&
      ORDEM_SEMANA.indexOf(j.dia as never) === ORDEM_SEMANA.indexOf(ultimo.ate as never) + 1;
    if (seguido) ultimo.ate = j.dia;
    else grupos.push({ de: j.dia, ate: j.dia, inicio: j.inicio, fim: j.fim });
  }

  return grupos
    .map((g) => {
      const dias = g.de === g.ate ? NOMES_DIA[g.de] : `${NOMES_DIA[g.de]}–${NOMES_DIA[g.ate]}`;
      return `${dias} ${g.inicio}–${g.fim}`;
    })
    .join(" · ");
}

/** O horário que a maioria dos recursos usa: é o "horário da clínica". */
export function padraoMaisComum(porRecurso: Janela[][]): Janela[] {
  const contagem = new Map<string, { n: number; janelas: Janela[] }>();
  for (const janelas of porRecurso) {
    if (janelas.length === 0) continue;
    const chave = assinatura(janelas);
    const atual = contagem.get(chave);
    if (atual) atual.n++;
    else contagem.set(chave, { n: 1, janelas: normalizar(janelas) });
  }
  let melhor: { n: number; janelas: Janela[] } | undefined;
  for (const c of contagem.values()) if (!melhor || c.n > melhor.n) melhor = c;
  return melhor?.janelas ?? PADRAO_SEM_DADOS;
}

export function semanaDasJanelas(janelas: Janela[]): DiaDaSemana[] {
  const porDia = new Map(normalizar(janelas).map((j) => [j.dia, j]));
  return ORDEM_SEMANA.map((dia) => {
    const j = porDia.get(dia);
    return { dia, aberto: !!j, inicio: j?.inicio ?? "08:00", fim: j?.fim ?? "18:00" };
  });
}

export function janelasDaSemana(semana: DiaDaSemana[]): Janela[] {
  return semana
    .filter((d) => d.aberto)
    .map(({ dia, inicio, fim }) => ({ dia, inicio: hhmm(inicio), fim: hhmm(fim) }));
}

/** Mensagem do primeiro problema, ou null se a semana é válida. */
export function validarSemana(semana: DiaDaSemana[]): string | null {
  const abertos = semana.filter((d) => d.aberto);
  if (abertos.length === 0) return "Marque pelo menos um dia de atendimento.";
  for (const d of abertos) {
    if (!/^\d{2}:\d{2}/.test(d.inicio) || !/^\d{2}:\d{2}/.test(d.fim)) {
      return `${NOMES_DIA[d.dia]}: informe início e fim.`;
    }
    if (hhmm(d.fim) <= hhmm(d.inicio)) {
      return `${NOMES_DIA[d.dia]}: o fim deve ser depois do início.`;
    }
  }
  return null;
}
