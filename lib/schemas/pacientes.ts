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
    /** Região vendida: o saldo e as metas por região contam por ela. */
    regiao_id: vazioParaNulo(z.uuid()),
    marca_id: vazioParaNulo(z.uuid()),
    // RF-80 · como o pacote será pago.
    parcelas: z.coerce.number().int().min(1, "Mínimo 1 parcela").max(24, "Máximo 24 parcelas"),
    primeiro_vencimento: z.string().min(1, "Informe o primeiro vencimento"),
    forma_pagamento: z.string().min(1, "Informe a forma de pagamento"),
    primeira_paga: z.preprocess((v) => v === "on" || v === true, z.boolean()),
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

/** Formas de pagamento oferecidas na venda e no recebimento. */
export const FORMAS_PAGAMENTO = [
  "Pix",
  "Cartão de crédito",
  "Cartão de débito",
  "Dinheiro",
  "Transferência ou boleto",
] as const;

export const recebimentoSchema = z.object({
  lancamento_id: z.uuid(),
  valor: z.coerce.number().positive("Informe o valor recebido"),
  data: z.string().min(1, "Informe a data"),
  forma: z.string().min(1, "Informe a forma de pagamento"),
});

export type PacienteInput = z.infer<typeof pacienteSchema>;
export type PacoteInput = z.infer<typeof pacoteSchema>;
