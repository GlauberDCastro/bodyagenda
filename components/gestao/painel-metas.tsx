import Link from "next/link";
import type { AndamentoDasMetas } from "@/lib/consultas/metas";
import { textoDoRitmo, type Ritmo } from "@/lib/domain/metas";
import { Aviso, Vazio } from "@/components/ui/primitivos";

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);
const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ","));

/** Situação escrita E com cor: a cor sozinha não carrega o estado. */
const SITUACAO: Record<Ritmo, { rotulo: string; cor: string }> = {
  acima: { rotulo: "Acima da meta", cor: "var(--status-bom)" },
  no_ritmo: { rotulo: "No ritmo", cor: "var(--serie-1)" },
  abaixo: { rotulo: "Abaixo", cor: "var(--status-critico)" },
};

function Situacao({ ritmo }: { ritmo: Ritmo }) {
  const s = SITUACAO[ritmo];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
      style={{
        background: `color-mix(in oklab, ${s.cor} 14%, var(--superficie))`,
        color: `color-mix(in oklab, ${s.cor} 72%, var(--tinta-1))`,
      }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: s.cor }} />
      {s.rotulo}
    </span>
  );
}

/** Barra fina de progresso contra um alvo; passa de 100% sem estourar o trilho. */
function Progresso({ valor, alvo }: { valor: number; alvo: number }) {
  const fracao = alvo > 0 ? Math.min(1, valor / alvo) : 0;
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--superficie-2)]">
      <div
        className="h-full rounded-full"
        style={{
          width: `${fracao * 100}%`,
          background: fracao >= 1 ? "var(--status-bom)" : "var(--serie-1)",
        }}
      />
    </div>
  );
}

/**
 * Ocupação contra a meta do mês: a barra mostra a efetiva (escura) e a já
 * agendada (clara); o traço vertical é a meta. A escala vai além da meta para
 * que passar dela apareça.
 */
function OcupacaoContraMeta({ o }: { o: AndamentoDasMetas["ocupacao"] }) {
  const meta = o.meta ?? 0;
  const topo = Math.max(meta * 1.5, o.agendadaNoMes ?? 0, o.efetivaAteHoje ?? 0, 0.05);
  const x = (v: number | null) => `${(Math.min(v ?? 0, topo) / topo) * 100}%`;
  const bateu = o.meta !== null && (o.efetivaAteHoje ?? 0) >= o.meta;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <div>
          <p className="text-[13px] font-medium text-[var(--tinta-2)]">Ocupação das salas</p>
          <p className="numero-xl mt-0.5">
            {pct(o.efetivaAteHoje)}
            <span className="ml-2 text-[15px] font-medium text-[var(--tinta-2)]">
              de {o.meta === null ? "— (sem meta)" : `${pct(o.meta)} de meta`}
            </span>
          </p>
        </div>
        <p className="text-[13px] text-[var(--tinta-2)]">
          Já agendada no mês:{" "}
          <span className="font-semibold text-[var(--tinta-1)]">{pct(o.agendadaNoMes)}</span>
        </p>
      </div>
      <div
        className="relative h-3 rounded-full bg-[var(--superficie-2)]"
        role="img"
        aria-label={`Ocupação efetiva ${pct(o.efetivaAteHoje)}, agendada ${pct(o.agendadaNoMes)}, meta ${pct(o.meta)}`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--serie-1-fraca)]"
          style={{ width: x(o.agendadaNoMes) }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: x(o.efetivaAteHoje),
            background: bateu ? "var(--status-bom)" : "var(--serie-1)",
          }}
        />
        {o.meta !== null && (
          <div
            className="absolute -inset-y-1 w-0.5 rounded-full bg-[var(--tinta-1)]"
            style={{ left: x(o.meta) }}
          />
        )}
      </div>
      <p className="text-[12.5px] text-[var(--tinta-3)]">
        Escuro: realizada até hoje sobre a capacidade até hoje. Claro: já agendada no mês. Traço: a
        meta.
      </p>
    </div>
  );
}

export function PainelMetas({
  andamento: a,
  podeAjustar,
}: {
  andamento: AndamentoDasMetas;
  podeAjustar: boolean;
}) {
  const nomeMes = MESES.at(Number(a.mes.slice(5)) - 1);
  const abaixo = a.metas.filter((m) => m.ritmo === "abaixo").length;
  const abreHoje = a.metas.some((m) => m.metaHoje);
  return (
    <section className="cartao space-y-5 p-5" aria-labelledby="titulo-metas">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="titulo-metas" className="titulo-md">
            Metas de {nomeMes}
          </h2>
          <p className="mt-0.5 text-[13px] text-[var(--tinta-2)]">
            {a.diasDeAtendimento.corridos} de {a.diasDeAtendimento.total} dias de atendimento ·{" "}
            {a.metas.length === 0
              ? "nenhuma meta de venda"
              : abaixo === 0
                ? "todas no ritmo"
                : `${abaixo} de ${a.metas.length} abaixo do ritmo`}
          </p>
        </div>
        {podeAjustar && (
          <Link
            href={`/configuracoes/metas?mes=${a.mes}`}
            className="rounded-full border border-[var(--traco-forte)] px-3.5 py-1.5 text-[13px] font-medium hover:bg-[var(--superficie-2)]"
          >
            Ajustar metas
          </Link>
        )}
      </div>

      <OcupacaoContraMeta o={a.ocupacao} />

      {a.semRegiao > 0 && (
        <Aviso>
          {a.semRegiao} venda(s) de Ultraformer sem região não contam nas metas por região. Informe
          a região ao agendar ou vender.
        </Aviso>
      )}

      {a.metas.length === 0 ? (
        <Vazio>Nenhuma meta de venda para este mês.</Vazio>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead className="text-left text-[12.5px] text-[var(--tinta-2)]">
              <tr className="border-b border-[var(--traco)]">
                <th className="py-2 pr-3 font-medium">Meta</th>
                <th className="w-40 px-3 py-2 font-medium">Hoje</th>
                <th className="w-48 px-3 py-2 font-medium">No mês</th>
                <th className="py-2 pl-3 text-right font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {a.metas.map((m) => (
                <tr key={m.id} className="border-b border-[var(--traco)] last:border-0">
                  <td className="py-2.5 pr-3">
                    <span className="font-medium">{m.rotulo}</span>
                    <span className="block text-[12.5px] text-[var(--tinta-2)]">
                      {textoDoRitmo(m.por_dia_min, m.por_dia_max)}
                      {m.contagem === "pacote" ? " · pacotes" : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {m.metaHoje ? (
                      m.metaHoje.max < 1 ? (
                        // Meta de "1 a cada N dias": não há alvo para um dia só.
                        <>
                          <span className="font-semibold">{m.hoje}</span>
                          <span className="block text-[12.5px] text-[var(--tinta-3)]">
                            conta no mês
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold">{m.hoje}</span>
                          <span className="text-[var(--tinta-2)]">
                            {" "}
                            de{" "}
                            {m.metaHoje.min === m.metaHoje.max
                              ? num(m.metaHoje.min)
                              : `${num(m.metaHoje.min)} a ${num(m.metaHoje.max)}`}
                          </span>
                          <Progresso valor={m.hoje} alvo={m.metaHoje.min} />
                        </>
                      )
                    ) : (
                      <span className="text-[var(--tinta-3)]">
                        {abreHoje ? "—" : "Clínica fechada"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    <span className="font-semibold">{m.mes}</span>
                    <span className="text-[var(--tinta-2)]">
                      {" "}
                      de {num(m.esperadoAteHoje)} até hoje
                    </span>
                    <Progresso valor={m.mes} alvo={m.metaMes.min} />
                    <span className="mt-1 block text-[12px] text-[var(--tinta-3)]">
                      Meta do mês: {num(m.metaMes.min)}
                    </span>
                  </td>
                  <td className="py-2.5 pl-3 text-right">
                    <Situacao ritmo={m.ritmo} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
