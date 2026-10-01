import Link from "next/link";
import {
  rentabilidade,
  passivoEntrega,
  dre,
  contasAReceber,
  comissoesDaCompetencia,
  competenciaAtual,
} from "@/lib/consultas/financeiro";
import { resolverPeriodo } from "@/lib/consultas/painel";
import { receitaPorForma } from "@/lib/consultas/caixa";
import { Vazio } from "@/components/ui/primitivos";
import { Cartao, brl, brlExato, pct, horas } from "@/components/painel/indicadores";

export const metadata = { title: "Relatórios financeiros" };

export default async function FinanceiroPage(props: {
  searchParams: Promise<{ de?: string; ate?: string; competencia?: string }>;
}) {
  const { de, ate, competencia = competenciaAtual() } = await props.searchParams;
  const periodo = resolverPeriodo(de, ate);

  const diaLocal = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

  const [rent, passivo, resultado, receber, comissoes, porForma] = await Promise.all([
    rentabilidade(periodo.inicio, periodo.fim),
    passivoEntrega(),
    dre(competencia),
    contasAReceber(),
    comissoesDaCompetencia(competencia),
    receitaPorForma(diaLocal(periodo.inicio), diaLocal(new Date(periodo.fim.getTime() - 1))),
  ]);
  const prevista = porForma.reduce((t, f) => t + f.prevista, 0);
  const realizada = porForma.reduce((t, f) => t + f.realizada, 0);

  const comRealizacao = rent.filter((r) => r.sessoes > 0);
  const totalPassivo = passivo.reduce((t, p) => t + Number(p.valor_devido), 0);
  const horasPassivo = passivo.reduce((t, p) => t + Number(p.horas_devidas), 0);
  const totalComissoes = comissoes.reduce((t, c) => t + Number(c.valor), 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Relatórios financeiros</h1>
          <p className="text-sm text-[var(--tinta-3)]">
            {periodo.rotulo} · competência {competencia}
          </p>
        </div>
        <Link href="/" className="text-sm underline-offset-4 hover:underline">
          ← Painel
        </Link>
      </header>

      {/* RF-99 · DRE simplificado */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Resultado da competência</h2>
        {!resultado ? (
          <Vazio>Sem dados para {competencia}.</Vazio>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Cartao
                rotulo="Receita realizada"
                valor={brl.format(Number(resultado.receita_realizada))}
              />
              <Cartao
                rotulo="Margem de contribuição"
                valor={brl.format(Number(resultado.margem_contrib))}
                apoio="Receita − custos diretos − comissões"
              />
              <Cartao
                rotulo="Despesas fixas"
                valor={brl.format(Number(resultado.despesas_fixas))}
                apoio={
                  resultado.custo_hora_estr
                    ? `${brlExato.format(Number(resultado.custo_hora_estr))} por hora de sala`
                    : "Nenhuma despesa lançada"
                }
                destaque={Number(resultado.despesas_fixas) === 0 ? "atencao" : "neutro"}
              />
              <Cartao
                rotulo="Resultado"
                valor={brl.format(Number(resultado.resultado))}
                destaque={Number(resultado.resultado) >= 0 ? "bom" : "atencao"}
              />
            </div>
            {Number(resultado.despesas_fixas) === 0 && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Nenhuma despesa fixa lançada em {competencia}. O resultado acima é margem de
                contribuição, não lucro — falta descontar a estrutura.
              </p>
            )}
          </>
        )}
      </section>

      {/* RF-96 · rentabilidade por procedimento */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Rentabilidade por procedimento</h2>
        {comRealizacao.length === 0 ? (
          <Vazio>Nenhuma sessão realizada no período.</Vazio>
        ) : (
          <div className="cartao overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--traco)] text-left ">
                <tr className="text-[var(--tinta-3)]">
                  <th className="px-4 py-2.5 font-medium">Procedimento</th>
                  <th className="px-4 py-2.5 text-right font-medium">Sessões</th>
                  <th className="px-4 py-2.5 text-right font-medium">Receita</th>
                  <th className="px-4 py-2.5 text-right font-medium">Custo</th>
                  <th className="px-4 py-2.5 text-right font-medium">Comissão</th>
                  <th className="px-4 py-2.5 text-right font-medium">Margem</th>
                  <th className="px-4 py-2.5 text-right font-medium">%</th>
                  <th className="px-4 py-2.5 text-right font-medium">Margem/hora</th>
                </tr>
              </thead>
              <tbody>
                {comRealizacao.map((r) => (
                  <tr
                    key={r.procedimento_id}
                    className="border-b border-[var(--traco)] last:border-0 "
                  >
                    <td className="px-4 py-2.5 font-medium">{r.nome}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.sessoes}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {brl.format(Number(r.receita))}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--tinta-3)]">
                      {brl.format(Number(r.custo_direto))}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--tinta-3)]">
                      {brl.format(Number(r.comissao))}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {brl.format(Number(r.margem))}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{pct(r.margem_pct)}</td>
                    {/* O indicador correto para comparar procedimentos de
 durações diferentes (RN-04). */}
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                      {r.margem_por_hora === null
                        ? "—"
                        : brlExato.format(Number(r.margem_por_hora))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-[var(--tinta-3)]">
          Margem por hora é o indicador para comparar procedimentos de durações diferentes: um de
          margem menor que ocupa metade do tempo pode render mais por hora de sala.
        </p>
      </section>

      {/* RF-95 · passivo de entrega */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Passivo de entrega</h2>
        {passivo.length === 0 ? (
          <Vazio>Nenhuma sessão vendida e pendente de execução.</Vazio>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Cartao
                rotulo="Valor já recebido, serviço não entregue"
                valor={brl.format(totalPassivo)}
                apoio="O caixa parece melhor que o resultado enquanto isso não sai"
                destaque="atencao"
              />
              <Cartao
                rotulo="Horas de agenda comprometidas"
                valor={horas(horasPassivo)}
                apoio="Capacidade futura já vendida"
              />
            </div>
            <div className="cartao overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--traco)] text-left ">
                  <tr className="text-[var(--tinta-3)]">
                    <th className="px-4 py-2.5 font-medium">Procedimento</th>
                    <th className="px-4 py-2.5 text-right font-medium">Pacotes</th>
                    <th className="px-4 py-2.5 text-right font-medium">Sessões devidas</th>
                    <th className="px-4 py-2.5 text-right font-medium">Horas</th>
                    <th className="px-4 py-2.5 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {passivo.map((p) => (
                    <tr
                      key={p.procedimento_id}
                      className="border-b border-[var(--traco)] last:border-0 "
                    >
                      <td className="px-4 py-2.5 font-medium">{p.nome}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{p.pacotes}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{p.sessoes_devidas}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {horas(Number(p.horas_devidas))}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {brl.format(Number(p.valor_devido))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* RF-97 · contas a receber com aging */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Contas a receber</h2>
        {receber.linhas.length === 0 ? (
          <Vazio>Nenhum recebimento pendente.</Vazio>
        ) : (
          <div className="grid gap-3 sm:grid-cols-4">
            {receber.aging.map((a) => (
              <Cartao
                key={a.faixa}
                rotulo={a.faixa}
                valor={brl.format(a.valor)}
                apoio={`${a.qtd} lançamento(s)`}
                destaque={a.faixa === "60+ dias" && a.valor > 0 ? "atencao" : "neutro"}
              />
            ))}
          </div>
        )}
      </section>

      {/* RF-94 · receita prevista × realizada, por forma de pagamento */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Receita prevista × realizada · {periodo.rotulo}</h2>
        {porForma.length === 0 ? (
          <Vazio>Nenhuma cobrança vence nem foi paga neste período.</Vazio>
        ) : (
          <div className="cartao overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--traco)] text-left">
                <tr className="text-[var(--tinta-3)]">
                  <th className="px-4 py-2.5 font-medium">Forma de pagamento</th>
                  <th className="px-4 py-2.5 text-right font-medium">Prevista (vencendo)</th>
                  <th className="px-4 py-2.5 text-right font-medium">Realizada (recebida)</th>
                </tr>
              </thead>
              <tbody>
                {porForma.map((f) => (
                  <tr key={f.forma} className="border-b border-[var(--traco)] last:border-0">
                    <td className="px-4 py-2.5 font-medium">{f.forma}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {brl.format(f.prevista)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {brl.format(f.realizada)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-[var(--superficie-2)] font-medium">
                  <td className="px-4 py-2.5">Total</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{brl.format(prevista)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{brl.format(realizada)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* RF-98 · comissões por profissional */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Comissões · {competencia}</h2>
        {comissoes.length === 0 ? (
          <Vazio>Nenhuma comissão apurada nesta competência.</Vazio>
        ) : (
          <div className="cartao overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--traco)] text-left ">
                <tr className="text-[var(--tinta-3)]">
                  <th className="px-4 py-2.5 font-medium">Profissional</th>
                  <th className="px-4 py-2.5 font-medium">Procedimento</th>
                  <th className="px-4 py-2.5 text-right font-medium">Base</th>
                  <th className="px-4 py-2.5 text-right font-medium">Valor</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {comissoes.map((c) => (
                  <tr key={c.id} className="border-b border-[var(--traco)] last:border-0 ">
                    <td className="px-4 py-2.5 font-medium">{c.profissional?.nome ?? "—"}</td>
                    <td className="px-4 py-2.5 text-[var(--tinta-2)]">
                      {c.agendamento?.procedimento?.nome ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--tinta-3)]">
                      {brlExato.format(Number(c.base_calculo))}
                      {c.percentual !== null && ` · ${Number(c.percentual)}%`}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {brlExato.format(Number(c.valor))}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--tinta-2)]">{c.status}</td>
                  </tr>
                ))}
                <tr className="bg-[var(--superficie-2)] font-medium ">
                  <td className="px-4 py-2.5" colSpan={3}>
                    Total
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {brlExato.format(totalComissoes)}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
