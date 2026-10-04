import { describe, expect, it } from "vitest";
import { resumirVendas, type Venda } from "@/lib/domain/vendas";

const venda = (v: Partial<Venda>): Venda => ({
  tipo: "pacote",
  id: Math.random().toString(),
  dia: "2026-10-01",
  valor: 100,
  paciente_id: "p",
  paciente_nome: "Paciente",
  procedimento_nome: "Proc",
  vendedor_id: "a",
  vendedor_nome: "Ana",
  vendedor_perfil: "closer",
  canal: "comercial",
  ...v,
});

describe("resumirVendas", () => {
  const vendas = [
    venda({ valor: 2000 }),
    venda({ valor: 1000, tipo: "avulsa" }),
    venda({
      valor: 500,
      vendedor_id: "b",
      vendedor_nome: "Dra. Lívia",
      vendedor_perfil: "profissional",
      canal: "clinica",
      dia: "2026-10-03",
    }),
    venda({
      valor: 300,
      vendedor_id: null,
      vendedor_nome: null,
      vendedor_perfil: null,
      canal: "recepcao",
    }),
  ];
  const r = resumirVendas(vendas, "2026-10-01", "2026-10-03");

  it("total, quantidade e ticket médio", () => {
    expect(r.total).toBe(3800);
    expect(r.quantidade).toBe(4);
    expect(r.ticket).toBe(950);
  });

  it("canais na ordem fixa, com participação no valor", () => {
    expect(r.porCanal.map((c) => [c.canal, c.valor, c.quantidade])).toEqual([
      ["comercial", 3000, 2],
      ["clinica", 500, 1],
      ["recepcao", 300, 1],
    ]);
    expect(r.porCanal[0].participacao).toBeCloseTo(3000 / 3800);
  });

  it("ranking por valor, separando pacote de avulsa, e venda sem vendedor agrupada", () => {
    expect(r.porVendedor[0]).toMatchObject({
      nome: "Ana",
      valor: 3000,
      pacotes: 1,
      avulsas: 1,
      ticket: 1500,
    });
    expect(r.porVendedor.at(-1)).toMatchObject({ nome: "Sem vendedor registrado", valor: 300 });
  });

  it("série com todos os dias do período, inclusive sem venda", () => {
    expect(r.porDia).toEqual([
      { dia: "2026-10-01", valor: 3300 },
      { dia: "2026-10-02", valor: 0 },
      { dia: "2026-10-03", valor: 500 },
    ]);
  });

  it("sem vendas: ticket nulo, canais zerados", () => {
    const vazio = resumirVendas([], "2026-10-01", "2026-10-01");
    expect(vazio.ticket).toBeNull();
    expect(vazio.porCanal.every((c) => c.valor === 0 && c.participacao === 0)).toBe(true);
  });
});
