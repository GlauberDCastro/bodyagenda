import { describe, it, expect } from "vitest";
import {
  sobrepoe,
  subtrair,
  capacidadeHoras,
  calcularOcupacao,
  receitaPorHoraDisponivel,
  type Intervalo,
  type ReservaCalculo,
} from "@/lib/domain/ocupacao";

/** Helper: "09:00" -> Date no dia 2026-10-01. */
const h = (hora: string): Date => new Date(`2026-10-01T${hora}:00-03:00`);
const iv = (de: string, ate: string): Intervalo => ({ inicio: h(de), fim: h(ate) });

const DIA = iv("00:00", "23:59");
const EXPEDIENTE = [iv("08:00", "18:00")]; // 10h

describe("RN-01 · conflito de recurso", () => {
  it("detecta sobreposição no mesmo recurso", () => {
    expect(sobrepoe(iv("14:00", "14:40"), iv("14:20", "15:00"))).toBe(true);
  });

  it("NÃO trata encosto como conflito (intervalo semiaberto)", () => {
    // Atendimento que termina às 10:00 não conflita com outro às 10:00.
    // Mesma semântica do tstzrange '[)' no Postgres.
    expect(sobrepoe(iv("09:00", "10:00"), iv("10:00", "11:00"))).toBe(false);
  });

  it("detecta contenção total", () => {
    expect(sobrepoe(iv("08:00", "18:00"), iv("10:00", "10:20"))).toBe(true);
  });
});

describe("RN-02 · capacidade", () => {
  it("soma a janela de atendimento sem bloqueios", () => {
    expect(capacidadeHoras(EXPEDIENTE, [])).toBe(10);
  });

  it("subtrai bloqueio de manutenção", () => {
    expect(capacidadeHoras(EXPEDIENTE, [iv("12:00", "14:00")])).toBe(8);
  });

  it("ignora a parte do bloqueio fora da janela", () => {
    // Bloqueio 06:00-09:00: só as 8h-9h estavam disponíveis.
    // Não se pode perder capacidade que não existia.
    expect(capacidadeHoras(EXPEDIENTE, [iv("06:00", "09:00")])).toBe(9);
  });

  it("lida com bloqueios sobrepostos sem contar duas vezes", () => {
    expect(
      capacidadeHoras(EXPEDIENTE, [iv("12:00", "14:00"), iv("13:00", "15:00")]),
    ).toBe(7);
  });

  it("parte a janela quando o bloqueio é interno", () => {
    const restante = subtrair(EXPEDIENTE, [iv("12:00", "13:00")]);
    expect(restante).toHaveLength(2);
    expect(restante[0].fim).toEqual(h("12:00"));
    expect(restante[1].inicio).toEqual(h("13:00"));
  });
});

describe("RN-03 · ocupação agendada x efetiva", () => {
  const reservas = (...rs: ReservaCalculo[]) => rs;

  it("conta realizado nas duas taxas", () => {
    const o = calcularOcupacao(
      EXPEDIENTE, [],
      reservas({ ...iv("09:00", "14:00"), status: "realizado" }),
      DIA,
    );
    expect(o.taxaAgendada).toBe(0.5);
    expect(o.taxaEfetiva).toBe(0.5);
  });

  it("falta conta como agendada mas NÃO como efetiva", () => {
    // A diferença entre as duas taxas é exatamente o custo do no-show.
    const o = calcularOcupacao(
      EXPEDIENTE, [],
      reservas({ ...iv("09:00", "14:00"), status: "falta" }),
      DIA,
    );
    expect(o.taxaAgendada).toBe(0.5);
    expect(o.taxaEfetiva).toBe(0);
    expect(o.ociosidadeHoras).toBe(10);
  });

  it("cancelado não conta em nenhuma das duas", () => {
    const o = calcularOcupacao(
      EXPEDIENTE, [],
      reservas({ ...iv("09:00", "14:00"), status: "cancelado" }),
      DIA,
    );
    expect(o.taxaAgendada).toBe(0);
    expect(o.taxaEfetiva).toBe(0);
  });

  it("bloqueio reduz a capacidade e AUMENTA a taxa (CA-09)", () => {
    // Mesmas 5h ocupadas: sem bloqueio 50%, com 2h de manutenção 62,5%.
    const o = calcularOcupacao(
      EXPEDIENTE, [iv("12:00", "14:00")],
      reservas({ ...iv("09:00", "14:00"), status: "realizado" }),
      DIA,
    );
    expect(o.capacidadeHoras).toBe(8);
    expect(o.taxaEfetiva).toBe(0.625);
  });

  it("capacidade zero devolve null, não 0%", () => {
    // Recurso sem disponibilidade não tem ocupação "de 0%" — não tem base.
    const o = calcularOcupacao([], [], [], DIA);
    expect(o.taxaAgendada).toBeNull();
    expect(o.taxaEfetiva).toBeNull();
  });
});

describe("RN-08 · receita por hora disponível", () => {
  it("expõe o que a taxa de ocupação esconde (PRD Anexo B)", () => {
    // Sala 6 (Fotona): 4 sessões de 15 min a R$ 999 = 1h ocupada de 10h.
    const fotona = receitaPorHoraDisponivel(4 * 999, 10);
    // Sala 4 (CM Slim): 20 sessões de 30 min a R$ 99,88 = 10h ocupadas de 10h.
    const cmSlim = receitaPorHoraDisponivel(20 * 99.88, 10);

    expect(fotona).toBeCloseTo(399.6, 1);
    expect(cmSlim).toBeCloseTo(199.76, 1);

    // A sala 4 está 100% ocupada e a 6 apenas 10% — mas a 6 rende o dobro
    // por hora disponível. Ocupação sozinha levaria à decisão errada.
    expect(fotona!).toBeGreaterThan(cmSlim!);
  });

  it("sem capacidade não há receita por hora", () => {
    expect(receitaPorHoraDisponivel(1000, 0)).toBeNull();
  });
});
