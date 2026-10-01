import { describe, expect, it } from "vitest";
import { gerarCsv, nomeDeArquivo } from "@/lib/exportar/formato";

describe("gerarCsv", () => {
  const csv = gerarCsv({
    titulo: "x",
    colunas: [
      { chave: "nome", rotulo: "Nome" },
      { chave: "valor", rotulo: "Valor", tipo: "moeda" },
      { chave: "taxa", rotulo: "Ocupação", tipo: "pct" },
      { chave: "dia", rotulo: "Dia", tipo: "data" },
    ],
    linhas: [{ nome: 'Ana; "Bia"', valor: 1234.5, taxa: 0.256, dia: "2026-10-06" }],
  });

  it("começa com BOM e usa ponto e vírgula", () => {
    expect(csv.startsWith("﻿Nome;Valor;Ocupação (%);Dia")).toBe(true);
  });

  it("formata moeda, percentual e data no padrão brasileiro", () => {
    expect(csv.split("\r\n")[1]).toBe('"Ana; ""Bia""";1234,50;25,6;06/10/2026');
  });
});

describe("nomeDeArquivo", () => {
  it("tira acento e espaço", () => {
    expect(nomeDeArquivo("Comissões · 2026-10")).toBe("comissoes-2026-10");
  });
});
