import { describe, expect, it } from "vitest";
import { diferencas, rotuloDoRegistro } from "@/lib/auditoria";

describe("diferencas", () => {
  it("lista só os campos que mudaram, sem os automáticos", () => {
    expect(
      diferencas(
        { nome: "Sala 1", numero: 1, updated_at: "a" },
        { nome: "Sala Fotona", numero: 1, updated_at: "b" },
      ),
    ).toEqual([{ campo: "nome", antes: "Sala 1", depois: "Sala Fotona" }]);
  });

  it("criação e exclusão não têm diferença", () => {
    expect(diferencas(null, { nome: "x" })).toEqual([]);
  });
});

describe("rotuloDoRegistro", () => {
  it("prefere nome, depois descrição", () => {
    expect(rotuloDoRegistro({ nome: "Ana", descricao: "x" })).toBe("Ana");
    expect(rotuloDoRegistro({ descricao: "Aluguel" })).toBe("Aluguel");
    expect(rotuloDoRegistro({ inicio: "2026-10-06T09:00:00-03:00" })).toBe("2026-10-06 09:00");
  });
});
