import { describe, expect, it } from "vitest";
import {
  analisarLinha,
  chaveHomonimo,
  formatarTelefone,
  lerCsv,
  lerData,
  repetidosNaPlanilha,
  sugerirMapeamento,
  type Mapeamento,
} from "@/lib/importacao/pacientes";

const HOJE = new Date("2026-10-02T12:00:00Z");

describe("lerCsv", () => {
  it("CSV do Excel brasileiro: ponto e vírgula, BOM e aspas", () => {
    const texto = '﻿Nome;Obs\r\n"Silva; Maria";"disse ""oi"""\r\nJoão;\r\n\r\n';
    expect(lerCsv(texto)).toEqual([
      ["Nome", "Obs"],
      ["Silva; Maria", 'disse "oi"'],
      ["João", ""],
    ]);
  });

  it("vírgula também é aceita, e quebra de linha dentro de aspas fica no campo", () => {
    expect(lerCsv('nome,endereco\nAna,"Rua A\nap 2"')).toEqual([
      ["nome", "endereco"],
      ["Ana", "Rua A\nap 2"],
    ]);
  });
});

describe("sugerirMapeamento", () => {
  it("reconhece os nomes de coluna mais comuns", () => {
    expect(
      sugerirMapeamento(["Paciente", "Celular", "Dt. Nasc.", "E-mail", "CPF", "Obs", "Plano"]),
    ).toEqual({
      nome: 0,
      telefone: 1,
      data_nascimento: 2,
      email: 3,
      cpf: 4,
      observacoes: 5,
      endereco: null,
    });
  });
});

describe("lerData", () => {
  it("dd/mm/aaaa, aaaa-mm-dd, ano curto e série do Excel", () => {
    expect(lerData("14/03/1988", HOJE)).toBe("1988-03-14");
    expect(lerData("1988-03-14", HOJE)).toBe("1988-03-14");
    expect(lerData("14/03/88", HOJE)).toBe("1988-03-14");
    expect(lerData("05/01/05", HOJE)).toBe("2005-01-05");
    expect(lerData("32216", HOJE)).toBe("1988-03-14");
  });

  it("recusa data impossível e data no futuro", () => {
    expect(lerData("31/02/1990", HOJE)).toBeNull();
    expect(lerData("01/01/2030", HOJE)).toBeNull();
    expect(lerData("ontem", HOJE)).toBeNull();
  });
});

describe("formatarTelefone", () => {
  it("formata celular, fixo e tira o +55", () => {
    expect(formatarTelefone("11987654321")).toBe("(11) 98765-4321");
    expect(formatarTelefone("+55 11 98765-4321")).toBe("(11) 98765-4321");
    expect(formatarTelefone("1133334444")).toBe("(11) 3333-4444");
    expect(formatarTelefone("98765-4321")).toBe("98765-4321");
  });
});

describe("analisarLinha", () => {
  const mapa: Mapeamento = {
    nome: 0,
    cpf: 1,
    telefone: 2,
    email: 3,
    data_nascimento: 4,
    endereco: null,
    observacoes: null,
  };

  it("normaliza a linha válida", () => {
    const r = analisarLinha(
      ["  Mariana   Alves ", "529.982.247-25", "11987654321", "MARI@EXEMPLO.COM", "14/03/1988"],
      mapa,
      2,
      HOJE,
    );
    expect(r.erros).toEqual([]);
    expect(r.dados).toMatchObject({
      linha: 2,
      nome: "Mariana Alves",
      cpf: "52998224725",
      telefone: "(11) 98765-4321",
      email: "mari@exemplo.com",
      data_nascimento: "1988-03-14",
    });
  });

  it("devolve o zero à esquerda que o Excel tirou do CPF", () => {
    // 01234567890 lido como número vira 1234567890.
    const r = analisarLinha(["Ana", "1234567890", "", "", ""], mapa, 3, HOJE);
    expect(r.dados?.cpf).toBe("01234567890");
  });

  it("sem nome ou CPF inválido não entra; e-mail e data ruins só viram aviso", () => {
    expect(analisarLinha(["", "", "", "", ""], mapa, 4, HOJE).erros).toContain("Sem nome");
    expect(analisarLinha(["Ana", "111.111.111-11", "", "", ""], mapa, 5, HOJE).dados).toBeNull();
    const r = analisarLinha(["Ana", "", "", "ana@", "31/02/1990"], mapa, 6, HOJE);
    expect(r.dados).toMatchObject({ email: null, data_nascimento: null });
    expect(r.avisos).toHaveLength(2);
  });
});

describe("chaveHomonimo", () => {
  it("ignora acento e caixa; sem nascimento não há chave", () => {
    expect(chaveHomonimo("JOSÉ da Silva", "1980-01-01")).toBe(
      chaveHomonimo("jose da silva", "1980-01-01"),
    );
    expect(chaveHomonimo("José", null)).toBeNull();
  });
});

describe("repetidosNaPlanilha", () => {
  const base = { telefone: null, email: null, endereco: null, observacoes: null };
  it("mesmo CPF ou mesmo nome + nascimento: só a primeira linha entra", () => {
    const r = repetidosNaPlanilha([
      { ...base, linha: 2, nome: "Ana", cpf: "52998224725", data_nascimento: null },
      { ...base, linha: 3, nome: "Ana Paula", cpf: "52998224725", data_nascimento: null },
      { ...base, linha: 4, nome: "José", cpf: null, data_nascimento: "1980-01-01" },
      { ...base, linha: 5, nome: "JOSE", cpf: null, data_nascimento: "1980-01-01" },
      { ...base, linha: 6, nome: "José", cpf: null, data_nascimento: null },
    ]);
    expect([...r.entries()]).toEqual([
      [3, "Repete a linha 2 da planilha"],
      [5, "Repete a linha 4 da planilha"],
    ]);
  });
});
