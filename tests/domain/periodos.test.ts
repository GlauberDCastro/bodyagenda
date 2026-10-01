import { describe, expect, it } from "vitest";
import { atalhosDePeriodo, periodoAnterior } from "@/lib/periodos";

describe("atalhosDePeriodo", () => {
  // Quarta, 14/10/2026.
  const a = Object.fromEntries(atalhosDePeriodo("2026-10-14").map((x) => [x.chave, x]));

  it("hoje é só o dia", () => {
    expect([a.hoje.de, a.hoje.ate]).toEqual(["2026-10-14", "2026-10-14"]);
  });
  it("semana vai de segunda a domingo", () => {
    expect([a.semana.de, a.semana.ate]).toEqual(["2026-10-12", "2026-10-18"]);
  });
  it("mês vai do dia 1 ao último dia", () => {
    expect([a.mes.de, a.mes.ate]).toEqual(["2026-10-01", "2026-10-31"]);
  });
  it("mês passado atravessa o ano", () => {
    const jan = Object.fromEntries(atalhosDePeriodo("2027-01-05").map((x) => [x.chave, x]));
    expect([jan.mes_passado.de, jan.mes_passado.ate]).toEqual(["2026-12-01", "2026-12-31"]);
  });
});

describe("periodoAnterior", () => {
  it("é o intervalo de mesmo tamanho logo antes", () => {
    expect(periodoAnterior("2026-10-12", "2026-10-18")).toEqual({ de: "2026-10-05", ate: "2026-10-11" });
    expect(periodoAnterior("2026-10-01", "2026-10-31")).toEqual({ de: "2026-08-31", ate: "2026-09-30" });
  });
});
