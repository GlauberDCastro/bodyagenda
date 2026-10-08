"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  importarVendas,
  vendasJaImportadas,
  type PlanoParaGravar,
  type ResultadoImportacao,
} from "@/lib/actions/importacao-vendas";
import {
  chaveDaVenda,
  dividirValor,
  ehRetorno,
  lerRelatorioDePlanos,
  sem,
  sugerirServico,
  type PlanoImportado,
  type ProcedimentoDoCatalogo,
  type RegiaoDoCatalogo,
} from "@/lib/importacao/vendas";
import { Aviso, Botao, Select } from "@/components/ui/primitivos";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataCurta = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const LOTE = 25;

interface Usuario {
  id: string;
  nome: string;
  perfil: string;
}
type Ligacao = { procedimento_id: string; regiao_id: string };

/** Mesma pessoa: primeiro nome igual e mais um nome em comum. */
function usuarioParecido(nome: string, usuarios: Usuario[]): string {
  const t = sem(nome).split(" ");
  const achado = usuarios.find((u) => {
    const v = sem(u.nome).split(" ");
    return (
      sem(u.nome) === sem(nome) ||
      (v[0] === t[0] && v.slice(1).some((x) => x.length > 2 && t.includes(x)))
    );
  });
  return achado?.id ?? "";
}

function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div>
        <h2 className="titulo-md">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-[13px] text-[var(--tinta-2)]">{descricao}</p>}
      </div>
      {children}
    </section>
  );
}

export function ImportadorVendas({
  procedimentos,
  regioes,
  usuarios,
}: {
  procedimentos: ProcedimentoDoCatalogo[];
  regioes: RegiaoDoCatalogo[];
  usuarios: Usuario[];
}) {
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [planos, setPlanos] = useState<PlanoImportado[]>([]);
  const [servicos, setServicos] = useState<Record<string, Ligacao>>({});
  const [vendedores, setVendedores] = useState<Record<string, string>>({});
  const [importadas, setImportadas] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState<number | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);

  async function ler(f: File) {
    setErro(null);
    setResultado(null);
    setLendo(true);
    try {
      const corpo = new FormData();
      corpo.set("arquivo", f);
      const r = await fetch("/api/importar/planilha", { method: "POST", body: corpo });
      const json = (await r.json()) as { linhas?: string[][]; erro?: string };
      if (!r.ok || !json.linhas) throw new Error(json.erro ?? "Não consegui ler o arquivo.");
      const lido = lerRelatorioDePlanos(json.linhas);
      if (lido.erro) throw new Error(lido.erro);

      const lig: Record<string, Ligacao> = {};
      const vend: Record<string, string> = {};
      for (const p of lido.planos) {
        vend[p.vendedor] ??= usuarioParecido(p.vendedor, usuarios);
        for (const s of p.servicos) {
          if (lig[s.nome]) continue;
          const sug = sugerirServico(s.nome, procedimentos, regioes);
          lig[s.nome] = {
            procedimento_id: sug.procedimento_id ?? "",
            regiao_id: sug.regiao_id ?? "",
          };
        }
      }
      const chaves = lido.planos.flatMap((p) => p.servicos.map((s) => chaveDaVenda(p, s)));
      setImportadas(new Set(await vendasJaImportadas(chaves)));
      setServicos(lig);
      setVendedores(vend);
      setPlanos(lido.planos);
      setArquivo(f.name);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui ler o arquivo.");
    } finally {
      setLendo(false);
    }
  }

  const preco = useMemo(
    () => new Map(procedimentos.map((p) => [p.id, p.valor_sessao])),
    [procedimentos],
  );
  const nomeProc = useMemo(
    () => new Map(procedimentos.map((p) => [p.id, p.nome])),
    [procedimentos],
  );
  const nomeRegiao = useMemo(() => new Map(regioes.map((r) => [r.regiao_id, r.nome])), [regioes]);

  /** Cada plano com o que vai acontecer com ele. */
  const analise = useMemo(
    () =>
      planos.map((p) => {
        const valores = dividirValor(
          p.valorFinal ?? 0,
          p.servicos.map((s) => ({
            preco: preco.get(servicos[s.nome]?.procedimento_id ?? "") ?? 0,
            sessoes: s.sessoes,
            retorno: ehRetorno(s.nome),
          })),
        );
        const chaves = p.servicos.map((s) => chaveDaVenda(p, s));
        let motivo: string | null = null;
        if (sem(p.status) !== "aprovado")
          motivo = `Status “${p.status || "vazio"}” no sistema anterior`;
        else if (!p.dataVenda) motivo = "Sem data de venda";
        else if (p.valorFinal === null) motivo = "Sem valor";
        else if (p.servicos.length === 0) motivo = "Plano sem serviços";
        else if (p.servicos.some((s) => !servicos[s.nome]?.procedimento_id))
          motivo = "Serviço sem procedimento: escolha acima";
        else if (p.servicos.some((s) => s.feitas > 0))
          motivo = "Tem sessões já feitas no sistema anterior: lance à mão";
        const jaFoi = chaves.every((c) => importadas.has(c));
        return { p, valores, chaves, motivo, jaFoi };
      }),
    [planos, servicos, preco, importadas],
  );

  const prontas = analise.filter((a) => !a.motivo && !a.jaFoi);
  const total = prontas.reduce((t, a) => t + (a.p.valorFinal ?? 0), 0);
  const agendadas = prontas.reduce(
    (t, a) => t + a.p.servicos.reduce((x, s) => x + s.agendados, 0),
    0,
  );

  const nomesServico = useMemo(() => {
    const c = new Map<string, number>();
    planos.forEach((p) => p.servicos.forEach((s) => c.set(s.nome, (c.get(s.nome) ?? 0) + 1)));
    return [...c.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [planos]);
  const nomesVendedor = useMemo(() => {
    const c = new Map<string, number>();
    planos.forEach((p) => c.set(p.vendedor, (c.get(p.vendedor) ?? 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [planos]);

  async function gravar() {
    const lote: PlanoParaGravar[] = prontas.map(({ p, valores, chaves }) => ({
      linha: p.linha,
      cliente: p.cliente,
      dataVenda: p.dataVenda!,
      validade: p.validade,
      vendedor_id: vendedores[p.vendedor] || null,
      forma: p.forma,
      observacoes: [
        `Importado do sistema anterior · plano ${p.idExterno}`,
        p.vendedorAuxiliar && `Vendedor auxiliar: ${p.vendedorAuxiliar}`,
        !vendedores[p.vendedor] && p.vendedor && `Vendedor: ${p.vendedor}`,
        p.pagador && sem(p.pagador) !== sem(p.cliente) && `Pagador: ${p.pagador}`,
        p.observacao,
      ]
        .filter(Boolean)
        .join(" · "),
      itens: p.servicos.map((s, i) => ({
        chave: chaves[i],
        procedimento_id: servicos[s.nome].procedimento_id,
        regiao_id: servicos[s.nome].regiao_id || null,
        sessoes: s.sessoes,
        valor: valores[i],
      })),
    }));

    const soma: ResultadoImportacao = { importadas: 0, jaImportadas: 0, erros: [] };
    for (let i = 0; i < lote.length; i += LOTE) {
      setGravando(i);
      const r = await importarVendas(lote.slice(i, i + LOTE));
      if (r.erro) {
        soma.erro = r.erro;
        break;
      }
      soma.importadas += r.importadas;
      soma.jaImportadas += r.jaImportadas;
      soma.erros.push(...r.erros);
    }
    setGravando(null);
    setResultado(soma);
    setImportadas(new Set(await vendasJaImportadas(analise.flatMap((a) => a.chaves))));
  }

  if (!arquivo) {
    return (
      <div className="cartao max-w-2xl space-y-4 p-6">
        <p className="text-[14px] leading-relaxed text-[var(--tinta-2)]">
          No sistema anterior, exporte o{" "}
          <strong className="text-[var(--tinta-1)]">Relatório de Planos</strong> em Excel (.xls) e
          envie aqui. Nada é gravado antes da revisão, e o mesmo plano nunca entra duas vezes.
        </p>
        <label className="block">
          <span className="sr-only">Arquivo do relatório</span>
          <input
            type="file"
            accept=".xls,.xlsx,.csv"
            disabled={lendo}
            onChange={(e) => e.target.files?.[0] && ler(e.target.files[0])}
            className="block w-full text-[14px] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--superficie-inversa)] file:px-4 file:py-2 file:text-[13.5px] file:font-medium file:text-[var(--tinta-inversa)]"
          />
        </label>
        {lendo && <p className="text-[13.5px] text-[var(--tinta-2)]">Lendo o arquivo…</p>}
        {erro && <Aviso tom="critico">{erro}</Aviso>}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="cartao flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-[13px] text-[var(--tinta-2)]">{arquivo}</p>
          <p className="mt-0.5 text-[17px] font-semibold">
            {prontas.length} de {planos.length} planos prontos para importar · {brl.format(total)}
          </p>
          <p className="text-[13px] text-[var(--tinta-2)]">
            {prontas.reduce((t, a) => t + a.p.servicos.length, 0)} vendas (uma por serviço), já
            pagas. Contam nas metas na data da venda.
          </p>
        </div>
        <div className="flex gap-2">
          <Botao
            type="button"
            variante="secundario"
            onClick={() => {
              setArquivo(null);
              setPlanos([]);
              setResultado(null);
            }}
          >
            Trocar arquivo
          </Botao>
          <Botao
            type="button"
            variante="sucesso"
            disabled={prontas.length === 0 || gravando !== null}
            onClick={gravar}
          >
            {gravando !== null
              ? `Importando… ${Math.min(gravando + LOTE, prontas.length)} de ${prontas.length}`
              : `Importar ${prontas.length} planos`}
          </Botao>
        </div>
      </div>

      {resultado && (
        <Aviso tom={resultado.erro || resultado.erros.length ? "critico" : "neutro"}>
          {resultado.erro ?? (
            <>
              {resultado.importadas} venda(s) importada(s)
              {resultado.jaImportadas > 0 && `, ${resultado.jaImportadas} já existiam`}
              {resultado.erros.length > 0 &&
                `. Erros: ${resultado.erros.map((e) => `linha ${e.linha}: ${e.motivo}`).join("; ")}`}
              .{" "}
              <Link href="/gestao" className="font-medium underline underline-offset-4">
                Ver na Central 360
              </Link>
            </>
          )}
        </Aviso>
      )}
      {agendadas > 0 && (
        <Aviso>
          {agendadas} sessão(ões) destes planos já estão agendadas no sistema anterior. Depois de
          importar, agende-as aqui também, para que saiam do saldo do pacote.
        </Aviso>
      )}

      <Secao
        titulo="Procedimentos"
        descricao="Como cada serviço do sistema anterior entra aqui. Ajuste se alguma ligação estiver errada."
      >
        <div className="cartao overflow-x-auto p-0">
          <table className="w-full text-[14px]">
            <thead className="text-left text-[12.5px] text-[var(--tinta-2)]">
              <tr className="border-b border-[var(--traco)]">
                <th className="px-4 py-2.5 font-medium">No sistema anterior</th>
                <th className="w-64 px-3 py-2.5 font-medium">Procedimento</th>
                <th className="w-52 px-4 py-2.5 font-medium">Região</th>
              </tr>
            </thead>
            <tbody>
              {nomesServico.map(([nome, qtd]) => {
                const lig = servicos[nome];
                const daqui = regioes.filter((r) => r.procedimento_id === lig?.procedimento_id);
                return (
                  <tr key={nome} className="border-b border-[var(--traco)] last:border-0">
                    <td className="px-4 py-2">
                      {nome}
                      <span className="ml-1.5 text-[12.5px] text-[var(--tinta-3)]">×{qtd}</span>
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        aria-label={`Procedimento de ${nome}`}
                        value={lig?.procedimento_id ?? ""}
                        aria-invalid={!lig?.procedimento_id}
                        onChange={(e) =>
                          setServicos((s) => ({
                            ...s,
                            [nome]: { procedimento_id: e.target.value, regiao_id: "" },
                          }))
                        }
                      >
                        <option value="">Escolha…</option>
                        {procedimentos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nome}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-4 py-2">
                      {daqui.length > 0 ? (
                        <Select
                          aria-label={`Região de ${nome}`}
                          value={lig?.regiao_id ?? ""}
                          onChange={(e) =>
                            setServicos((s) => ({
                              ...s,
                              [nome]: { ...s[nome], regiao_id: e.target.value },
                            }))
                          }
                        >
                          <option value="">Não informar</option>
                          {daqui.map((r) => (
                            <option key={r.regiao_id} value={r.regiao_id}>
                              {r.nome}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <span className="text-[13px] text-[var(--tinta-3)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Secao>

      <Secao
        titulo="Quem vendeu"
        descricao="A venda entra no nome da pessoa da equipe e conta no “Quem vendeu”. O auxiliar fica na observação do pacote."
      >
        <div className="cartao divide-y divide-[var(--traco)] p-0">
          {nomesVendedor.map(([nome, qtd]) => (
            <div
              key={nome}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
            >
              <span className="text-[14px]">
                {nome || "Sem vendedor"}
                <span className="ml-1.5 text-[12.5px] text-[var(--tinta-3)]">{qtd} plano(s)</span>
              </span>
              <div className="w-72">
                <Select
                  aria-label={`Usuário de ${nome || "sem vendedor"}`}
                  value={vendedores[nome] ?? ""}
                  onChange={(e) => setVendedores((v) => ({ ...v, [nome]: e.target.value }))}
                >
                  <option value="">Ninguém da equipe (fica só o nome)</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome} · {u.perfil}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ))}
        </div>
      </Secao>

      <Secao
        titulo="Planos"
        descricao="O valor de planos com mais de um serviço é dividido pelo preço de tabela; retorno entra sem valor."
      >
        <div className="cartao overflow-x-auto p-0">
          <table className="w-full text-[13.5px]">
            <thead className="text-left text-[12.5px] text-[var(--tinta-2)]">
              <tr className="border-b border-[var(--traco)]">
                <th className="px-4 py-2.5 font-medium">Venda</th>
                <th className="px-3 py-2.5 font-medium">Paciente</th>
                <th className="px-3 py-2.5 font-medium">Serviços</th>
                <th className="px-3 py-2.5 text-right font-medium">Valor</th>
                <th className="px-4 py-2.5 text-right font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {analise.map(({ p, valores, motivo, jaFoi }) => (
                <tr
                  key={p.linha}
                  className="border-b border-[var(--traco)] align-top last:border-0"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                    {dataCurta(p.dataVenda)}
                    <span className="block text-[12px] text-[var(--tinta-3)]">linha {p.linha}</span>
                  </td>
                  <td className="px-3 py-2.5">{p.cliente}</td>
                  <td className="px-3 py-2.5">
                    {p.servicos.map((s, i) => {
                      const lig = servicos[s.nome];
                      return (
                        <span key={s.idExterno} className="block">
                          {nomeProc.get(lig?.procedimento_id ?? "") ?? "?"}
                          {lig?.regiao_id && ` · ${nomeRegiao.get(lig.regiao_id)}`}
                          <span className="text-[var(--tinta-2)]">
                            {" "}
                            · {s.sessoes} sessão(ões)
                            {p.servicos.length > 1 && ` · ${brl.format(valores[i])}`}
                          </span>
                        </span>
                      );
                    })}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    {p.valorFinal === null ? "—" : brl.format(p.valorFinal)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {jaFoi ? (
                      <span className="text-[12.5px] text-[var(--tinta-3)]">Já importado</span>
                    ) : motivo ? (
                      <span className="text-[12.5px]" style={{ color: "var(--status-critico)" }}>
                        {motivo}
                      </span>
                    ) : (
                      <span
                        className="text-[12.5px] font-medium"
                        style={{ color: "var(--status-bom)" }}
                      >
                        Pronto
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>
    </div>
  );
}
