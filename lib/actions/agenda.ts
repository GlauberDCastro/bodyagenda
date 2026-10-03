"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { agendamentoSchema, horarioDaClinica, mudancaStatusSchema } from "@/lib/schemas/agenda";
import type { Resultado } from "./recursos";
import type { TipoRecurso } from "@/lib/types/database";

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
  /** Na edição, o próprio atendimento ainda ocupa os recursos antigos. */
  ignorar?: string,
): Promise<ResultadoAgendamento> {
  const { data } = await supabase.rpc("detalhar_conflito", {
    p_inicio: dados.inicio,
    p_fim: dados.fim,
    p_sala: dados.sala_id,
    p_equipamentos: dados.equipamentos,
    p_profissionais: dados.profissionais,
    ...(ignorar && { p_ignorar: ignorar }),
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

/**
 * 23514 vem do trigger de janela: fora do expediente ou sobre bloqueio. A
 * mensagem do banco traz o id do recurso, que não diz nada à recepção.
 * "Sem disponibilidade" também aparece quando um bloqueio cobre o dia todo.
 */
function mensagemDeJanela(mensagem: string): string {
  return /fora da janela|não tem disponibilidade/.test(mensagem)
    ? "Um dos recursos escolhidos não atende neste horário: está fora do expediente ou bloqueado (férias, folga ou manutenção)."
    : mensagem;
}

/**
 * RF-33 · requisitos obrigatórios do procedimento: aparelho por modelo, sala
 * específica ou N profissionais. Devolve o que falta, em português, ou null.
 * Requisito opcional só pré-seleciona no formulário; não barra aqui.
 */
async function requisitoObrigatorioFaltando(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  d: { procedimento_id: string; sala_id: string; equipamentos: string[]; profissionais: string[] },
): Promise<string | null> {
  const { data: requisitos } = await supabase
    .from("procedimento_requisito")
    .select("recurso_tipo, recurso_id, modelo, quantidade")
    .eq("procedimento_id", d.procedimento_id)
    .eq("obrigatorio", true);
  if (!requisitos?.length) return null;

  const { data: escolhidos } = d.equipamentos.length
    ? await supabase.from("equipamento").select("modelo").in("id", d.equipamentos)
    : { data: [] as { modelo: string }[] };

  for (const r of requisitos) {
    if (r.recurso_tipo === "equipamento" && r.modelo) {
      const n = (escolhidos ?? []).filter((e) => e.modelo === r.modelo).length;
      if (n < r.quantidade) {
        return `Este procedimento exige ${r.quantidade} aparelho(s) ${r.modelo}. Marque ${r.quantidade === 1 ? "um" : r.quantidade} em Equipamentos.`;
      }
    }
    if (r.recurso_tipo === "sala" && r.recurso_id && r.recurso_id !== d.sala_id) {
      const { data: sala } = await supabase
        .from("sala")
        .select("numero, nome")
        .eq("id", r.recurso_id)
        .maybeSingle();
      return `Este procedimento só pode ser feito na ${sala ? `Sala ${sala.numero} — ${sala.nome}` : "sala exigida"}.`;
    }
    if (r.recurso_tipo === "profissional" && d.profissionais.length < r.quantidade) {
      return `Este procedimento exige ${r.quantidade} profissional(is) no atendimento.`;
    }
  }
  return null;
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

  const faltando = await requisitoObrigatorioFaltando(supabase, d);
  if (faltando) return { erro: faltando };

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
    p_duracao: d.duracao_min ?? undefined,
  });

  if (error) {
    // RF-78 · recusa registrada: é a demanda que o gargalo fez a clínica perder.
    if (error.code === "23P01" || error.code === "23514") {
      await supabase.from("agendamento_recusa").insert({
        procedimento_id: d.procedimento_id,
        inicio: d.inicio,
        sala_id: d.sala_id,
        equipamentos: d.equipamentos,
        profissionais: d.profissionais,
        codigo: error.code,
      });
    }
    if (error.code === "23P01") {
      // Precisa do fim para consultar o conflito; recalcula pela duração.
      const { data: proc } = await supabase
        .from("procedimento")
        .select("duracao_min, buffer_min")
        .eq("id", d.procedimento_id)
        .single();

      const minutos = (d.duracao_min ?? proc?.duracao_min ?? 0) + (proc?.buffer_min ?? 0);
      const fim = new Date(new Date(d.inicio).getTime() + minutos * 60_000);

      return detalharConflito(supabase, {
        inicio: d.inicio,
        fim: fim.toISOString(),
        sala_id: d.sala_id,
        equipamentos: d.equipamentos,
        profissionais: d.profissionais,
      });
    }

    if (error.code === "23514") return { erro: mensagemDeJanela(error.message) };
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { erro: "Seu perfil não tem permissão para agendar." };
    }
    return { erro: error.message };
  }

  revalidatePath("/agenda");
  return { ok: true, id: String(id) } as ResultadoAgendamento & { id: string };
}

/**
 * Edita o atendimento inteiro: procedimento, duração, horário, sala, aparelhos,
 * profissionais, valor e observações. Mesmas regras da criação; o banco faz
 * tudo numa transação e revalida conflito ignorando o próprio atendimento.
 */
export async function editarAgendamento(
  _anterior: ResultadoAgendamento,
  formData: FormData,
): Promise<ResultadoAgendamento> {
  const id = String(formData.get("id") ?? "");
  const parsed = agendamentoSchema.safeParse({
    ...Object.fromEntries(formData),
    equipamentos: formData.getAll("equipamentos"),
    profissionais: formData.getAll("profissionais"),
  });
  if (!id || !parsed.success) {
    const campos: Record<string, string> = {};
    for (const i of parsed.error?.issues ?? []) campos[String(i.path[0] ?? "_")] ??= i.message;
    return { erro: parsed.error?.issues[0].message ?? "Atendimento inválido", campos };
  }

  const d = parsed.data;
  const supabase = await createServerSupabase();

  const faltando = await requisitoObrigatorioFaltando(supabase, d);
  if (faltando) return { erro: faltando };

  const { error } = await supabase.rpc("editar_agendamento", {
    p_agendamento: id,
    p_procedimento: d.procedimento_id,
    p_inicio: d.inicio,
    p_sala: d.sala_id,
    p_equipamentos: d.equipamentos,
    p_profissionais: d.profissionais,
    p_observacoes: d.observacoes ?? undefined,
    p_valor_avulso: d.valor_avulso ?? undefined,
    p_duracao: d.duracao_min ?? undefined,
  });

  if (error) {
    if (error.code === "23P01") {
      const { data: proc } = await supabase
        .from("procedimento")
        .select("duracao_min, buffer_min")
        .eq("id", d.procedimento_id)
        .single();
      const minutos = (d.duracao_min ?? proc?.duracao_min ?? 0) + (proc?.buffer_min ?? 0);
      return detalharConflito(
        supabase,
        {
          inicio: d.inicio,
          fim: new Date(new Date(d.inicio).getTime() + minutos * 60_000).toISOString(),
          sala_id: d.sala_id,
          equipamentos: d.equipamentos,
          profissionais: d.profissionais,
        },
        id,
      );
    }
    if (error.code === "23514") return { erro: mensagemDeJanela(error.message) };
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { erro: "Seu perfil não pode editar este atendimento." };
    }
    return { erro: error.message };
  }

  revalidatePath("/agenda");
  revalidatePath(`/pacientes/${d.paciente_id}`);
  return { ok: true };
}

/**
 * Observações valem mesmo depois do atendimento encerrado: é onde se anota
 * o que aconteceu na sessão. Só este campo; o resto exige voltar o status.
 */
export async function salvarObservacoes(id: string, observacoes: string): Promise<Resultado> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("agendamento")
    .update({ observacoes: observacoes.trim() || null })
    .eq("id", id)
    .select("paciente_id");
  if (error || !data?.length) return { erro: "Seu perfil não pode editar este atendimento." };
  revalidatePath("/agenda");
  revalidatePath(`/pacientes/${data[0].paciente_id}`);
  return { ok: true };
}

/**
 * RF-50 a RF-52 · transições de status.
 *
 * Marcar `realizado` faz o pacote baixar a sessão (a contagem é derivada dos
 * agendamentos não cancelados) e é onde a bonificação será gerada no M6.
 */
export async function mudarStatus(_anterior: Resultado, formData: FormData): Promise<Resultado> {
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

/**
 * RF-49 · remarcar. O trigger reconstrói as reservas e revalida conflito.
 * `novaSala` vem do arraste para outra coluna na visão por salas.
 */
export async function remarcar(
  id: string,
  novoInicio: string,
  novaSala?: string,
): Promise<ResultadoAgendamento> {
  const supabase = await createServerSupabase();
  const inicio = horarioDaClinica(novoInicio);

  const { data: atual, error: erroBusca } = await supabase
    .from("agendamento")
    .select("inicio, fim, sala_id")
    .eq("id", id)
    .single();
  if (erroBusca) return { erro: erroBusca.message };

  const duracaoMs = new Date(atual.fim).getTime() - new Date(atual.inicio).getTime();
  const fim = new Date(new Date(inicio).getTime() + duracaoMs);

  const { error } = await supabase
    .from("agendamento")
    .update({ inicio, fim: fim.toISOString(), ...(novaSala ? { sala_id: novaSala } : {}) })
    .eq("id", id);

  if (error) {
    if (error.code === "23P01") {
      return { erro: "O novo horário conflita com outro agendamento deste recurso." };
    }
    if (error.code === "23514") return { erro: mensagemDeJanela(error.message) };
    if (error.code === "42501") return { erro: "Seu perfil não pode remarcar este atendimento." };
    return { erro: error.message };
  }

  revalidatePath("/agenda");
  return { ok: true };
}

/**
 * Arraste entre colunas na visão por equipamentos ou profissionais: troca o
 * recurso da coluna de origem pelo de destino e muda o horário, numa
 * transação só (migração 0027).
 */
export async function remarcarTrocandoRecurso(
  id: string,
  novoInicio: string,
  tipo: Exclude<TipoRecurso, "sala">,
  de: string,
  para: string,
): Promise<ResultadoAgendamento> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("remarcar_trocando_recurso", {
    p_agendamento: id,
    p_inicio: horarioDaClinica(novoInicio),
    p_tipo: tipo,
    p_de: de,
    p_para: para,
  });

  if (error) {
    if (error.code === "23P01") {
      return { erro: "O novo horário conflita com outro agendamento deste recurso." };
    }
    if (error.code === "23514") return { erro: mensagemDeJanela(error.message) };
    if (error.code === "42501") return { erro: "Seu perfil não pode remarcar este atendimento." };
    return { erro: error.message };
  }

  revalidatePath("/agenda");
  return { ok: true };
}
