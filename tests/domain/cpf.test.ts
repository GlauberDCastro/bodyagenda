import { describe, it, expect } from "vitest";
import { cpfValido, limparCpf, formatarCpf } from "@/lib/domain/cpf";

describe("RF-11 · validação de CPF", () => {
  it("aceita CPF válido com e sem máscara", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224725")).toBe(true);
  });

  it("recusa dígito verificador errado", () => {
    expect(cpfValido("529.982.247-26")).toBe(false);
  });

  it("recusa sequência repetida", () => {
    // 111.111.111-11 passa no módulo 11 mas não é CPF válido.
    expect(cpfValido("11111111111")).toBe(false);
    expect(cpfValido("00000000000")).toBe(false);
  });

  it("recusa tamanho errado", () => {
    expect(cpfValido("5299822472")).toBe(false);
    expect(cpfValido("")).toBe(false);
  });

  it("limpa e formata", () => {
    expect(limparCpf("529.982.247-25")).toBe("52998224725");
    expect(formatarCpf("52998224725")).toBe("529.982.247-25");
  });
});
