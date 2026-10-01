import Link from "next/link";
import {
  despesasDaCompetencia,
  dre,
  competenciaAtual,
  competenciaVizinha,
} from "@/lib/consultas/financeiro";
import { listarProcedimentos } from "@/lib/consultas/recursos";
import { Aviso } from "@/components/ui/primitivos";
import { LancarRecorrentes } from "./lancar-recorrentes";
import { Vazio } from "@/components/ui/primitivos";
import { Cartao, brl, brlExato } from "@/components/painel/indicadores";
import { FormularioDespesa } from "./formulario-despesa";

export const metadata = { title: "Despesas fixas" };

export default async function DespesasPage(props: {
  searchParams: Promise<{ competencia?: string }>;
}) {
  const { competencia = competenciaAtual() } = await props.searchParams;
  const anterior = competenciaVizinha(competencia, -1);
  const [despesas, resultado, doMesAnterior, procedimentos] = await Promise.all([
    despesasDaCompetencia(competencia),
    dre(competencia),
    despesasDaCompetencia(anterior),
    listarProcedimentos(),
  ]);

  // RF-86 · recorrentes do mês anterior que ainda não entraram neste.
  const lancadas = new Set(despesas.map((d) => d.descricao));
  const recorrentesPendentes = doMesAnterior.filter(
    (d) => d.recorrente && !lancadas.has(d.descricao),
  );
  const custoHora = resultado?.custo_hora_estr ? Number(resultado.custo_hora_estr) : null;

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

      {recorrentesPendentes.length > 0 && (
        <Aviso tom="neutro">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {recorrentesPendentes.length} despesa(s) recorrente(s) de {anterior} ainda não
              lançada(s) em {competencia}:{" "}
              {recorrentesPendentes.map((d) => d.descricao).join(", ")}.
            </span>
            <LancarRecorrentes competencia={competencia} qtd={recorrentesPendentes.length} />
          </div>
        </Aviso>
      )}

      {despesas.length === 0 ? (
        <Vazio>
          Nenhuma despesa lançada em {competencia}. Sem elas, o resultado exibido é margem de
          contribuição, não lucro.
        </Vazio>
      ) : (
        <div className="cartao overflow-x-auto">
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

      {/* RF-87 · quanto da estrutura cada sessão consome, pela duração ocupada. */}
      {custoHora !== null && (
        <section className="space-y-3">
          <div>
            <h2 className="titulo-md">Custo de estrutura por sessão</h2>
            <p className="mt-0.5 text-[12.5px] text-[var(--tinta-3)]">
              Custo por hora de sala × (duração + preparo). É o que cada sessão precisa cobrir além
              do custo direto para a clínica não operar no prejuízo.
            </p>
          </div>
          <div className="cartao overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--traco)] text-left">
                <tr className="text-[var(--tinta-3)]">
                  <th className="px-4 py-2.5 font-medium">Procedimento</th>
                  <th className="px-4 py-2.5 text-right font-medium">Tempo de sala</th>
                  <th className="px-4 py-2.5 text-right font-medium">Estrutura por sessão</th>
                </tr>
              </thead>
              <tbody>
                {procedimentos.dados
                  .filter((p) => p.ativo)
                  .map((p) => {
                    const minutos = p.duracao_min + p.buffer_min;
                    return (
                      <tr key={p.id} className="border-b border-[var(--traco)] last:border-0">
                        <td className="px-4 py-2.5 font-medium">{p.nome}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{minutos} min</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {brlExato.format((custoHora * minutos) / 60)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Link href="/relatorios/financeiro" className="text-sm underline-offset-4 hover:underline">
        Relatórios financeiros →
      </Link>
    </div>
  );
}
