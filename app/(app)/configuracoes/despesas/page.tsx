import Link from "next/link";
import { despesasDaCompetencia, dre, competenciaAtual } from "@/lib/consultas/financeiro";
import { Vazio } from "@/components/ui/primitivos";
import { Cartao, brl, brlExato } from "@/components/painel/indicadores";
import { FormularioDespesa } from "./formulario-despesa";

export const metadata = { title: "Despesas fixas" };

export default async function DespesasPage(props: {
  searchParams: Promise<{ competencia?: string }>;
}) {
  const { competencia = competenciaAtual() } = await props.searchParams;
  const [despesas, resultado] = await Promise.all([
    despesasDaCompetencia(competencia),
    dre(competencia),
  ]);

  const total = despesas.reduce((t, d) => t + Number(d.valor), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="text-sm text-[var(--tinta-3)]">
          Competência {competencia} · rateadas por hora de sala (RN-07)
        </p>
        <div className="flex items-center gap-3">
          <form method="get">
            <input
              type="month"
              name="competencia"
              defaultValue={competencia}
              className="rounded-md border border-[var(--traco)] px-2 py-1 text-sm "
            />
          </form>
          <FormularioDespesa competencia={competencia} />
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <Cartao rotulo="Total do mês" valor={brl.format(total)} />
        <Cartao
          rotulo="Custo por hora de sala"
          valor={
            resultado?.custo_hora_estr ? brlExato.format(Number(resultado.custo_hora_estr)) : "—"
          }
          apoio="Denominador usa só salas, para não contar a mesma hora física duas vezes"
        />
        <Cartao
          rotulo="Resultado da competência"
          valor={resultado ? brl.format(Number(resultado.resultado)) : "—"}
          destaque={resultado && Number(resultado.resultado) >= 0 ? "bom" : "atencao"}
        />
      </section>

      {despesas.length === 0 ? (
        <Vazio>
          Nenhuma despesa lançada em {competencia}. Sem elas, o resultado exibido é margem de
          contribuição, não lucro.
        </Vazio>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--traco)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--traco)] text-left ">
              <tr className="text-[var(--tinta-3)]">
                <th className="px-4 py-2.5 font-medium">Descrição</th>
                <th className="px-4 py-2.5 font-medium">Categoria</th>
                <th className="px-4 py-2.5 font-medium">Recorrente</th>
                <th className="px-4 py-2.5 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {despesas.map((d) => (
                <tr key={d.id} className="border-b border-[var(--traco)] last:border-0 ">
                  <td className="px-4 py-2.5 font-medium">{d.descricao}</td>
                  <td className="px-4 py-2.5 text-[var(--tinta-2)]">{d.categoria ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[var(--tinta-2)]">
                    {d.recorrente ? "Sim" : "Não"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {brlExato.format(Number(d.valor))}
                  </td>
                </tr>
              ))}
              <tr className="bg-[var(--superficie-2)] font-medium ">
                <td className="px-4 py-2.5" colSpan={3}>
                  Total
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{brlExato.format(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <Link href="/relatorios/financeiro" className="text-sm underline-offset-4 hover:underline">
        Relatórios financeiros →
      </Link>
    </div>
  );
}
