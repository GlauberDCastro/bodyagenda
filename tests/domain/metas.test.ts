import { describe, expect, it } from "vitest";
import {
  avaliarMetas,
  contaNaMeta,
  textoDoRitmo,
  vendasSemRegiao,
  type Meta,
  type VendaDaMeta,
} from "@/lib/domain/metas";

const meta = (m: Partial<Meta>): Meta => ({
  id: "m",
  rotulo: "Meta",
  procedimento_id: "toxina",
  regioes: [],
  contagem: "venda",
  por_dia_min: 9,
  por_dia_max: null,
  ...m,
});
const venda = (v: Partial<VendaDaMeta>): VendaDaMeta => ({
  tipo: "avulsa",
  dia: "2026-10-05",
  procedimento_id: "toxina",
  regioes: [],
  ...v,
});

// Outubro/2026, segunda a sexta: 22 dias de atendimento; até 05/10 (segunda) correram 3.
const diasDoMes = Array.from(
  { length: 31 },
  (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`,
).filter((d) => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()));

describe("contaNaMeta", () => {
  it("procedimento, região e só pacote quando a meta é de pacote", () => {
    const olhos = meta({ procedimento_id: "ultra", regioes: ["palp-sup", "palp-inf"] });
    expect(contaNaMeta(venda({ procedimento_id: "ultra", regioes: ["palp-inf"] }), olhos)).toBe(
      true,
    );
    expect(contaNaMeta(venda({ procedimento_id: "ultra", regioes: ["papada"] }), olhos)).toBe(
      false,
    );
    expect(contaNaMeta(venda({ procedimento_id: "ultra" }), olhos)).toBe(false);
    const cmSlim = meta({ procedimento_id: "cm", contagem: "pacote" });
    expect(contaNaMeta(venda({ procedimento_id: "cm", tipo: "avulsa" }), cmSlim)).toBe(false);
    expect(contaNaMeta(venda({ procedimento_id: "cm", tipo: "pacote" }), cmSlim)).toBe(true);
  });
});

describe("avaliarMetas", () => {
  it("hoje, mês, esperado até hoje e ritmo", () => {
    expect(diasDoMes).toHaveLength(22);
    const vendas = [
      ...Array.from({ length: 20 }, () => venda({ dia: "2026-10-01" })),
      ...Array.from({ length: 6 }, () => venda({ dia: "2026-10-05" })),
    ];
    const [t] = avaliarMetas([meta({})], vendas, { hoje: "2026-10-05", diasDoMes });
    expect(t).toMatchObject({
      hoje: 6,
      metaHoje: { min: 9, max: 9 },
      mes: 26,
      esperadoAteHoje: 27,
      metaMes: { min: 198, max: 198 },
      ritmo: "abaixo",
    });
  });

  it("faixa: no ritmo entre o mínimo e o máximo; acima do máximo", () => {
    const faixa = meta({ por_dia_min: 3, por_dia_max: 4 });
    const vendas = (n: number) => Array.from({ length: n }, () => venda({ dia: "2026-10-02" }));
    const ritmo = (n: number) =>
      avaliarMetas([faixa], vendas(n), { hoje: "2026-10-05", diasDoMes })[0].ritmo;
    expect(ritmo(8)).toBe("abaixo");
    expect(ritmo(10)).toBe("no_ritmo");
    expect(ritmo(12)).toBe("acima");
  });

  it("dia em que a clínica não abre não tem meta do dia", () => {
    const [t] = avaliarMetas([meta({})], [], { hoje: "2026-10-04", diasDoMes });
    expect(t.metaHoje).toBeNull();
  });
});

describe("textoDoRitmo", () => {
  it("por dia, faixa e 1 a cada N dias", () => {
    expect(textoDoRitmo(9, 9)).toBe("9 por dia");
    expect(textoDoRitmo(3, 4)).toBe("3 a 4 por dia");
    expect(textoDoRitmo(0.5, null)).toBe("1 a cada 2 dias");
    expect(textoDoRitmo(0.333, 0.333)).toBe("1 a cada 3 dias");
  });
});

describe("vendasSemRegiao", () => {
  it("conta só procedimentos com meta por região", () => {
    const metas = [meta({ procedimento_id: "ultra", regioes: ["papada"] }), meta({})];
    const vendas = [
      venda({ procedimento_id: "ultra" }),
      venda({ procedimento_id: "ultra", regioes: ["papada"] }),
      venda({}),
    ];
    expect(vendasSemRegiao(metas, vendas)).toBe(1);
  });
});
