import { describe, expect, it } from "vitest";
import { precoEfetivo, valorDaTabela } from "@/lib/domain/preco";

const proc = { valor_sessao: 799, valor_parcelado: 940, duracao_min: 20, sessoes_padrao: 1 };
const regiao = (r: Partial<Parameters<typeof precoEfetivo>[1] & object>) => ({
  valor_sessao: null,
  valor_parcelado: null,
  duracao_min: null,
  sessoes_padrao: null,
  ...r,
});

describe("precoEfetivo", () => {
  it("sem região vale o procedimento", () => {
    expect(precoEfetivo(proc)).toEqual({
      avista: 799,
      parcelado: 940,
      duracao_min: 20,
      sessoes_padrao: 1,
    });
  });
  it("região com preço e duração próprios", () => {
    expect(
      precoEfetivo(proc, regiao({ valor_sessao: 1390, valor_parcelado: 1635.3, duracao_min: 40 })),
    ).toEqual({
      avista: 1390,
      parcelado: 1635.3,
      duracao_min: 40,
      sessoes_padrao: 1,
    });
  });
  it("região com preço próprio e sem parcelado não herda o parcelado de outro preço", () => {
    expect(precoEfetivo(proc, regiao({ valor_sessao: 1390 })).parcelado).toBe(1390);
  });
  it("região sem preço herda os dois preços do procedimento", () => {
    expect(precoEfetivo(proc, regiao({ duracao_min: 30 }))).toMatchObject({
      avista: 799,
      parcelado: 940,
      duracao_min: 30,
    });
  });
  it("procedimento sem parcelado cobra o mesmo", () => {
    expect(precoEfetivo({ ...proc, valor_parcelado: null }).parcelado).toBe(799);
  });
});

describe("precoEfetivo com marca", () => {
  it("a marca define o preço; a duração segue a região", () => {
    expect(
      precoEfetivo(proc, regiao({ duracao_min: 15 }), { valor_sessao: 1100, valor_parcelado: 1294.12 }),
    ).toEqual({ avista: 1100, parcelado: 1294.12, duracao_min: 15, sessoes_padrao: 1 });
  });
  it("marca sem parcelado cobra o mesmo, sem herdar o parcelado do procedimento", () => {
    expect(precoEfetivo(proc, null, { valor_sessao: 1100, valor_parcelado: null }).parcelado).toBe(1100);
  });
});

describe("valorDaTabela", () => {
  const p = precoEfetivo(proc);
  it("à vista em 1 parcela, parcelado a partir de 2", () => {
    expect(valorDaTabela(p, 1, 1)).toBe(799);
    expect(valorDaTabela(p, 1, 10)).toBe(940);
    expect(valorDaTabela({ ...p, avista: 99.88, parcelado: 117.51 }, 8, 3)).toBe(940.08);
  });
});
