import { describe, it, expect } from "vitest";
import { calcularMargem, valorPorSessao } from "@/lib/domain/margem";

describe("D-11 · pacote fechado", () => {
  it("R$ 799 por 8 sessões sai a R$ 99,88 a sessão", () => {
    // A tabela da Body Prime traz "R$ 799 / 8 sessões" como PACOTE inteiro.
    // Tratar os 799 como preço de sessão inflaria a receita em 8x.
    expect(valorPorSessao(799, 8)).toBe(99.88);
  });

  it("desconta antes de dividir", () => {
    expect(valorPorSessao(1000, 10, 200)).toBe(80);
  });

  it("não divide por zero", () => {
    expect(valorPorSessao(799, 0)).toBe(0);
  });
});

describe("RN-04 · margem do procedimento", () => {
  it("desconta insumos, custo de recurso e comissão", () => {
    // Fotona: R$ 999 em 15 min, R$ 100 de insumo, aparelho a R$ 60/h,
    // comissão de 10%.
    const r = calcularMargem({
      valorSessao: 999,
      duracaoMin: 15,
      custos: [{ valor_unitario: 100, quantidade: 1 }],
      custoHoraEquipamento: 60,
      comissaoPct: 10,
    });

    expect(r.custoInsumos).toBe(100);
    expect(r.custoRecursos).toBe(15); // 60/h × 0,25h
    expect(r.custoDireto).toBe(115);
    expect(r.comissao).toBe(99.9);
    expect(r.margem).toBe(784.1);
  });

  it("margem por hora normaliza durações diferentes", () => {
    const curto = calcularMargem({
      valorSessao: 799, duracaoMin: 15, custos: [],
    });
    const longo = calcularMargem({
      valorSessao: 1390, duracaoMin: 40, custos: [],
    });

    // O longo fatura quase o dobro, mas o curto rende mais por hora de sala.
    expect(longo.margem).toBeGreaterThan(curto.margem);
    expect(curto.margemPorHora!).toBeGreaterThan(longo.margemPorHora!);
    expect(curto.margemPorHora).toBe(3196);
    expect(longo.margemPorHora).toBe(2085);
  });

  it("reproduz o Anexo B do PRD: CM Slim rende 20x menos por hora", () => {
    const fotona = calcularMargem({ valorSessao: 999, duracaoMin: 15, custos: [] });
    const cmSlim = calcularMargem({
      valorSessao: valorPorSessao(799, 8),
      duracaoMin: 30,
      custos: [],
    });

    expect(fotona.receitaPorHora).toBe(3996);
    expect(cmSlim.receitaPorHora).toBe(199.76);
    expect(fotona.receitaPorHora! / cmSlim.receitaPorHora!).toBeGreaterThan(19);
  });

  it("comissão fixa tem precedência sobre percentual", () => {
    const r = calcularMargem({
      valorSessao: 1000, duracaoMin: 60, custos: [],
      comissaoFixa: 50, comissaoPct: 10,
    });
    expect(r.comissao).toBe(50);
  });

  it("margem negativa é reportada, não zerada", () => {
    // Procedimento vendido no prejuízo precisa aparecer como prejuízo.
    const r = calcularMargem({
      valorSessao: 100, duracaoMin: 60,
      custos: [{ valor_unitario: 150, quantidade: 1 }],
    });
    expect(r.margem).toBe(-50);
    expect(r.margemPct).toBe(-0.5);
  });

  it("receita zero não vira divisão por zero", () => {
    const r = calcularMargem({ valorSessao: 0, duracaoMin: 30, custos: [] });
    expect(r.margemPct).toBeNull();
  });
});
