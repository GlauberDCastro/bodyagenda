import { z } from "zod";

/** Data no formato ISO que o Postgres aceita em coluna `date`. */
const dataISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD");

const vigencia = {
  vigencia_inicio: dataISO,
  vigencia_fim: dataISO.nullish().or(z.literal("").transform(() => null)),
};

/** Vigência incoerente é erro de cadastro, não do banco — pegar antes. */
function vigenciaCoerente<T extends { vigencia_inicio: string; vigencia_fim?: string | null }>(
  dados: T,
  ctx: z.RefinementCtx,
) {
  if (dados.vigencia_fim && dados.vigencia_fim < dados.vigencia_inicio) {
    ctx.addIssue({
      code: "custom",
      path: ["vigencia_fim"],
      message: "O fim da vigência não pode ser anterior ao início",
    });
  }
}

export const salaSchema = z
  .object({
    numero: z.coerce.number().int().positive("Número da sala deve ser positivo"),
    nome: z.string().min(1, "Informe o nome da sala"),
    descricao: z.string().nullish(),
    tipo_alocacao: z.enum(["dedicada", "flexivel"]),
    procedimento_fixo_id: z
      .uuid()
      .nullish()
      .or(z.literal("").transform(() => null)),
    ...vigencia,
  })
  .superRefine((dados, ctx) => {
    vigenciaCoerente(dados, ctx);
    // Espelha a constraint sala_dedicada_exige_procedimento (migração 0004).
    if (dados.tipo_alocacao === "dedicada" && !dados.procedimento_fixo_id) {
      ctx.addIssue({
        code: "custom",
        path: ["procedimento_fixo_id"],
        message: "Sala dedicada exige um procedimento fixo",
      });
    }
  });

export const equipamentoSchema = z
  .object({
    nome: z.string().min(1, "Informe o nome do equipamento"),
    modelo: z.string().min(1, "Informe o modelo — é o que agrupa as unidades"),
    numero_serie: z.string().nullish(),
    tipo_alocacao: z.enum(["fixo", "movel"]),
    sala_id: z
      .uuid()
      .nullish()
      .or(z.literal("").transform(() => null)),
    custo_aquisicao: z.coerce
      .number()
      .nonnegative()
      .nullish()
      .or(z.literal("").transform(() => null)),
    custo_hora: z.coerce.number().nonnegative().default(0),
    ...vigencia,
  })
  .superRefine((dados, ctx) => {
    vigenciaCoerente(dados, ctx);
    // Espelha equip_fixo_exige_sala / equip_movel_sem_sala (migração 0004).
    if (dados.tipo_alocacao === "fixo" && !dados.sala_id) {
      ctx.addIssue({
        code: "custom",
        path: ["sala_id"],
        message: "Equipamento fixo precisa estar vinculado a uma sala",
      });
    }
    if (dados.tipo_alocacao === "movel" && dados.sala_id) {
      ctx.addIssue({
        code: "custom",
        path: ["sala_id"],
        message: "Equipamento móvel não pode ter sala fixa",
      });
    }
  });

export const profissionalSchema = z
  .object({
    nome: z.string().min(1, "Informe o nome"),
    cpf: z
      .string()
      .nullish()
      .or(z.literal("").transform(() => null)),
    especialidade: z.string().nullish(),
    cor_agenda: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Cor deve estar no formato #RRGGBB"),
    custo_hora: z.coerce.number().nonnegative().default(0),
    comissao_tipo: z.enum(["percentual", "valor_fixo", "nenhuma"]),
    comissao_valor: z.coerce.number().nonnegative().default(0),
    procedimentos: z.array(z.uuid()).default([]),
    ...vigencia,
  })
  .superRefine((dados, ctx) => {
    vigenciaCoerente(dados, ctx);
    if (dados.comissao_tipo === "percentual" && dados.comissao_valor > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["comissao_valor"],
        message: "Percentual de comissão não pode passar de 100",
      });
    }
    if (dados.comissao_tipo !== "nenhuma" && dados.comissao_valor <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["comissao_valor"],
        message: "Informe o valor da comissão",
      });
    }
  });

export const disponibilidadeSchema = z
  .object({
    recurso_tipo: z.enum(["sala", "equipamento", "profissional"]),
    recurso_id: z.uuid(),
    dia_semana: z.coerce.number().int().min(0).max(6),
    hora_inicio: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
    hora_fim: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  })
  .refine((d) => d.hora_fim > d.hora_inicio, {
    path: ["hora_fim"],
    message: "O fim deve ser depois do início",
  });

export const bloqueioSchema = z
  .object({
    recurso_tipo: z.enum(["sala", "equipamento", "profissional"]),
    recurso_id: z.uuid(),
    inicio: z.string().min(1, "Informe o início"),
    fim: z.string().min(1, "Informe o fim"),
    motivo: z.enum(["manutencao", "ferias", "folga", "outro"]),
    observacao: z.string().nullish(),
  })
  .refine((d) => new Date(d.fim) > new Date(d.inicio), {
    path: ["fim"],
    message: "O fim deve ser depois do início",
  });

export type SalaInput = z.infer<typeof salaSchema>;
export type EquipamentoInput = z.infer<typeof equipamentoSchema>;
export type ProfissionalInput = z.infer<typeof profissionalSchema>;
export type DisponibilidadeInput = z.infer<typeof disponibilidadeSchema>;
export type BloqueioInput = z.infer<typeof bloqueioSchema>;
