import { z } from "zod";
import { cpfValido, limparCpf } from "@/lib/domain/cpf";

const vazioParaNulo = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), schema.nullable());

export const pacienteSchema = z.object({
  nome: z.string().min(2, "Informe o nome completo"),
  cpf: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? limparCpf(v) : null),
    z.string().refine(cpfValido, "CPF inválido — confira os dígitos").nullable(),
  ),
  data_nascimento: vazioParaNulo(z.string()),
  telefone: vazioParaNulo(z.string()),
  email: vazioParaNulo(z.email("E-mail inválido")),
  endereco: vazioParaNulo(z.string()),
  observacoes: vazioParaNulo(z.string()),
  consentimento_lgpd: z.preprocess((v) => v === "on" || v === true, z.boolean()),
});

export const pacoteSchema = z
  .object({
    paciente_id: z.uuid(),
    procedimento_id: z.uuid("Selecione o procedimento"),
    quantidade_sessoes: z.coerce.number().int().positive("Informe ao menos 1 sessão"),
    valor_total: z.coerce.number().nonnegative("Valor não pode ser negativo"),
    desconto: z.coerce.number().nonnegative().default(0),
    validade: vazioParaNulo(z.string()),
  })
  .superRefine((d, ctx) => {
    if (d.desconto > d.valor_total) {
      ctx.addIssue({
        code: "custom",
        path: ["desconto"],
        message: "O desconto não pode passar do valor total",
      });
    }
  });

export type PacienteInput = z.infer<typeof pacienteSchema>;
export type PacoteInput = z.infer<typeof pacoteSchema>;
