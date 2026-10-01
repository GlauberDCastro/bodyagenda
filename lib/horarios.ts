import { DIAS_SEMANA } from "@/lib/types/database";

/**
 * Horário de funcionamento: uma ou mais faixas por dia da semana (RF-24),
 * como 08:00–12:00 e 13:00–18:00 com pausa de almoço.
 *
 * `dia` segue extract(dow) do Postgres: 0 = domingo, 6 = sábado.
 */
export interface Janela {
  dia: number;
  inicio: string;
  fim: string;
}

export interface Faixa {
  inicio: string;
  fim: string;
}

export interface DiaDaSemana {
  dia: number;
  aberto: boolean;
  faixas: Faixa[];
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
const posicao = (dia: number) => ORDEM_SEMANA.indexOf(dia as never);

function normalizar(janelas: Janela[]): Janela[] {
  return janelas
    .map((j) => ({ dia: j.dia, inicio: hhmm(j.inicio), fim: hhmm(j.fim) }))
    .sort((a, b) => posicao(a.dia) - posicao(b.dia) || a.inicio.localeCompare(b.inicio));
}

/** Chave para comparar horários de recursos diferentes. */
export function assinatura(janelas: Janela[]): string {
  return normalizar(janelas)
    .map((j) => `${j.dia}@${j.inicio}-${j.fim}`)
    .join("|");
}

/** "Seg–Sex 08:00–12:00, 13:00–18:00 · Sáb 08:00–12:00" */
export function resumirHorario(janelas: Janela[]): string {
  const lista = normalizar(janelas);
  if (lista.length === 0) return "Sem horário";

  // As faixas de cada dia viram um texto; dias seguidos com o mesmo texto se juntam.
  const porDia = new Map<number, string[]>();
  for (const j of lista) porDia.set(j.dia, [...(porDia.get(j.dia) ?? []), `${j.inicio}–${j.fim}`]);

  const grupos: { de: number; ate: number; texto: string }[] = [];
  for (const dia of ORDEM_SEMANA) {
    const faixas = porDia.get(dia);
    if (!faixas) continue;
    const texto = faixas.join(", ");
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.texto === texto && posicao(dia) === posicao(ultimo.ate) + 1) {
      ultimo.ate = dia;
    } else {
      grupos.push({ de: dia, ate: dia, texto });
    }
  }

  return grupos
    .map((g) => {
      const dias = g.de === g.ate ? NOMES_DIA[g.de] : `${NOMES_DIA[g.de]}–${NOMES_DIA[g.ate]}`;
      return `${dias} ${g.texto}`;
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
  const lista = normalizar(janelas);
  return ORDEM_SEMANA.map((dia) => {
    const faixas = lista.filter((j) => j.dia === dia).map(({ inicio, fim }) => ({ inicio, fim }));
    return {
      dia,
      aberto: faixas.length > 0,
      faixas: faixas.length > 0 ? faixas : [{ inicio: "08:00", fim: "18:00" }],
    };
  });
}

export function janelasDaSemana(semana: DiaDaSemana[]): Janela[] {
  return semana
    .filter((d) => d.aberto)
    .flatMap((d) =>
      [...d.faixas]
        .sort((a, b) => a.inicio.localeCompare(b.inicio))
        .map((f) => ({ dia: d.dia, inicio: hhmm(f.inicio), fim: hhmm(f.fim) })),
    );
}

/** Mensagem do primeiro problema, ou null se a semana é válida. */
export function validarSemana(semana: DiaDaSemana[]): string | null {
  const abertos = semana.filter((d) => d.aberto);
  if (abertos.length === 0) return "Marque pelo menos um dia de atendimento.";
  for (const d of abertos) {
    const faixas = [...d.faixas].sort((a, b) => a.inicio.localeCompare(b.inicio));
    if (faixas.length === 0) return `${NOMES_DIA[d.dia]}: informe ao menos uma faixa.`;
    for (const f of faixas) {
      if (!/^\d{2}:\d{2}/.test(f.inicio) || !/^\d{2}:\d{2}/.test(f.fim)) {
        return `${NOMES_DIA[d.dia]}: informe início e fim.`;
      }
      if (hhmm(f.fim) <= hhmm(f.inicio)) {
        return `${NOMES_DIA[d.dia]}: o fim deve ser depois do início.`;
      }
    }
    for (let i = 1; i < faixas.length; i++) {
      if (hhmm(faixas[i].inicio) < hhmm(faixas[i - 1].fim)) {
        return `${NOMES_DIA[d.dia]}: as faixas se sobrepõem.`;
      }
    }
  }
  return null;
}
