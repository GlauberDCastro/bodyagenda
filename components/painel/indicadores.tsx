import Link from "next/link";
import type { ReactNode } from "react";
import type { LinhaPainel } from "@/lib/consultas/painel";
import { Etiqueta, Tabela, Cabecalho, Th, Tr, Td } from "@/components/ui/primitivos";

export const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
export const brlExato = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function pct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(1)}%`;
}

export function horas(v: number): string {
  return `${v.toFixed(1)} h`;
}

/**
 * Sparkline — série única, sem eixo nem rótulo.
 *
 * Mostra FORMA, não valor: o número exato já está ao lado, em corpo grande.
 * Traço de 2px, ponto final de 8px marcando "onde estamos agora".
 */
export function Sparkline({
  pontos,
  largura = 104,
  altura = 34,
}: {
  pontos: number[];
  largura?: number;
  altura?: number;
}) {
  // Sem variação não há forma a mostrar: uma linha reta leria como "estável",
  // quando o caso é "sem dado". Melhor não desenhar nada.
  const semVariacao = pontos.length < 2 || Math.max(...pontos) === Math.min(...pontos);
  if (semVariacao) return <div style={{ width: largura, height: altura }} />;

  const min = Math.min(...pontos);
  const max = Math.max(...pontos);
  const amplitude = max - min || 1;
  const pad = 4;

  const coord = (v: number, i: number) => {
    const x = pad + (i / (pontos.length - 1)) * (largura - pad * 2);
    const y = altura - pad - ((v - min) / amplitude) * (altura - pad * 2);
    return [x, y] as const;
  };

  const caminho = pontos.map((v, i) => coord(v, i).join(",")).join(" L ");
  const [fx, fy] = coord(pontos[pontos.length - 1], pontos.length - 1);
  const id = `sl-${pontos.join("-").slice(0, 24)}`;

  return (
    <svg width={largura} height={altura} aria-hidden focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--serie-1)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--serie-1)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`M ${caminho} L ${largura - pad},${altura} L ${pad},${altura} Z`}
        fill={`url(#${id})`}
      />
      <path
        d={`M ${caminho}`}
        fill="none"
        stroke="var(--serie-1)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Anel na cor da superfície separa o ponto do traço (spec de marcas). */}
      <circle
        cx={fx}
        cy={fy}
        r="4"
        fill="var(--serie-1)"
        stroke="var(--superficie)"
        strokeWidth="2"
      />
    </svg>
  );
}

export function Cartao({
  rotulo,
  valor,
  apoio,
  destaque,
  serie,
  icone,
  href,
}: {
  rotulo: string;
  valor: string;
  apoio?: ReactNode;
  destaque?: "neutro" | "atencao" | "bom";
  serie?: number[];
  icone?: ReactNode;
  /** RF-77 · o número leva à lista que o compõe. */
  href?: string;
}) {
  const cor =
    destaque === "atencao"
      ? "var(--status-atencao)"
      : destaque === "bom"
        ? "var(--status-bom)"
        : undefined;

  const conteudo = (
    <div
      className={`cartao flex h-full flex-col gap-3 p-4 ${
        href ? "transition-shadow hover:shadow-[var(--sombra-3)]" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-8 place-items-center rounded-full bg-[var(--superficie-2)] text-[var(--tinta-2)]">
          {icone ?? <PontoIcone />}
        </span>
        {serie && <Sparkline pontos={serie} />}
      </div>

      <div>
        <p className="text-[12.5px] text-[var(--tinta-2)]">{rotulo}</p>
        <p
          className="numero-xl mt-0.5"
          style={cor ? { color: `color-mix(in oklab, ${cor} 55%, var(--tinta-1))` } : undefined}
        >
          {valor}
        </p>
        {apoio && <p className="mt-1 text-[12px] leading-snug text-[var(--tinta-3)]">{apoio}</p>}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block rounded-[var(--r-lg)]">
      {conteudo}
    </Link>
  ) : (
    conteudo
  );
}

function PontoIcone() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

/**
 * Barra dupla: agendada atrás, efetiva na frente.
 *
 * A diferença entre as duas É o no-show. Duas barras separadas esconderiam
 * isso; sobrepostas, o vão fica visível sem precisar de cálculo.
 */
export function BarraOcupacao({
  agendada,
  efetiva,
}: {
  agendada: number | null;
  efetiva: number | null;
}) {
  const a = Math.min(1, agendada ?? 0);
  const e = Math.min(1, efetiva ?? 0);

  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--superficie-2)]">
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${a * 100}%`, background: "var(--serie-1-fraca)" }}
        title={`Agendada: ${pct(agendada)}`}
      />
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${e * 100}%`, background: "var(--serie-1)" }}
        title={`Efetiva: ${pct(efetiva)}`}
      />
    </div>
  );
}

export function TabelaRecursos({
  linhas,
  hrefRecurso,
  porModelo = false,
}: {
  linhas: LinhaPainel[];
  /** RF-77 · leva à lista de atendimentos do recurso. */
  hrefRecurso?: (l: LinhaPainel) => string;
  /** RF-21c · equipamentos: subtotal por modelo quando há mais de uma unidade. */
  porModelo?: boolean;
}) {
  if (linhas.length === 0) {
    return (
      <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--traco-forte)] p-10 text-center text-[13.5px] text-[var(--tinta-3)]">
        Nenhum recurso ativo no período.
      </div>
    );
  }

  const ordenadas = [...linhas].sort(
    (a, b) =>
      (porModelo ? a.agrupador.localeCompare(b.agrupador) : 0) ||
      (Number(b.taxa_efetiva) || 0) - (Number(a.taxa_efetiva) || 0),
  );
  const unidadesPorModelo = new Map<string, LinhaPainel[]>();
  for (const l of ordenadas) {
    unidadesPorModelo.set(l.agrupador, [...(unidadesPorModelo.get(l.agrupador) ?? []), l]);
  }
  /** Linha consolidada do modelo, após a última unidade dele. */
  const subtotal = (modelo: string) => {
    const g = unidadesPorModelo.get(modelo) ?? [];
    const t = consolidarLinhas(g);
    return (
      <tr key={`modelo-${modelo}`} className="border-b border-[var(--traco)] bg-[var(--superficie-2)]">
        <td className="px-4 py-2.5 font-medium">
          {modelo} · {g.length} unidades
        </td>
        <td className="px-4 py-2.5 text-[11.5px] tabular-nums text-[var(--tinta-3)]">
          {horas(t.realizadas)} de {horas(t.capacidade)}
        </td>
        <td className="px-4 py-2.5 text-right font-medium tabular-nums">{pct(t.taxa)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums">{horas(t.capacidade - t.realizadas)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums">{t.atendimentos}</td>
        <td className="px-4 py-2.5 text-right tabular-nums">{brl.format(t.receita)}</td>
        <td className="px-4 py-2.5 text-right font-medium tabular-nums">
          {t.capacidade > 0 ? brl.format(t.receita / t.capacidade) : "—"}
        </td>
      </tr>
    );
  };

  return (
    <Tabela>
      <Cabecalho>
        <Th>Recurso</Th>
        <Th>Ocupação</Th>
        <Th alinhar="right">Efetiva</Th>
        <Th alinhar="right">Ociosas</Th>
        <Th alinhar="right">Sessões</Th>
        <Th alinhar="right">Receita</Th>
        <Th alinhar="right">R$/hora disp.</Th>
      </Cabecalho>
      <tbody>
        {ordenadas.flatMap((l, i) => {
          const fimDoModelo =
            porModelo &&
            ordenadas[i + 1]?.agrupador !== l.agrupador &&
            (unidadesPorModelo.get(l.agrupador)?.length ?? 0) > 1;
          return [
          <Tr key={l.recurso_id}>
            <Td forte>
              {hrefRecurso ? (
                <Link href={hrefRecurso(l)} className="hover:underline">
                  {l.nome}
                </Link>
              ) : (
                l.nome
              )}
              <span className="mt-0.5 block text-[11.5px] font-normal text-[var(--tinta-3)]">
                {l.agrupador}
              </span>
            </Td>
            <Td>
              <div className="w-36">
                <BarraOcupacao agendada={l.taxa_agendada} efetiva={l.taxa_efetiva} />
                <p className="mt-1.5 text-[11.5px] tabular-nums text-[var(--tinta-3)]">
                  {horas(Number(l.realizadas_h))} de {horas(Number(l.capacidade_h))}
                </p>
              </div>
            </Td>
            <Td alinhar="right" forte>
              {pct(l.taxa_efetiva)}
            </Td>
            <Td alinhar="right">{horas(Number(l.ociosidade_h))}</Td>
            <Td alinhar="right">
              {l.atendimentos}
              {l.faltas > 0 && (
                <span className="ml-1 text-[11.5px]" style={{ color: "var(--status-atencao)" }}>
                  +{l.faltas} falta{l.faltas > 1 ? "s" : ""}
                </span>
              )}
            </Td>
            <Td alinhar="right">{brl.format(Number(l.receita))}</Td>
            <Td alinhar="right" forte>
              {l.receita_por_hora === null ? "—" : brl.format(Number(l.receita_por_hora))}
            </Td>
          </Tr>,
          ...(fimDoModelo ? [subtotal(l.agrupador)] : []),
          ];
        })}
      </tbody>
    </Tabela>
  );
}

export { Etiqueta };

/** Soma de um grupo de linhas do painel, com a taxa sobre os totais. */
function consolidarLinhas(linhas: LinhaPainel[]) {
  const soma = (f: (l: LinhaPainel) => number) => linhas.reduce((t, l) => t + f(l), 0);
  const capacidade = soma((l) => Number(l.capacidade_h));
  const realizadas = soma((l) => Number(l.realizadas_h));
  return {
    capacidade,
    realizadas,
    taxa: capacidade > 0 ? realizadas / capacidade : null,
    atendimentos: soma((l) => l.atendimentos),
    receita: soma((l) => Number(l.receita)),
  };
}
