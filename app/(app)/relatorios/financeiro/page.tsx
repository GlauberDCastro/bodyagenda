import Link from "next/link";
import {
  rentabilidade,
  passivoEntrega,
  dre,
  contasAReceber,
  comissoesDaCompetencia,
  competenciaAtual,
} from "@/lib/consultas/financeiro";
import { hojeNaClinica, resolverPeriodo } from "@/lib/consultas/painel";
import { pacotesPendentes, retornoEquipamentos } from "@/lib/consultas/relatorios";
import { SeletorPeriodo } from "@/components/relatorios/seletor-periodo";
import { receitaPorForma } from "@/lib/consultas/caixa";
import { Vazio } from "@/components/ui/primitivos";
import { Cartao, brl, brlExato, pct, horas } from "@/components/painel/indicadores";
import { Exportar } from "@/components/relatorios/exportar";

export const metadata = { title: "Relatórios financeiros" };

export default async function FinanceiroPage(props: {
  searchParams: Promise<{ de?: string; ate?: string; competencia?: string }>;
}) {
  const { de, ate, competencia = competenciaAtual() } = await props.searchParams;
  const periodo = resolverPeriodo(de, ate);

  const diaLocal = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

  const [rent, passivo, resultado, receber, comissoes, porForma, pendentes, retorno] =
    await Promise.all([
      rentabilidade(periodo.inicio, periodo.fim),
      passivoEntrega(),
      dre(competencia),
      contasAReceber(),
      comissoesDaCompetencia(competencia),
      receitaPorForma(diaLocal(periodo.inicio), diaLocal(new Date(periodo.fim.getTime() - 1))),
      pacotesPendentes(),
      retornoEquipamentos(periodo.inicio, periodo.fim),
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
          <h1 className="titulo-xl">Relatórios financeiros</h1>
          <p className="mt-1 text-[15px] text-[var(--tinta-2)]">
            {periodo.rotulo} · competência {competencia}
          </p>
        </div>
        <Link href="/" className="text-sm underline-offset-4 hover:underline">
          ← Painel
        </Link>
      </header>

      <SeletorPeriodo
        caminho="/relatorios/financeiro"
        de={periodo.de}
        ate={periodo.ate}
        hoje={hojeNaClinica()}
        manter={{ competencia }}
      />

      {/* RF-99 · DRE simplificado */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Resultado da competência</h2>
          <Exportar relatorio="dre" params={{ competencia }} />
        </div>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Rentabilidade por procedimento</h2>
          <Exportar relatorio="rentabilidade" params={{ de: periodo.de, ate: periodo.ate }} />
        </div>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Passivo de entrega</h2>
          <Exportar relatorio="passivo" params={{}} />
        </div>
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

      {/* RF-66 · pacotes com sessões a entregar, por paciente */}
      {pendentes.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Pacotes com sessões a entregar</h2>
          <Exportar relatorio="pacotes-pendentes" params={{}} />
        </div>
          <div className="cartao overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--traco)] text-left">
                <tr className="text-[var(--tinta-3)]">
                  <th className="px-4 py-2.5 font-medium">Paciente</th>
                  <th className="px-4 py-2.5 font-medium">Procedimento</th>
                  <th className="px-4 py-2.5 text-right font-medium">Realizadas</th>
                  <th className="px-4 py-2.5 text-right font-medium">Agendadas</th>
                  <th className="px-4 py-2.5 text-right font-medium">A entregar</th>
                  <th className="px-4 py-2.5 text-right font-medium">Valor devido</th>
                  <th className="px-4 py-2.5 font-medium">Validade</th>
                </tr>
              </thead>
              <tbody>
                {pendentes.map((p) => (
                  <tr key={p.pacote_id} className="border-b border-[var(--traco)] last:border-0">
                    <td className="px-4 py-2.5 font-medium">
                      <Link href={`/pacientes/${p.paciente_id}`} className="hover:underline">
                        {p.paciente}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--tinta-2)]">{p.procedimento}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {p.realizadas} de {p.sessoes}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{p.agendadas}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{p.pendentes}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {brl.format(Number(p.valor_devido))}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--tinta-2)]">
                      {p.validade
                        ? `${p.validade.slice(8, 10)}/${p.validade.slice(5, 7)}/${p.validade.slice(0, 4)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* RF-101 · retorno do equipamento */}
      <section className="space-y-3">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Retorno dos equipamentos · {periodo.rotulo}</h2>
          <Exportar relatorio="retorno-equipamentos" params={{ de: periodo.de, ate: periodo.ate }} />
        </div>
          <p className="text-xs text-[var(--tinta-3)]">
            Receita das sessões realizadas com cada aparelho (dividida quando a sessão usa mais de
            um), menos o custo de uso. A última coluna diz quanto do preço de compra o período já
            pagou.
          </p>
        </div>
        {retorno.length === 0 ? (
          <Vazio>Nenhum equipamento ativo.</Vazio>
        ) : (
          <div className="cartao overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--traco)] text-left">
                <tr className="text-[var(--tinta-3)]">
                  <th className="px-4 py-2.5 font-medium">Aparelho</th>
                  <th className="px-4 py-2.5 text-right font-medium">Sessões</th>
                  <th className="px-4 py-2.5 text-right font-medium">Receita</th>
                  <th className="px-4 py-2.5 text-right font-medium">Custo de uso</th>
                  <th className="px-4 py-2.5 text-right font-medium">Margem</th>
                  <th className="px-4 py-2.5 text-right font-medium">Custo de aquisição</th>
                  <th className="px-4 py-2.5 text-right font-medium">% da compra no período</th>
                </tr>
              </thead>
              <tbody>
                {retorno.map((r) => (
                  <tr key={r.equipamento_id} className="border-b border-[var(--traco)] last:border-0">
                    <td className="px-4 py-2.5 font-medium">
                      {r.nome}
                      <span className="block text-[11.5px] font-normal text-[var(--tinta-3)]">
                        {r.modelo}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.sessoes}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{brl.format(Number(r.receita))}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {brl.format(Number(r.custo_uso))}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                      {brl.format(Number(r.margem))}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.custo_aquisicao ? brl.format(Number(r.custo_aquisicao)) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.pct_aquisicao === null ? "—" : pct(Number(r.pct_aquisicao))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* RF-97 · contas a receber com aging */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Contas a receber</h2>
          <Exportar relatorio="cobrancas" params={{ ver: "abertas" }} />
        </div>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Receita prevista × realizada · {periodo.rotulo}</h2>
          <Exportar relatorio="receita-forma" params={{ de: periodo.de, ate: periodo.ate }} />
        </div>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Comissões · {competencia}</h2>
          <Exportar relatorio="comissoes" params={{ competencia }} />
        </div>
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
