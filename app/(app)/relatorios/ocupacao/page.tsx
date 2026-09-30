import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { carregarPainel, consolidar, resolverPeriodo, type Periodo } from "@/lib/consultas/painel";
import { Vazio } from "@/components/ui/primitivos";
import { Cartao, TabelaRecursos, brl, pct, horas } from "@/components/painel/indicadores";
import type { TipoRecurso } from "@/lib/types/database";

export const metadata = { title: "Relatórios de ocupação" };

interface Vaga {
  inicio: string;
  fim: string;
  minutos: number;
  recurso: string;
}

/**
 * RF-91 · janelas vagas por recurso, ordenadas por tamanho.
 * É insumo comercial direto: diz onde exatamente encaixar mais um paciente.
 */
async function janelasVagas(
  tipo: TipoRecurso,
  recursos: { recurso_id: string; nome: string }[],
  periodo: Periodo,
): Promise<Vaga[]> {
  const supabase = await createServerSupabase();

  const porRecurso = await Promise.all(
    recursos.slice(0, 12).map(async (r) => {
      const { data } = await supabase.rpc("janelas_vagas", {
        p_tipo: tipo,
        p_id: r.recurso_id,
        p_inicio: periodo.inicio.toISOString(),
        p_fim: periodo.fim.toISOString(),
        p_min_minutos: 30,
      });
      return (data ?? []).map((v) => ({
        ...v,
        recurso: r.nome,
      }));
    }),
  );

  return porRecurso
    .flat()
    .sort((a, b) => b.minutos - a.minutos)
    .slice(0, 40);
}

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export default async function OcupacaoPage(props: {
  searchParams: Promise<{ por?: string; de?: string; ate?: string }>;
}) {
  const { por = "sala", de, ate } = await props.searchParams;
  const tipo = (
    ["sala", "equipamento", "profissional"].includes(por) ? por : "sala"
  ) as TipoRecurso;
  const periodo = resolverPeriodo(de, ate);

  const painel = await carregarPainel(tipo, periodo);
  const total = consolidar(painel.linhas);
  const vagas = await janelasVagas(tipo, painel.linhas, periodo);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Relatórios de ocupação</h1>
          <p className="text-sm text-[var(--tinta-3)]">{periodo.rotulo}</p>
        </div>
        <Link href="/" className="text-sm underline-offset-4 hover:underline">
          ← Painel
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao rotulo="Capacidade" valor={horas(total.capacidade)} />
        <Cartao
          rotulo="Realizadas"
          valor={horas(total.realizadas)}
          apoio={pct(total.taxaEfetiva)}
        />
        <Cartao
          rotulo="Ociosas"
          valor={horas(total.ociosidade)}
          destaque={total.ociosidade > total.realizadas ? "atencao" : "neutro"}
        />
        <Cartao
          rotulo="No-show"
          valor={pct(total.taxaNoShow)}
          apoio={`${total.faltas} de ${total.atendimentos + total.faltas}`}
          destaque={(total.taxaNoShow ?? 0) > 0.1 ? "atencao" : "neutro"}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Ocupação por recurso</h2>
        <TabelaRecursos linhas={painel.linhas} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Horários vagos</h2>
          <p className="text-xs text-[var(--tinta-3)]">
            Janelas livres de 30 min ou mais, da maior para a menor. Cada uma é capacidade que a
            clínica paga e não usou.
          </p>
        </div>

        {vagas.length === 0 ? (
          <Vazio>
            Nenhuma janela livre no período — ou nenhum recurso com disponibilidade cadastrada.
          </Vazio>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--traco)]">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--traco)] text-left ">
                <tr className="text-[var(--tinta-3)]">
                  <th className="px-4 py-2.5 font-medium">Recurso</th>
                  <th className="px-4 py-2.5 font-medium">De</th>
                  <th className="px-4 py-2.5 font-medium">Até</th>
                  <th className="px-4 py-2.5 text-right font-medium">Duração</th>
                </tr>
              </thead>
              <tbody>
                {vagas.map((v, i) => (
                  <tr
                    key={`${v.recurso}-${v.inicio}-${i}`}
                    className="border-b border-[var(--traco)] last:border-0 "
                  >
                    <td className="px-4 py-2.5 font-medium">{v.recurso}</td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {dataHora.format(new Date(v.inicio))}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{dataHora.format(new Date(v.fim))}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {Math.floor(v.minutos / 60)}h{String(v.minutos % 60).padStart(2, "0")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-[var(--tinta-3)]">
        Receita total no período: {brl.format(total.receita)}.
      </p>
    </div>
  );
}
