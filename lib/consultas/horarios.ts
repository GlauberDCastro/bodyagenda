import { createServerSupabase } from "@/lib/supabase/server";
import { cache } from "react";
import { expedienteDasJanelas, type Expediente, type Janela } from "@/lib/horarios";
import type { MotivoBloqueio, TipoRecurso } from "@/lib/types/database";

export interface RecursoComHorario {
  tipo: TipoRecurso;
  id: string;
  nome: string;
  janelas: Janela[];
}

export interface BloqueioListado {
  id: string;
  tipo: TipoRecurso;
  recursoNome: string;
  inicio: string;
  fim: string;
  motivo: MotivoBloqueio;
  observacao: string | null;
}

/** Recursos ativos com o horário de cada um, e os bloqueios que ainda valem. */
export async function carregarHorarios(): Promise<{
  recursos: RecursoComHorario[];
  bloqueios: BloqueioListado[];
  erro?: string;
}> {
  const supabase = await createServerSupabase();
  const [salas, equipamentos, profissionais, janelas, bloqueios] = await Promise.all([
    supabase.from("sala").select("id, numero, nome").eq("ativo", true).order("numero"),
    supabase.from("equipamento").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("profissional").select("id, nome").eq("ativo", true).order("nome"),
    supabase
      .from("recurso_disponibilidade")
      .select("recurso_id, dia_semana, hora_inicio, hora_fim"),
    supabase
      .from("recurso_bloqueio")
      .select("id, recurso_tipo, recurso_id, inicio, fim, motivo, observacao")
      .gte("fim", new Date().toISOString())
      .order("inicio"),
  ]);

  const erro = [salas, equipamentos, profissionais, janelas, bloqueios].find((r) => r.error)?.error
    ?.message;
  if (erro) return { recursos: [], bloqueios: [], erro };

  const porRecurso = new Map<string, Janela[]>();
  for (const j of janelas.data ?? []) {
    const lista = porRecurso.get(j.recurso_id) ?? [];
    lista.push({ dia: j.dia_semana, inicio: j.hora_inicio, fim: j.hora_fim });
    porRecurso.set(j.recurso_id, lista);
  }

  const recursos: RecursoComHorario[] = [
    ...(salas.data ?? []).map((s) => ({
      tipo: "sala" as const,
      id: s.id,
      nome: `Sala ${s.numero} — ${s.nome}`,
    })),
    ...(equipamentos.data ?? []).map((e) => ({
      tipo: "equipamento" as const,
      id: e.id,
      nome: e.nome,
    })),
    ...(profissionais.data ?? []).map((p) => ({
      tipo: "profissional" as const,
      id: p.id,
      nome: p.nome,
    })),
  ].map((r) => ({ ...r, janelas: porRecurso.get(r.id) ?? [] }));

  const nomes = new Map(recursos.map((r) => [r.id, r.nome]));

  return {
    recursos,
    bloqueios: (bloqueios.data ?? []).map((b) => ({
      id: b.id,
      tipo: b.recurso_tipo,
      // Bloqueio de recurso inativo continua listado, para poder ser removido.
      recursoNome: nomes.get(b.recurso_id) ?? "Recurso inativo",
      inicio: b.inicio,
      fim: b.fim,
      motivo: b.motivo,
      observacao: b.observacao,
    })),
  };
}

/**
 * Expediente da clínica a partir do horário dos recursos ativos. `cache`:
 * várias partes da mesma página pedem e o banco é consultado uma vez só.
 */
export const expedienteDaClinica = cache(async (): Promise<Expediente> => {
  const supabase = await createServerSupabase();
  const [salas, equipamentos, profissionais, janelas] = await Promise.all([
    supabase.from("sala").select("id").eq("ativo", true),
    supabase.from("equipamento").select("id").eq("ativo", true),
    supabase.from("profissional").select("id").eq("ativo", true),
    supabase.from("recurso_disponibilidade").select("recurso_id, dia_semana, hora_inicio, hora_fim"),
  ]);
  const ativos = new Set(
    [...(salas.data ?? []), ...(equipamentos.data ?? []), ...(profissionais.data ?? [])].map(
      (r) => r.id,
    ),
  );
  return expedienteDasJanelas(
    (janelas.data ?? [])
      .filter((j) => ativos.has(j.recurso_id))
      .map((j) => ({ dia: j.dia_semana, inicio: j.hora_inicio, fim: j.hora_fim })),
  );
});
