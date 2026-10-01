import { describe, expect, it } from "vitest";
import {
  assinatura,
  janelasDaSemana,
  padraoMaisComum,
  resumirHorario,
  semanaDasJanelas,
  validarSemana,
  type Janela,
} from "@/lib/horarios";

const segSex: Janela[] = [1, 2, 3, 4, 5].map((dia) => ({ dia, inicio: "08:00", fim: "18:00" }));
const comSabado: Janela[] = [...segSex, { dia: 6, inicio: "08:00", fim: "12:00" }];

describe("resumirHorario", () => {
  it("agrupa dias seguidos com o mesmo horário", () => {
    expect(resumirHorario(segSex)).toBe("Seg–Sex 08:00–18:00");
    expect(resumirHorario(comSabado)).toBe("Seg–Sex 08:00–18:00 · Sáb 08:00–12:00");
  });

  it("não agrupa dias soltos", () => {
    expect(
      resumirHorario([
        { dia: 1, inicio: "13:00", fim: "18:00" },
        { dia: 3, inicio: "13:00", fim: "18:00" },
      ]),
    ).toBe("Seg 13:00–18:00 · Qua 13:00–18:00");
  });

  it("aceita hora com segundos, como vem do Postgres", () => {
    expect(resumirHorario([{ dia: 0, inicio: "09:00:00", fim: "13:00:00" }])).toBe(
      "Dom 09:00–13:00",
    );
  });

  it("sem janela, diz que não atende", () => {
    expect(resumirHorario([])).toBe("Sem horário");
  });
});

describe("padraoMaisComum", () => {
  it("escolhe o horário que mais recursos usam", () => {
    expect(padraoMaisComum([segSex, segSex, comSabado])).toEqual(segSex);
  });

  it("sem recursos, cai em seg–sex 08–18", () => {
    expect(padraoMaisComum([])).toEqual(segSex);
  });
});

describe("assinatura", () => {
  it("ignora ordem e segundos", () => {
    const embaralhado = [...comSabado].reverse().map((j) => ({ ...j, inicio: `${j.inicio}:00` }));
    expect(assinatura(embaralhado)).toBe(assinatura(comSabado));
  });
});

describe("semana ⇄ janelas", () => {
  it("ida e volta preserva o horário", () => {
    expect(janelasDaSemana(semanaDasJanelas(comSabado))).toEqual(comSabado);
  });

  it("dia fechado não vira janela", () => {
    const semana = semanaDasJanelas(segSex);
    expect(semana[0]).toMatchObject({ dia: 1, aberto: true }); // segunda primeiro
    expect(semana.find((d) => d.dia === 0)).toMatchObject({ aberto: false });
    expect(janelasDaSemana(semana)).toHaveLength(5);
  });
});

describe("várias faixas no mesmo dia (RF-24)", () => {
  const almoco: Janela[] = [1, 2, 3, 4, 5].flatMap((dia) => [
    { dia, inicio: "08:00", fim: "12:00" },
    { dia, inicio: "13:00", fim: "18:00" },
  ]);

  it("resume as faixas do dia juntas", () => {
    expect(resumirHorario(almoco)).toBe("Seg–Sex 08:00–12:00, 13:00–18:00");
  });

  it("ida e volta preserva as duas faixas", () => {
    expect(janelasDaSemana(semanaDasJanelas(almoco))).toEqual(almoco);
  });

  it("recusa faixas que se sobrepõem no mesmo dia", () => {
    const semana = semanaDasJanelas([
      { dia: 1, inicio: "08:00", fim: "12:00" },
      { dia: 1, inicio: "11:00", fim: "18:00" },
    ]);
    expect(validarSemana(semana)).toMatch(/Seg.*sobrep/);
  });
});

describe("validarSemana", () => {
  it("recusa fim antes do início", () => {
    const semana = semanaDasJanelas([{ dia: 1, inicio: "18:00", fim: "08:00" }]);
    expect(validarSemana(semana)).toMatch(/Seg/);
  });

  it("recusa semana sem nenhum dia aberto", () => {
    expect(validarSemana(semanaDasJanelas([]))).toMatch(/pelo menos um dia/);
  });

  it("aceita semana válida", () => {
    expect(validarSemana(semanaDasJanelas(comSabado))).toBeNull();
  });
});
