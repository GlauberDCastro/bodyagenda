import Link from "next/link";
import {
  carregarPainel,
  consolidar,
  mapaDeCalor,
  gargalos,
  resolverPeriodo,
  hojeNaClinica,
} from "@/lib/consultas/painel";
import { AvisoBanco } from "@/components/ui/primitivos";
import {
  Cartao,
  TabelaRecursos,
  brl,
  brlExato,
  pct,
  horas,
} from "@/components/painel/indicadores";
import { MapaCalor } from "@/components/painel/mapa-calor";
import type { TipoRecurso } from "@/lib/types/database";

export const metadata = { title: "Painel de ocupação" };

const VISOES = [
  { chave: "sala", rotulo: "Salas" },
  { chave: "equipamento", rotulo: "Equipamentos" },
  { chave: "profissional", rotulo: "Profissionais" },
] as const;

export default async function PainelPage(props: {
  searchParams: Promise<{ por?: string; de?: string; ate?: string }>;
}) {
  const { por = "sala", de, ate } = await props.searchParams;
  const tipo = (VISOES.find((v) => v.chave === por)?.chave ?? "sala") as TipoRecurso;
  const periodo = resolverPeriodo(de, ate);

  const [painel, calor, gargalosLista] = await Promise.all([
    carregarPainel(tipo, periodo),
    mapaDeCalor(tipo, periodo),
    gargalos(periodo),
  ]);

  if (painel.semSchema) return <AvisoBanco />;

  const total = consolidar(painel.linhas);
  const qs = (extra: Record<string, string>) =>
    new URLSearchParams({ por, ...(de ? { de } : {}), ...(ate ? { ate } : {}), ...extra }).toString();

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Painel de ocupação</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {periodo.rotulo} · {painel.linhas.length} recurso(s)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <form method="get" className="flex items-center gap-1">
            <input type="hidden" name="por" value={por} />
            <input
              type="date"
              name="de"
              defaultValue={de ?? ""}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <span className="text-sm text-slate-400">até</span>
            <input
              type="date"
              name="ate"
              defaultValue={ate ?? hojeNaClinica()}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </form>

          <nav className="flex gap-1 rounded-lg border border-slate-200 p-0.5 dark:border-slate-800">
            {VISOES.map((v) => (
              <Link
                key={v.chave}
                href={`/?${qs({ por: v.chave })}`}
                className={`rounded-md px-2.5 py-1 text-sm transition ${
                  por === v.chave
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                {v.rotulo}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* RF-76 · cartões de destaque */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao
          rotulo="Ocupação efetiva"
          valor={pct(total.taxaEfetiva)}
          apoio={`Agendada ${pct(total.taxaAgendada)} · ${horas(total.realizadas)} de ${horas(total.capacidade)}`}
        />
        <Cartao
          rotulo="Horas ociosas"
          valor={horas(total.ociosidade)}
          apoio="Capacidade instalada não utilizada"
          destaque={total.ociosidade > total.realizadas ? "atencao" : "neutro"}
        />
        <Cartao
          rotulo="Taxa de no-show"
          valor={pct(total.taxaNoShow)}
          apoio={`${total.faltas} falta(s) em ${total.atendimentos + total.faltas} sessões`}
          destaque={(total.taxaNoShow ?? 0) > 0.1 ? "atencao" : "neutro"}
        />
        <Cartao
          rotulo="Receita por hora disponível"
          valor={total.receitaPorHora === null ? "—" : brlExato.format(total.receitaPorHora)}
          apoio={`${brl.format(total.receita)} no período`}
        />
      </section>

      {/* A diferença entre as duas taxas é o custo do no-show, e só fica
          visível porque são medidas separadamente (RN-03). */}
      {total.taxaAgendada !== null && total.taxaEfetiva !== null
        && total.taxaAgendada > total.taxaEfetiva && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {horas(total.agendadas - total.realizadas)} foram bloqueadas na agenda e
          não viraram atendimento. É a diferença entre a ocupação agendada e a
          efetiva — o custo do no-show.
        </p>
      )}

      {/* RF-78 · gargalo */}
      {gargalosLista.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Gargalos de equipamento</h2>
          {gargalosLista.map((g) => (
            <div
              key={g.modelo}
              className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40"
            >
              <p className="font-medium text-amber-900 dark:text-amber-200">
                {g.modelo} — {pct(Number(g.taxa_media))} de ocupação
              </p>
              <p className="mt-0.5 text-amber-800 dark:text-amber-300">
                {g.unidades} unidade{g.unidades > 1 ? "s" : ""} atendendo{" "}
                {g.procedimentos} procedimentos diferentes, com{" "}
                {horas(Number(g.horas_livres))} livres no período. Cada sessão de
                um procedimento desloca a de outro.
              </p>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Por recurso</h2>
        <TabelaRecursos linhas={painel.linhas} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Quando a clínica está cheia</h2>
        <MapaCalor celulas={calor} />
      </section>

      <nav className="flex flex-wrap gap-4 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
        <Link href="/relatorios/ocupacao" className="underline-offset-4 hover:underline">
          Relatórios de ocupação →
        </Link>
        <Link href="/relatorios/financeiro" className="underline-offset-4 hover:underline">
          Relatórios financeiros →
        </Link>
      </nav>
    </div>
  );
}
