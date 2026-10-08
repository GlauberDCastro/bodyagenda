import Link from "next/link";
import {
  carregarPainel,
  consolidar,
  hojeNaClinica,
  resolverPeriodo,
  type LinhaPainel,
} from "@/lib/consultas/painel";
import { funilDaAvaliacao, novosPacientes, vendasDoPeriodo } from "@/lib/consultas/gestao";
import { perfilDoUsuario } from "@/lib/consultas/recursos";
import { resumirVendas, ROTULO_CANAL, type Canal } from "@/lib/domain/vendas";
import { ROTULO_PERFIL } from "@/lib/perfis";
import { BarraOcupacao, Cartao, brl, pct } from "@/components/painel/indicadores";
import { SeletorPeriodo } from "@/components/relatorios/seletor-periodo";
import { Exportar } from "@/components/relatorios/exportar";
import { BarrasHorizontais, ColunasPorDia, Funil } from "@/components/gestao/graficos";
import { Aviso, Vazio } from "@/components/ui/primitivos";
import { andamentoDasMetas } from "@/lib/consultas/metas";
import { PainelMetas } from "@/components/gestao/painel-metas";

export const metadata = { title: "Central de gestão" };

const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function Painel({
  titulo,
  descricao,
  acao,
  children,
  className = "",
}: {
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`cartao space-y-4 p-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="titulo-md">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-[13px] text-[var(--tinta-3)]">{descricao}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Recursos do mais ocupado ao mais ocioso, com a barra agendada × efetiva. */
function ListaOcupacao({ linhas, por }: { linhas: LinhaPainel[]; por: string }) {
  const ordenadas = [...linhas]
    .filter((l) => Number(l.capacidade_h) > 0)
    .sort((a, b) => (b.taxa_efetiva ?? 0) - (a.taxa_efetiva ?? 0));
  if (ordenadas.length === 0) return <Vazio>Sem capacidade cadastrada no período.</Vazio>;
  return (
    <ul className="space-y-3">
      {ordenadas.map((l) => (
        <li key={l.recurso_id} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
            <span className="truncate">{l.nome}</span>
            <span className="shrink-0 tabular-nums">
              <span className="font-semibold">{pct(l.taxa_efetiva)}</span>
              <span className="text-[var(--tinta-3)]"> · agendada {pct(l.taxa_agendada)}</span>
            </span>
          </div>
          <BarraOcupacao agendada={l.taxa_agendada} efetiva={l.taxa_efetiva} />
        </li>
      ))}
      <li className="pt-1 text-[12.5px] text-[var(--tinta-3)]">
        Barra clara: horas agendadas. Escura: horas realizadas. O vão entre elas é falta.{" "}
        <Link
          href={`/relatorios/ocupacao?por=${por}`}
          className="underline-offset-4 hover:underline"
        >
          Ver relatório
        </Link>
      </li>
    </ul>
  );
}

/**
 * Central de gestão: vendas (por canal e por pessoa), conversão da avaliação
 * inicial e ocupação, no mesmo período. Só administração e gestão.
 */
export default async function GestaoPage(props: {
  searchParams: Promise<{ de?: string; ate?: string; canal?: string; vendedor?: string }>;
}) {
  const q = await props.searchParams;
  const perfil = await perfilDoUsuario();
  if (perfil !== "admin" && perfil !== "gestao") {
    return (
      <div className="space-y-4">
        <h1 className="titulo-xl">Central de gestão</h1>
        <Aviso>Só administração e gestão acessam a central.</Aviso>
      </div>
    );
  }

  const periodo = resolverPeriodo(q.de, q.ate);
  const [vendas, funil, novos, salas, profissionais, andamento] = await Promise.all([
    vendasDoPeriodo(periodo),
    funilDaAvaliacao(periodo),
    novosPacientes(periodo),
    carregarPainel("sala", periodo),
    carregarPainel("profissional", periodo),
    // Metas sempre do mês corrente, qualquer que seja o período escolhido.
    andamentoDasMetas(hojeNaClinica()),
  ]);
  const resumo = resumirVendas(vendas, periodo.de, periodo.ate);
  const ocupacao = consolidar(salas.linhas);

  // Relatório filtrável: o filtro vive na URL, como o período.
  const canal = (Object.keys(ROTULO_CANAL) as Canal[]).includes(q.canal as Canal)
    ? (q.canal as Canal)
    : null;
  const filtradas = vendas
    .filter((v) => !canal || v.canal === canal)
    .filter((v) => !q.vendedor || (v.vendedor_id ?? "sem") === q.vendedor)
    .sort((a, b) => b.dia.localeCompare(a.dia) || b.valor - a.valor);
  const link = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ de: periodo.de, ate: periodo.ate });
    for (const [k, v] of Object.entries({ canal: q.canal, vendedor: q.vendedor, ...extra })) {
      if (v) p.set(k, v);
    }
    return `/gestao?${p}#vendas`;
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="titulo-xl">Central de gestão</h1>
          <p className="mt-1 text-[15px] text-[var(--tinta-2)]">
            Vendas, conversão e ocupação de {periodo.rotulo}.
          </p>
        </div>
        <SeletorPeriodo
          caminho="/gestao"
          de={periodo.de}
          ate={periodo.ate}
          hoje={hojeNaClinica()}
        />
      </header>

      <PainelMetas andamento={andamento} podeAjustar />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao
          rotulo="Vendido no período"
          valor={brl.format(resumo.total)}
          apoio={`${resumo.quantidade} venda(s) · ticket médio ${resumo.ticket === null ? "—" : brl.format(resumo.ticket)}`}
          serie={resumo.porDia.map((d) => d.valor)}
        />
        <Cartao
          rotulo="Ocupação efetiva das salas"
          valor={pct(ocupacao.taxaEfetiva)}
          apoio={`Agendada ${pct(ocupacao.taxaAgendada)} · ${Math.round(ocupacao.ociosidade)} h ociosas`}
          href={`/relatorios/ocupacao?por=sala&de=${periodo.de}&ate=${periodo.ate}`}
        />
        <Cartao
          rotulo="Conversão da avaliação"
          valor={pct(funil.conversao)}
          apoio={
            funil.avaliados > 0
              ? `${funil.compraram} de ${funil.avaliados} avaliado(s) compraram`
              : "Nenhuma avaliação realizada no período"
          }
          destaque={funil.conversao !== null && funil.conversao < 0.3 ? "atencao" : "neutro"}
        />
        <Cartao
          rotulo="Faltas"
          valor={pct(ocupacao.taxaNoShow)}
          apoio={`${ocupacao.faltas} falta(s) em ${ocupacao.atendimentos + ocupacao.faltas} sessões`}
          destaque={(ocupacao.taxaNoShow ?? 0) > 0.1 ? "atencao" : "neutro"}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel titulo="Vendas por canal" descricao="Quanto cada frente trouxe no período.">
          <BarrasHorizontais
            linhas={resumo.porCanal.map((c) => ({
              rotulo: ROTULO_CANAL[c.canal],
              valor: c.valor,
              detalhe: `${c.quantidade} venda(s) · ${pct(c.participacao)}`,
            }))}
          />
        </Painel>
        <Painel
          titulo="Vendas por dia"
          descricao="Pacotes na data da venda; sessões avulsas na data em que foram agendadas."
        >
          <ColunasPorDia pontos={resumo.porDia} />
        </Painel>
      </div>

      <Painel
        titulo="Avaliação inicial"
        descricao="Do cadastro à compra: quem entra, quem é avaliado e quem fecha tratamento."
      >
        <Funil
          etapas={[
            { rotulo: "Novos pacientes", valor: novos, apoio: "Cadastrados no período" },
            {
              rotulo: "Avaliados",
              valor: funil.avaliados,
              apoio: "Avaliação realizada no período",
            },
            {
              rotulo: "Compraram depois da avaliação",
              valor: funil.compraram,
              apoio:
                funil.avaliados > 0
                  ? `${pct(funil.conversao)} dos avaliados${funil.diasAteCompra !== null ? ` · ${funil.diasAteCompra} dia(s) em média até comprar` : ""}`
                  : "—",
            },
          ]}
        />
      </Painel>

      <Painel titulo="Quem vendeu" descricao="Ranking por valor vendido no período.">
        {resumo.porVendedor.length === 0 ? (
          <Vazio>Nenhuma venda no período.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead className="text-left text-[12.5px] text-[var(--tinta-3)]">
                <tr className="border-b border-[var(--traco)]">
                  <th className="py-2 pr-3 font-medium">Pessoa</th>
                  <th className="px-3 py-2 font-medium">Perfil</th>
                  <th className="px-3 py-2 text-right font-medium">Vendas</th>
                  <th className="px-3 py-2 text-right font-medium">Pacotes</th>
                  <th className="px-3 py-2 text-right font-medium">Avulsas</th>
                  <th className="px-3 py-2 text-right font-medium">Ticket médio</th>
                  <th className="py-2 pl-3 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {resumo.porVendedor.map((v) => (
                  <tr key={v.id ?? "sem"} className="border-b border-[var(--traco)] last:border-0">
                    <td className="py-2.5 pr-3">
                      <Link
                        href={link({ vendedor: v.id ?? "sem" })}
                        className="font-medium hover:underline"
                      >
                        {v.nome}
                      </Link>
                      <div className="mt-1 h-1 w-full max-w-48 overflow-hidden rounded-full bg-[var(--superficie-2)]">
                        <div
                          className="h-full rounded-full bg-[var(--serie-1)]"
                          style={{ width: `${(v.valor / resumo.porVendedor[0].valor) * 100}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--tinta-2)]">
                      {v.perfil ? (ROTULO_PERFIL[v.perfil] ?? v.perfil) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{v.quantidade}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{v.pacotes}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{v.avulsas}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{brl.format(v.ticket)}</td>
                    <td className="py-2.5 pl-3 text-right font-semibold tabular-nums">
                      {brl.format(v.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Painel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel titulo="Ocupação das salas">
          <ListaOcupacao linhas={salas.linhas} por="sala" />
        </Painel>
        <Painel titulo="Ocupação das profissionais">
          <ListaOcupacao linhas={profissionais.linhas} por="profissional" />
        </Painel>
      </div>

      <section id="vendas" className="cartao space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="titulo-md">Relatório de vendas</h2>
            <p className="mt-0.5 text-[13px] text-[var(--tinta-3)]">
              {filtradas.length} venda(s) · {brl.format(filtradas.reduce((t, v) => t + v.valor, 0))}
              {q.vendedor && (
                <>
                  {" "}
                  ·{" "}
                  <Link
                    href={link({ vendedor: "" })}
                    className="underline-offset-4 hover:underline"
                  >
                    todas as pessoas
                  </Link>
                </>
              )}
            </p>
          </div>
          <Exportar
            relatorio="vendas"
            params={{
              de: periodo.de,
              ate: periodo.ate,
              ...(canal && { canal }),
              ...(q.vendedor && { vendedor: q.vendedor }),
            }}
          />
        </div>

        <nav aria-label="Filtrar por canal" className="flex flex-wrap gap-1">
          {([null, "comercial", "clinica", "recepcao"] as const).map((c) => (
            <Link
              key={c ?? "todos"}
              href={link({ canal: c ?? "" })}
              aria-current={canal === c ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-[13.5px] ${
                canal === c
                  ? "bg-[var(--superficie-inversa)] text-[var(--tinta-inversa)]"
                  : "text-[var(--tinta-2)] hover:bg-[var(--superficie-2)]"
              }`}
            >
              {c ? ROTULO_CANAL[c] : "Todos os canais"}
            </Link>
          ))}
        </nav>

        {filtradas.length === 0 ? (
          <Vazio>Nenhuma venda com estes filtros.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead className="text-left text-[12.5px] text-[var(--tinta-3)]">
                <tr className="border-b border-[var(--traco)]">
                  <th className="py-2 pr-3 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium">Paciente</th>
                  <th className="px-3 py-2 font-medium">Procedimento</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Canal</th>
                  <th className="px-3 py-2 font-medium">Vendido por</th>
                  <th className="py-2 pl-3 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.slice(0, 300).map((v) => (
                  <tr
                    key={`${v.tipo}-${v.id}`}
                    className="border-b border-[var(--traco)] last:border-0"
                  >
                    <td className="py-2.5 pr-3 tabular-nums">{dataCurta(v.dia)}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/pacientes/${v.paciente_id}`} className="hover:underline">
                        {v.paciente_nome}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      {v.procedimento_nome}
                      {v.marca_nome && <span className="text-[var(--tinta-2)]"> · {v.marca_nome}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--tinta-2)]">
                      {v.tipo === "pacote" ? "Pacote" : "Sessão avulsa"}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--tinta-2)]">{ROTULO_CANAL[v.canal]}</td>
                    <td className="px-3 py-2.5 text-[var(--tinta-2)]">{v.vendedor_nome ?? "—"}</td>
                    <td className="py-2.5 pl-3 text-right font-semibold tabular-nums">
                      {brl.format(v.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtradas.length > 300 && (
              <p className="pt-3 text-[12.5px] text-[var(--tinta-3)]">
                Mostrando 300 de {filtradas.length}. A exportação traz todas.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
