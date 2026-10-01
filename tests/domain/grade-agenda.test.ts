import { describe, expect, it } from "vitest";
import {
  minutoNaGrade,
  deslocamentoEmMinutos,
  horarioLocal,
  podeArrastar,
  dentroDoExpedienteExibido,
  diasDaSemana,
  distribuirEmFaixas,
  somarDias,
} from "@/lib/grade-agenda";

// Grade das 08:00, 56 px por hora, passo de 15 min.
const G = { horaInicio: 8, alturaHora: 56, passo: 15 };

describe("minutoNaGrade", () => {
  it("clique no topo é 08:00", () => {
    expect(minutoNaGrade(0, G)).toBe(8 * 60);
  });

  it("arredonda para baixo no passo de 15 min", () => {
    // 1 h e 20 min abaixo do topo → 09:15
    expect(minutoNaGrade(56 + (20 / 60) * 56, G)).toBe(9 * 60 + 15);
  });
});

describe("deslocamentoEmMinutos", () => {
  it("encaixa no passo mais próximo, para cima e para baixo", () => {
    expect(deslocamentoEmMinutos(56, G)).toBe(60);
    expect(deslocamentoEmMinutos(-14, G)).toBe(-15);
    expect(deslocamentoEmMinutos(5, G)).toBe(0);
  });
});

describe("horarioLocal", () => {
  it("monta o datetime-local do dia", () => {
    expect(horarioLocal("2026-10-06", 9 * 60 + 5)).toBe("2026-10-06T09:05");
  });
});

describe("podeArrastar", () => {
  it("só o que ainda vai acontecer pode ser arrastado", () => {
    expect(podeArrastar("agendado")).toBe(true);
    expect(podeArrastar("confirmado")).toBe(true);
    expect(podeArrastar("realizado")).toBe(false);
    expect(podeArrastar("falta")).toBe(false);
    expect(podeArrastar("em_atendimento")).toBe(false);
  });
});

describe("dentroDoExpedienteExibido", () => {
  it("recusa soltar antes do início ou passando do fim da grade", () => {
    expect(dentroDoExpedienteExibido(7 * 60 + 45, 30, 8, 19)).toBe(false);
    expect(dentroDoExpedienteExibido(18 * 60 + 45, 30, 8, 19)).toBe(false);
    expect(dentroDoExpedienteExibido(18 * 60 + 30, 30, 8, 19)).toBe(true);
  });
});

describe("diasDaSemana", () => {
  it("começa na segunda, mesmo partindo de quarta ou domingo", () => {
    expect(diasDaSemana("2026-10-07")).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
    expect(diasDaSemana("2026-10-11")[0]).toBe("2026-10-05");
  });

  it("atravessa a virada do mês", () => {
    expect(diasDaSemana("2026-11-01")).toContain("2026-10-26");
  });
});

describe("somarDias", () => {
  it("soma e subtrai sem depender do fuso", () => {
    expect(somarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(somarDias("2026-10-05", -7)).toBe("2026-09-28");
  });
});

describe("distribuirEmFaixas", () => {
  it("atendimentos sem sobreposição ocupam a largura inteira", () => {
    const r = distribuirEmFaixas([
      { id: "a", inicio: 540, fim: 570 },
      { id: "b", inicio: 570, fim: 600 },
    ]);
    expect(r.get("a")).toEqual({ faixa: 0, total: 1 });
    expect(r.get("b")).toEqual({ faixa: 0, total: 1 });
  });

  it("sobrepostos ficam lado a lado, e a faixa livre é reaproveitada", () => {
    const r = distribuirEmFaixas([
      { id: "a", inicio: 540, fim: 600 },
      { id: "b", inicio: 550, fim: 580 },
      { id: "c", inicio: 585, fim: 620 },
    ]);
    expect(r.get("a")).toEqual({ faixa: 0, total: 2 });
    expect(r.get("b")).toEqual({ faixa: 1, total: 2 });
    // b terminou às 580: c reaproveita a faixa 1.
    expect(r.get("c")).toEqual({ faixa: 1, total: 2 });
  });
});
