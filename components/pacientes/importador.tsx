"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { conferirImportacao, importarPacientes, type Pulado } from "@/lib/actions/importacao";
import {
  analisarLinha,
  CAMPOS,
  LOTE_IMPORTACAO,
  repetidosNaPlanilha,
  sugerirMapeamento,
  type LinhaAnalisada,
  type Mapeamento,
  type PacienteImportado,
} from "@/lib/importacao/pacientes";
import { Aviso, Botao, Select } from "@/components/ui/primitivos";
import { formatarCpf } from "@/lib/domain/cpf";

type Etapa = "arquivo" | "colunas" | "revisao" | "gravando" | "concluido";

const MODELO =
  "data:text/csv;charset=utf-8," +
  encodeURIComponent(
    "﻿Nome;CPF;Telefone;E-mail;Nascimento;Endereço;Observações\r\n" +
      "Maria da Silva;529.982.247-25;(11) 98765-4321;maria@exemplo.com;14/03/1988;Rua das Flores, 10 — São Paulo/SP;Alergia a dipirona\r\n",
  );

/** Valor para a prévia: CPF e data no formato brasileiro. */
function exibir(campo: string, valor: string): string {
  if (campo === "cpf" && /^\d{11}$/.test(valor)) return formatarCpf(valor);
  if (campo === "data_nascimento" && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return valor.split("-").reverse().join("/");
  }
  return valor.trim();
}

const lotes = <T,>(lista: T[]) =>
  Array.from({ length: Math.ceil(lista.length / LOTE_IMPORTACAO) }, (_, i) =>
    lista.slice(i * LOTE_IMPORTACAO, (i + 1) * LOTE_IMPORTACAO),
  );

function Passos({ etapa }: { etapa: Etapa }) {
  const ordem: [Etapa, string][] = [
    ["arquivo", "Arquivo"],
    ["colunas", "Colunas"],
    ["revisao", "Revisão"],
    ["concluido", "Importação"],
  ];
  const atual = etapa === "gravando" ? 3 : ordem.findIndex(([e]) => e === etapa);
  return (
    <ol className="flex flex-wrap gap-2 text-[13.5px]">
      {ordem.map(([e, rotulo], i) => (
        <li
          key={e}
          aria-current={i === atual ? "step" : undefined}
          className={`rounded-full px-3.5 py-1.5 ${
            i === atual
              ? "bg-[var(--superficie-inversa)] font-medium text-[var(--tinta-inversa)]"
              : i < atual
                ? "bg-[var(--superficie)] text-[var(--tinta-1)]"
                : "text-[var(--tinta-3)]"
          }`}
        >
          {i + 1}. {rotulo}
        </li>
      ))}
    </ol>
  );
}

function ListaProblemas({ itens, vazio }: { itens: Pulado[]; vazio: string }) {
  if (itens.length === 0) return <p className="text-[13.5px] text-[var(--tinta-3)]">{vazio}</p>;
  return (
    <div className="max-h-80 overflow-y-auto rounded-[var(--r-md)] border border-[var(--traco)]">
      <table className="w-full text-[13.5px]">
        <thead className="sticky top-0 bg-[var(--superficie)] text-left text-[12.5px] text-[var(--tinta-3)]">
          <tr>
            <th className="w-20 px-3 py-2 font-medium">Linha</th>
            <th className="px-3 py-2 font-medium">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {itens.slice(0, 500).map((p) => (
            <tr key={`${p.linha}-${p.motivo}`} className="border-t border-[var(--traco)]">
              <td className="px-3 py-1.5 tabular-nums">{p.linha}</td>
              <td className="px-3 py-1.5">{p.motivo}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {itens.length > 500 && (
        <p className="border-t border-[var(--traco)] px-3 py-2 text-[12.5px] text-[var(--tinta-3)]">
          E mais {itens.length - 500}.
        </p>
      )}
    </div>
  );
}

/**
 * Importação de pacientes por planilha. Nada é gravado antes da revisão;
 * reimportar a mesma planilha não duplica ninguém.
 */
export function Importador() {
  const [etapa, setEtapa] = useState<Etapa>("arquivo");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [arquivo, setArquivo] = useState("");
  const [cabecalho, setCabecalho] = useState<string[]>([]);
  const [corpo, setCorpo] = useState<string[][]>([]);
  const [mapa, setMapa] = useState<Mapeamento | null>(null);
  const [jaExistem, setJaExistem] = useState<Pulado[]>([]);
  const [progresso, setProgresso] = useState(0);
  const [resultado, setResultado] = useState<{ inseridos: number; pulados: Pulado[] } | null>(null);
  const [aba, setAba] = useState<"existentes" | "repetidos" | "erros" | "avisos">("existentes");

  // Análise local: normalização, erros e repetidos dentro da planilha.
  const analise = useMemo(() => {
    if (!mapa) return null;
    const linhas: LinhaAnalisada[] = corpo.map((c, i) => analisarLinha(c, mapa, i + 2));
    const validos = linhas.map((l) => l.dados).filter((d): d is PacienteImportado => !!d);
    const repetidos = repetidosNaPlanilha(validos);
    return {
      linhas,
      unicos: validos.filter((v) => !repetidos.has(v.linha)),
      repetidos: [...repetidos].map(([linha, motivo]) => ({ linha, motivo })),
      erros: linhas
        .filter((l) => l.erros.length > 0)
        .map((l) => ({ linha: l.linha, motivo: l.erros.join("; ") })),
      avisos: linhas
        .filter((l) => l.dados && l.avisos.length > 0)
        .map((l) => ({ linha: l.linha, motivo: l.avisos.join("; ") })),
    };
  }, [corpo, mapa]);

  const linhasExistentes = new Set(jaExistem.map((p) => p.linha));
  const prontos = analise?.unicos.filter((u) => !linhasExistentes.has(u.linha)) ?? [];

  async function enviarArquivo(f: File) {
    setErro(null);
    setCarregando(true);
    setArquivo(f.name);
    const dados = new FormData();
    dados.set("arquivo", f);
    try {
      const r = await fetch("/api/importar/planilha", { method: "POST", body: dados });
      const corpoResposta = await r.json();
      if (!r.ok) {
        setErro(corpoResposta.erro ?? "Não consegui ler o arquivo.");
        return;
      }
      const [cab, ...resto] = corpoResposta.linhas as string[][];
      setCabecalho(cab.map((c) => c.trim()));
      setCorpo(resto);
      setMapa(sugerirMapeamento(cab));
      setEtapa("colunas");
    } catch {
      setErro("Falha de conexão ao enviar o arquivo. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  }

  async function revisar() {
    if (!analise) return;
    setCarregando(true);
    setErro(null);
    try {
      const existentes: Pulado[] = [];
      for (const lote of lotes(analise.unicos))
        existentes.push(...(await conferirImportacao(lote)));
      setJaExistem(existentes);
      setAba(existentes.length ? "existentes" : analise.erros.length ? "erros" : "avisos");
      setEtapa("revisao");
    } catch {
      setErro("Falha de conexão ao conferir os cadastros. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  }

  async function gravar() {
    setEtapa("gravando");
    setProgresso(0);
    let inseridos = 0;
    const pulados: Pulado[] = [];
    const todos = lotes(prontos);
    for (let i = 0; i < todos.length; i++) {
      try {
        const r = await importarPacientes(todos[i]);
        if (r.erro) {
          setErro(r.erro);
          setEtapa("revisao");
          return;
        }
        inseridos += r.inseridos;
        pulados.push(...r.pulados);
      } catch {
        // Lotes anteriores já foram gravados; reimportar a planilha pula quem já entrou.
        pulados.push(
          ...todos[i].map((p) => ({
            linha: p.linha,
            motivo: "Falha de conexão — importe de novo",
          })),
        );
      }
      setProgresso((i + 1) / todos.length);
    }
    setResultado({ inseridos, pulados });
    setEtapa("concluido");
  }

  const reiniciar = () => {
    setEtapa("arquivo");
    setMapa(null);
    setCorpo([]);
    setJaExistem([]);
    setResultado(null);
    setErro(null);
  };

  return (
    <div className="space-y-6">
      <Passos etapa={etapa} />
      {erro && <Aviso tom="critico">{erro}</Aviso>}

      {etapa === "arquivo" && (
        <div className="cartao max-w-2xl space-y-5 p-6">
          <div className="space-y-2 text-[15px] text-[var(--tinta-2)]">
            <p>
              Envie a lista de pacientes em <strong>Excel (.xlsx)</strong> ou <strong>CSV</strong>,
              com os nomes das colunas na primeira linha. Só o nome é obrigatório.
            </p>
            <p>Nada é gravado antes da revisão, e quem já está cadastrado é pulado.</p>
          </div>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[var(--r-lg)] border-2 border-dashed border-[var(--traco-forte)] px-6 py-10 text-center transition-colors hover:bg-[var(--superficie-2)]">
            <span className="text-[15px] font-medium">
              {carregando ? `Lendo ${arquivo}…` : "Escolher planilha"}
            </span>
            <span className="text-[13px] text-[var(--tinta-3)]">.xlsx ou .csv, até 5 MB</span>
            <input
              type="file"
              accept=".xlsx,.csv,.txt"
              className="sr-only"
              aria-label="Planilha de pacientes"
              disabled={carregando}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) enviarArquivo(f);
                e.target.value = "";
              }}
            />
          </label>
          <a
            href={MODELO}
            download="modelo-pacientes.csv"
            className="inline-block text-[13.5px] font-medium text-[var(--marca)] hover:underline"
          >
            Baixar planilha modelo
          </a>
        </div>
      )}

      {etapa === "colunas" && mapa && (
        <div className="space-y-5">
          <div className="cartao space-y-4 p-6">
            <div>
              <h2 className="titulo-md">Qual coluna é cada dado?</h2>
              <p className="mt-1 text-[14px] text-[var(--tinta-2)]">
                {arquivo}: {corpo.length} linha(s). Reconheci as colunas pelo nome; confira e
                ajuste.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CAMPOS.map((c) => (
                <label key={c.chave} className="space-y-1.5">
                  <span className="block text-[13px] font-medium">
                    {c.rotulo}
                    {c.obrigatorio && <span className="text-[var(--tinta-3)]"> (obrigatório)</span>}
                  </span>
                  <Select
                    aria-label={`Coluna de ${c.rotulo}`}
                    value={mapa[c.chave] ?? ""}
                    onChange={(e) =>
                      setMapa({
                        ...mapa,
                        [c.chave]: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  >
                    <option value="">Não importar</option>
                    {cabecalho.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Coluna ${i + 1}`}
                        {corpo[0]?.[i] ? ` — ex.: ${corpo[0][i].slice(0, 30)}` : ""}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
            </div>
          </div>

          {analise && (
            <div className="cartao overflow-x-auto">
              <p className="px-5 pt-4 text-[13px] text-[var(--tinta-3)]">
                Prévia das primeiras linhas, já ajustadas
              </p>
              <table className="w-full text-[13.5px]">
                <thead className="text-left text-[12.5px] text-[var(--tinta-3)]">
                  <tr>
                    <th className="px-5 py-2 font-medium">Linha</th>
                    {CAMPOS.filter((c) => mapa[c.chave] !== null).map((c) => (
                      <th key={c.chave} className="px-3 py-2 font-medium">
                        {c.rotulo}
                      </th>
                    ))}
                    <th className="px-3 py-2 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {analise.linhas.slice(0, 6).map((l) => (
                    <tr key={l.linha} className="border-t border-[var(--traco)]">
                      <td className="px-5 py-2 tabular-nums">{l.linha}</td>
                      {CAMPOS.filter((c) => mapa[c.chave] !== null).map((c) => (
                        <td key={c.chave} className="max-w-56 truncate px-3 py-2">
                          {exibir(
                            c.chave,
                            l.dados?.[c.chave] ?? corpo[l.linha - 2]?.[mapa[c.chave]!] ?? "",
                          ) || <span className="text-[var(--tinta-3)]">—</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        {l.erros.length ? (
                          <span style={{ color: "var(--status-critico)" }}>
                            {l.erros.join("; ")}
                          </span>
                        ) : l.avisos.length ? (
                          <span className="text-[var(--tinta-2)]">{l.avisos.join("; ")}</span>
                        ) : (
                          "OK"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap justify-between gap-2">
            <Botao type="button" variante="fantasma" onClick={reiniciar}>
              Trocar arquivo
            </Botao>
            <Botao type="button" onClick={revisar} disabled={mapa.nome === null || carregando}>
              {carregando ? "Conferindo cadastros…" : "Revisar importação"}
            </Botao>
          </div>
        </div>
      )}

      {(etapa === "revisao" || etapa === "gravando") && analise && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { rotulo: "Prontos para importar", valor: prontos.length, destaque: true },
              { rotulo: "Já cadastrados (pulados)", valor: jaExistem.length },
              { rotulo: "Repetidos na planilha", valor: analise.repetidos.length },
              { rotulo: "Com erro (pulados)", valor: analise.erros.length },
            ].map((k) => (
              <div key={k.rotulo} className="cartao px-5 py-4">
                <p className="text-[13px] text-[var(--tinta-3)]">{k.rotulo}</p>
                <p
                  className={`mt-1 text-[26px] font-semibold tabular-nums ${k.destaque ? "" : "text-[var(--tinta-2)]"}`}
                >
                  {k.valor}
                </p>
              </div>
            ))}
          </div>

          <div className="cartao space-y-3 p-5">
            <nav aria-label="Detalhes da revisão" className="flex flex-wrap gap-1">
              {(
                [
                  ["existentes", `Já cadastrados (${jaExistem.length})`],
                  ["repetidos", `Repetidos (${analise.repetidos.length})`],
                  ["erros", `Com erro (${analise.erros.length})`],
                  ["avisos", `Entram com ajuste (${analise.avisos.length})`],
                ] as const
              ).map(([chave, rotulo]) => (
                <button
                  key={chave}
                  type="button"
                  onClick={() => setAba(chave)}
                  aria-pressed={aba === chave}
                  className={`rounded-full px-3.5 py-1.5 text-[13.5px] ${
                    aba === chave
                      ? "bg-[var(--superficie-inversa)] text-[var(--tinta-inversa)]"
                      : "text-[var(--tinta-2)] hover:bg-[var(--superficie-2)]"
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </nav>
            <ListaProblemas
              itens={
                {
                  existentes: jaExistem,
                  repetidos: analise.repetidos,
                  erros: analise.erros,
                  avisos: analise.avisos,
                }[aba]
              }
              vazio="Nada aqui."
            />
          </div>

          {etapa === "gravando" ? (
            <div className="cartao space-y-2 p-5" role="status">
              <p className="text-[14px] font-medium">Importando… {Math.round(progresso * 100)}%</p>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--superficie-2)]">
                <div
                  className="h-full bg-[var(--serie-1)] transition-[width]"
                  style={{ width: `${progresso * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Botao type="button" variante="fantasma" onClick={() => setEtapa("colunas")}>
                Voltar às colunas
              </Botao>
              <Botao type="button" onClick={gravar} disabled={prontos.length === 0}>
                Importar {prontos.length} paciente(s)
              </Botao>
            </div>
          )}
        </div>
      )}

      {etapa === "concluido" && resultado && (
        <div className="cartao max-w-2xl space-y-4 p-6">
          <h2 className="titulo-lg">{resultado.inseridos} paciente(s) importado(s)</h2>
          <p className="text-[14.5px] text-[var(--tinta-2)]">
            Todos entram com o consentimento LGPD pendente: colha a assinatura na primeira visita.
          </p>
          {resultado.pulados.length > 0 && (
            <>
              <p className="text-[14px] font-medium">
                {resultado.pulados.length} linha(s) não entraram nesta etapa:
              </p>
              <ListaProblemas itens={resultado.pulados} vazio="" />
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Link
              href="/pacientes"
              className="rounded-full bg-[var(--superficie-inversa)] px-4 py-2.5 text-[13.5px] font-medium text-[var(--tinta-inversa)]"
            >
              Ver pacientes
            </Link>
            <Botao type="button" variante="secundario" onClick={reiniciar}>
              Importar outra planilha
            </Botao>
          </div>
        </div>
      )}
    </div>
  );
}
