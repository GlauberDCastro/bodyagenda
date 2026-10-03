import { z } from "zod";

const vazioParaNulo = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), schema.nullable());

/**
 * O `<input type="datetime-local">` devolve "2026-10-06T09:00", sem fuso, e o
 * Postgres do Supabase roda em UTC: gravaria 09:00 UTC = 06:00 na clínica.
 * Ancora no fuso da clínica. São Paulo está fixo em -03:00 desde o fim do
 * horário de verão (2019); o resto do app já assume o mesmo deslocamento.
 */
export function horarioDaClinica(local: string): string {
  const m = local.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?$/);
  return m ? `${m[1]}${m[2] ?? ":00"}-03:00` : local;
}

export const agendamentoSchema = z
  .object({
    paciente_id: z.uuid("Selecione o paciente"),
    procedimento_id: z.uuid("Selecione o procedimento"),
    sala_id: z.uuid("Selecione a sala"),
    /** Vem do input datetime-local (horário da clínica) e sobe como ISO. */
    inicio: z.string().min(1, "Informe data e hora").transform(horarioDaClinica),
    equipamentos: z.array(z.uuid()).default([]),
    profissionais: z.array(z.uuid()).default([]),
    pacote_id: vazioParaNulo(z.uuid()),
    valor_avulso: z.preprocess(
      (v) => (v === "" || v === undefined ? null : Number(v)),
      z.number().nonnegative().nullable(),
    ),
    observacoes: vazioParaNulo(z.string()),
    /** RF-43 · vazio = a duração do procedimento. */
    duracao_min: z.preprocess(
      (v) => (v === "" || v === undefined ? null : Number(v)),
      z.number().int().positive("Duração deve ser maior que zero").nullable(),
    ),
  });
// "Avulsa exige valor" é checado no servidor (valorFaltando, em lib/actions/agenda):
// depende de o procedimento ser avaliação inicial, que é gratuita.

export const mudancaStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["agendado", "confirmado", "em_atendimento", "realizado", "falta", "cancelado"]),
  motivo_cancelamento: vazioParaNulo(z.string()),
});

export type AgendamentoInput = z.infer<typeof agendamentoSchema>;
