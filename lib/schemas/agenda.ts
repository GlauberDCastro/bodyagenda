import { z } from "zod";

const vazioParaNulo = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), schema.nullable());

export const agendamentoSchema = z
  .object({
    paciente_id: z.uuid("Selecione o paciente"),
    procedimento_id: z.uuid("Selecione o procedimento"),
    sala_id: z.uuid("Selecione a sala"),
    /** Vem do input datetime-local (horário da clínica) e sobe como ISO. */
    inicio: z.string().min(1, "Informe data e hora"),
    equipamentos: z.array(z.uuid()).default([]),
    profissionais: z.array(z.uuid()).default([]),
    pacote_id: vazioParaNulo(z.uuid()),
    valor_avulso: z.preprocess(
      (v) => (v === "" || v === undefined ? null : Number(v)),
      z.number().nonnegative().nullable(),
    ),
    observacoes: vazioParaNulo(z.string()),
  })
  .superRefine((d, ctx) => {
    // Avulso sem valor vira receita fantasma: a sessão acontece, ocupa a
    // agenda e nunca aparece no financeiro.
    if (!d.pacote_id && (d.valor_avulso === null || d.valor_avulso === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["valor_avulso"],
        message: "Sessão avulsa exige um valor de cobrança",
      });
    }
  });

export const mudancaStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["agendado", "confirmado", "em_atendimento", "realizado", "falta", "cancelado"]),
  motivo_cancelamento: vazioParaNulo(z.string()),
});

export type AgendamentoInput = z.infer<typeof agendamentoSchema>;
