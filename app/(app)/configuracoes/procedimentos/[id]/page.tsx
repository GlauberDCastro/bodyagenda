import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { calcularMargem } from "@/lib/domain/margem";
import { Etiqueta, Vazio } from "@/components/ui/primitivos";
import { ROTULO_UNIDADE } from "@/lib/constantes";
import { Cartao, brlExato, pct } from "@/components/painel/indicadores";
import { FormularioCusto } from "./formulario-custo";
import { FormularioRequisito } from "./formulario-requisito";
import { FormularioProcedimento } from "../formulario-procedimento";
import { AtivarProcedimento, RemoverCusto, RemoverRequisito } from "./acoes-catalogo";
import {
  FormularioRegiao,
  AcoesProtocolo,
  type RegiaoOpcao,
  type Protocolo,
} from "./formulario-regiao";

const ROTULO_TIPO: Record<string, string> = {
  insumo: "Insumo",
  mao_de_obra: "Mão de obra",
  equipamento: "Equipamento",
  outro: "Outro",
};

/** Campo vazio no protocolo significa "herda do procedimento". */
function Herdado({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[var(--tinta-3)]" title="Herdado do procedimento">
      {children} · herdado
    </span>
  );
}

export default async function ProcedimentoPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createServerSupabase();

  const [
    { data: proc },
    { data: custos },
    { data: requisitos },
    { data: modelos },
    { data: regioes },
    { data: protocolos },
  ] = await Promise.all([
    supabase.from("procedimento").select("*").eq("id", id).maybeSingle(),
    supabase.from("procedimento_custo").select("*").eq("procedimento_id", id),
    supabase.from("procedimento_requisito").select("*").eq("procedimento_id", id),
    supabase.from("equipamento").select("modelo").eq("ativo", true),
    supabase.from("regiao").select("id, nome, grupo").eq("ativo", true).order("ordem"),
    supabase
      .from("procedimento_regiao")
      .select("*, regiao:regiao_id (id, nome, grupo, ordem)")
      .eq("procedimento_id", id),
  ]);

  if (!proc) notFound();

  const linhasCusto = (custos ?? []).map((c) => ({
    valor_unitario: Number(c.valor_unitario),
    quantidade: Number(c.quantidade),
  }));

  const margem = calcularMargem({
    valorSessao: Number(proc.valor_sessao),
    duracaoMin: proc.duracao_min,
    custos: linhasCusto,
  });

  const modelosUnicos = [...new Set((modelos ?? []).map((m) => m.modelo))].sort();

  const protocoloOrdenado = [...(protocolos ?? [])].sort(
    (a, b) =>
      ((a.regiao as { ordem?: number } | null)?.ordem ?? 0) -
      ((b.regiao as { ordem?: number } | null)?.ordem ?? 0),
  );

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <Link
          href="/configuracoes/procedimentos"
          className="text-sm text-[var(--tinta-3)] underline-offset-4 hover:underline "
        >
          ← Procedimentos
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">{proc.nome}</h1>
            <Etiqueta tom={proc.ativo ? "bom" : "neutro"}>
              {proc.ativo ? "Ativo" : "Inativo"}
            </Etiqueta>
          </div>
          <div className="flex items-center gap-2">
            <AtivarProcedimento id={proc.id} ativo={proc.ativo} />
            <FormularioProcedimento inicial={proc} custos={linhasCusto} />
          </div>
        </div>
        <p className="text-sm text-[var(--tinta-3)]">
          {proc.duracao_min} min
          {proc.buffer_min > 0 && ` + ${proc.buffer_min} de preparo`} · {proc.sessoes_padrao}{" "}
          sessão(ões) · {brlExato.format(Number(proc.valor_sessao))} por sessão
        </p>
      </header>

      {/* RF-32 · margem calculada sobre os custos reais */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao rotulo="Receita por sessão" valor={brlExato.format(margem.receita)} />
        <Cartao
          rotulo="Custo direto"
          valor={brlExato.format(margem.custoDireto)}
          apoio={
            linhasCusto.length === 0 ? "Nenhum custo lançado" : `${linhasCusto.length} item(ns)`
          }
          destaque={linhasCusto.length === 0 ? "atencao" : "neutro"}
        />
        <Cartao
          rotulo="Margem de contribuição"
          valor={brlExato.format(margem.margem)}
          apoio={pct(margem.margemPct)}
          destaque={margem.margem < 0 ? "atencao" : margem.margem > 0 ? "bom" : "neutro"}
        />
        <Cartao
          rotulo="Margem por hora"
          valor={margem.margemPorHora === null ? "—" : brlExato.format(margem.margemPorHora)}
          apoio="Comparável entre durações diferentes"
        />
      </section>

      {linhasCusto.length === 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Sem custo lançado, a margem acima é apenas a receita. O custo de insumo é o que separa o
          procedimento que paga a estrutura do que é vendido no prejuízo.
        </p>
      )}

      {/*
        Regiões vêm ANTES dos custos de propósito: é a região que define
        duração e preço, e o custo é consequência.
      */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="titulo-md">Regiões e protocolo</h2>
            <p className="mt-0.5 text-[12.5px] text-[var(--tinta-3)]">
              Duração, preço e dosagem por região. Em branco, herda do procedimento.
            </p>
          </div>
          <FormularioRegiao procedimentoId={id} regioes={(regioes ?? []) as RegiaoOpcao[]} />
        </div>

        {protocoloOrdenado.length === 0 ? (
          <Vazio>
            Nenhuma região cadastrada. Sem ela, o procedimento vale para o corpo
            inteiro com uma duração e um preço só.
          </Vazio>
        ) : (
          <div className="cartao overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-[var(--traco)] text-left text-[12px] font-medium text-[var(--tinta-3)]">
                    <th className="px-4 py-2.5">Região</th>
                    <th className="px-4 py-2.5 text-right">Duração</th>
                    <th className="px-4 py-2.5 text-right">Sessões</th>
                    <th className="px-4 py-2.5 text-right">Valor</th>
                    <th className="px-4 py-2.5">Dosagem</th>
                    <th className="px-4 py-2.5">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {protocoloOrdenado.map((pr) => {
                    const regiao = pr.regiao as {
                      nome?: string;
                      grupo?: string | null;
                    } | null;
                    return (
                      <tr
                        key={pr.id}
                        className="border-b border-[var(--traco)] last:border-0 hover:bg-[var(--superficie-2)]"
                      >
                        <td className="px-4 py-3">
                          <span className="font-medium text-[var(--tinta-1)]">
                            {regiao?.nome ?? "—"}
                          </span>
                          <span className="mt-0.5 block text-[11.5px] text-[var(--tinta-3)]">
                            {regiao?.grupo ?? ""}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--tinta-2)]">
                          {pr.duracao_min ? (
                            <>{pr.duracao_min} min</>
                          ) : (
                            <Herdado>{proc.duracao_min} min</Herdado>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--tinta-2)]">
                          {pr.sessoes_padrao ?? <Herdado>{proc.sessoes_padrao}</Herdado>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--tinta-2)]">
                          {pr.valor_sessao !== null ? (
                            brlExato.format(Number(pr.valor_sessao))
                          ) : (
                            <Herdado>{brlExato.format(Number(proc.valor_sessao))}</Herdado>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {pr.unidade === "sessao" ? (
                            <span className="text-[var(--tinta-3)]">—</span>
                          ) : (
                            <Etiqueta tom="marca">
                              {Number(pr.quantidade_padrao)}{" "}
                              {ROTULO_UNIDADE[pr.unidade] ?? pr.unidade}
                            </Etiqueta>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <AcoesProtocolo
                            procedimentoId={id}
                            regioes={(regioes ?? []) as RegiaoOpcao[]}
                            protocolo={pr as unknown as Protocolo}
                            nomeRegiao={regiao?.nome ?? "região"}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="titulo-md">Tabela de custos</h2>
          <FormularioCusto procedimentoId={id} />
        </div>

        {(custos ?? []).length === 0 ? (
          <Vazio>Nenhum custo cadastrado para este procedimento.</Vazio>
        ) : (
          <div className="cartao overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--traco)] text-left ">
                <tr className="text-[var(--tinta-3)]">
                  <th className="px-4 py-2.5 font-medium">Descrição</th>
                  <th className="px-4 py-2.5 font-medium">Tipo</th>
                  <th className="px-4 py-2.5 text-right font-medium">Unitário</th>
                  <th className="px-4 py-2.5 text-right font-medium">Qtd</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(custos ?? []).map((c) => (
                  <tr key={c.id} className="border-b border-[var(--traco)] last:border-0 ">
                    <td className="px-4 py-2.5 font-medium">{c.descricao}</td>
                    <td className="px-4 py-2.5 text-[var(--tinta-2)]">
                      {ROTULO_TIPO[c.tipo] ?? c.tipo}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {brlExato.format(Number(c.valor_unitario))}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{Number(c.quantidade)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {brlExato.format(Number(c.valor_unitario) * Number(c.quantidade))}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <RemoverCusto id={c.id} procedimentoId={id} descricao={c.descricao} />
                    </td>
                  </tr>
                ))}
                <tr className="bg-[var(--superficie-2)] font-medium ">
                  <td className="px-4 py-2.5" colSpan={4}>
                    Custo direto por sessão
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {brlExato.format(margem.custoInsumos)}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-[var(--tinta-3)]">
          O custo/hora dos aparelhos entra separadamente, no cadastro de cada equipamento,
          proporcional à duração da sessão.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">Recursos exigidos</h2>
            <p className="text-xs text-[var(--tinta-3)]">
              Por modelo, não por unidade: o sistema acha sozinho qual aparelho está livre.
            </p>
          </div>
          <FormularioRequisito procedimentoId={id} modelos={modelosUnicos} />
        </div>

        {(requisitos ?? []).length === 0 ? (
          <Vazio>
            Nenhum recurso exigido. A agenda não vai pré-selecionar equipamento para este
            procedimento.
          </Vazio>
        ) : (
          <ul className="space-y-1.5">
            {(requisitos ?? []).map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-[var(--traco)] px-4 py-2.5 text-sm "
              >
                <span>
                  <span className="font-medium">{r.modelo ?? r.recurso_id}</span>
                  <span className="ml-2 text-[var(--tinta-3)]">
                    {r.quantidade} unidade(s) · {r.recurso_tipo}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Etiqueta>{r.obrigatorio ? "Obrigatório" : "Opcional"}</Etiqueta>
                  <RemoverRequisito
                    id={r.id}
                    procedimentoId={id}
                    modelo={r.modelo ?? "recurso"}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("procedimento").select("nome").eq("id", id).maybeSingle();
  return { title: data?.nome ?? "Procedimento" };
}
