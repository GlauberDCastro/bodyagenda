import { describe, expect, it } from "vitest";
import { agendamentoSchema, horarioDaClinica } from "@/lib/schemas/agenda";

describe("horarioDaClinica", () => {
  // O <input type="datetime-local"> manda "2026-10-06T09:00", sem fuso. O banco
  // roda em UTC e leria isso como 06:00 em São Paulo.
  it("ancora o horário digitado no fuso da clínica", () => {
    expect(horarioDaClinica("2026-10-06T09:00")).toBe("2026-10-06T09:00:00-03:00");
    expect(new Date(horarioDaClinica("2026-10-06T09:00")).toISOString()).toBe(
      "2026-10-06T12:00:00.000Z",
    );
  });

  it("preserva segundos quando vierem", () => {
    expect(horarioDaClinica("2026-10-06T09:00:30")).toBe("2026-10-06T09:00:30-03:00");
  });

  it("não mexe em horário que já tem fuso", () => {
    expect(horarioDaClinica("2026-10-06T12:00:00.000Z")).toBe("2026-10-06T12:00:00.000Z");
    expect(horarioDaClinica("2026-10-06T09:00:00-03:00")).toBe("2026-10-06T09:00:00-03:00");
  });
});

describe("agendamentoSchema", () => {
  it("entrega o início já no fuso da clínica", () => {
    const r = agendamentoSchema.parse({
      paciente_id: "00000000-0000-4000-8000-000000000001",
      procedimento_id: "00000000-0000-4000-8000-000000000002",
      sala_id: "00000000-0000-4000-8000-000000000003",
      inicio: "2026-10-06T09:00",
      valor_avulso: "300",
    });
    expect(r.inicio).toBe("2026-10-06T09:00:00-03:00");
  });
});
