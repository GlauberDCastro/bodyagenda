"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { agendamentoSchema, mudancaStatusSchema } from "@/lib/schemas/agenda";
import type { Resultado } from "./recursos";

export interface ResultadoAgendamento extends Resultado {
  /** Detalhe do conflito, quando o banco recusou com 23P01 (RF-46). */
  conflitos?: {
    recurso_tipo: string;
    recurso_nome: string;
    conflito_com: string;
    inicio: string;
    fim: string;
  }[];
}

const hora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/**
 * RF-46 / SPEC §6.2 · traduz o erro do banco em algo acionável.
 *
 * `23P01` é a resposta correta da constraint de exclusão, mas inútil na tela.
 * Aqui perguntamos ao banco QUEM colidiu e devolvemos "O Ultraformer #2 já
 * está reservado das 14:00 às 14:20 para Maria Silva".
 */
async function detalharConflito(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  dados: {
    inicio: string;
    fim: string;
    sala_id: string;
    equipamentos: string[];
    profissionais: string[];
  },
): Promise<ResultadoAgendamento> {
  const { data } = await supabase.rpc("detalhar_conflito", {
    p_inicio: dados.inicio,
    p_fim: dados.fim,
    p_sala: dados.sala_id,
    p_equipamentos: dados.equipamentos,
    p_profissionais: dados.profissionais,
  });

  const conflitos = (data ?? []) as ResultadoAgendamento["conflitos"];

  if (!conflitos?.length) {
    return { erro: "Este horário já está ocupado para um dos recursos escolhidos." };
  }

  const frases = conflitos.map(
    (c) =>
      `${c.recurso_nome} já está reservado das ${hora.format(new Date(c.inicio))} às ${hora.format(new Date(c.fim))} para ${c.conflito_com}`,
  );

  return { erro: frases.join(". ") + ".", conflitos };
}

export async function criarAgendamento(
  _anterior: ResultadoAgendamento,
  formData: FormData,
): Promise<ResultadoAgendamento> {
  const parsed = agendamentoSchema.safeParse({
    ...Object.fromEntries(formData),
    equipamentos: formData.getAll("equipamentos"),
    profissionais: formData.getAll("profissionais"),
  });

  if (!parsed.success) {
    const campos: Record<string, string> = {};
    for (const i of parsed.error.issues) campos[String(i.path[0] ?? "_")] ??= i.message;
    return { erro: parsed.error.issues[0].message, campos };
  }

  const d = parsed.data;
  const supabase = await createServerSupabase();

  // RPC transacional: agendamento + equipamentos + profissionais numa chamada
  // só. Três inserts do lado do Next deixariam janela para um agendamento
  // existir sem seus recursos (SPEC §6.1).
  const { data: id, error } = await supabase.rpc("criar_agendamento", {
    p_paciente: d.paciente_id,
    p_procedimento: d.procedimento_id,
    p_inicio: d.inicio,
    p_sala: d.sala_id,
    p_equipamentos: d.equipamentos,
    p_profissionais: d.profissionais,
    p_pacote: d.pacote_id ?? undefined,
    p_observacoes: d.observacoes ?? undefined,
    p_valor_avulso: d.valor_avulso ?? undefined,
  });

  if (error) {
    if (error.code === "23P01") {
      // Precisa do fim para consultar o conflito; recalcula pela duração.
      const { data: proc } = await supabase
        .from("procedimento")
        .select("duracao_min, buffer_min")
        .eq("id", d.procedimento_id)
        .single();

      const minutos = (proc?.duracao_min ?? 0) + (proc?.buffer_min ?? 0);
      const fim = new Date(new Date(d.inicio).getTime() + minutos * 60_000);

      return detalharConflito(supabase, {
        inicio: d.inicio,
        fim: fim.toISOString(),
        sala_id: d.sala_id,
        equipamentos: d.equipamentos,
        profissionais: d.profissionais,
      });
    }

    // 23514 vem do trigger de janela: fora do expediente ou sobre bloqueio.
    if (error.code === "23514") {
      return { erro: error.message };
    }
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { erro: "Seu perfil não tem permissão para agendar." };
    }
    return { erro: error.message };
  }

  revalidatePath("/agenda");
  return { ok: true, id: String(id) } as ResultadoAgendamento & { id: string };
}

/**
 * RF-50 a RF-52 · transições de status.
 *
 * Marcar `realizado` faz o pacote baixar a sessão (a contagem é derivada dos
 * agendamentos não cancelados) e é onde a comissão será gerada no M6.
 */
export async function mudarStatus(
  _anterior: Resultado,
  formData: FormData,
): Promise<Resultado> {
  const parsed = mudancaStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { erro: parsed.error.issues[0].message };

  const { id, status, motivo_cancelamento } = parsed.data;
  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from("agendamento")
    .update({
      status,
      ...(status === "cancelado" ? { motivo_cancelamento } : {}),
    })
    .eq("id", id);

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { erro: "Seu perfil não pode alterar este agendamento." };
    }
    return { erro: error.message };
  }

  revalidatePath("/agenda");
  return { ok: true };
}

/** RF-49 · remarcar. O trigger reconstrói as reservas e revalida conflito. */
export async function remarcar(
  id: string,
  novoInicio: string,
): Promise<ResultadoAgendamento> {
  const supabase = await createServerSupabase();

  const { data: atual, error: erroBusca } = await supabase
    .from("agendamento")
    .select("inicio, fim, sala_id")
    .eq("id", id)
    .single();
  if (erroBusca) return { erro: erroBusca.message };

  const duracaoMs = new Date(atual.fim).getTime() - new Date(atual.inicio).getTime();
  const fim = new Date(new Date(novoInicio).getTime() + duracaoMs);

  const { error } = await supabase
    .from("agendamento")
    .update({ inicio: novoInicio, fim: fim.toISOString() })
    .eq("id", id);

  if (error) {
    if (error.code === "23P01") {
      return { erro: "O novo horário conflita com outro agendamento deste recurso." };
    }
    if (error.code === "23514") return { erro: error.message };
    return { erro: error.message };
  }

  revalidatePath("/agenda");
  return { ok: true };
}
