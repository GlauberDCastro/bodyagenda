import { createServerSupabase } from "@/lib/supabase/server";
import type { StatusAgendamento, TipoRecurso } from "@/lib/types/database";
import type { Periodo } from "@/lib/consultas/painel";

export interface AtendimentoListado {
  id: string;
  inicio: string;
  status: StatusAgendamento;
  valor_avulso: number | null;
  numero_sessao: number | null;
  paciente: { id: string; nome: string } | null;
  procedimento: { nome: string } | null;
  sala: { numero: number; nome: string } | null;
  profissionais: string[];
}

/**
 * RF-77 · a lista que compõe cada número do painel: período, status e,
 * opcionalmente, um recurso (sala, aparelho ou profissional).
 */
export async function listarAtendimentos(f: {
  inicio: Date;
  fim: Date;
  status?: StatusAgendamento[];
  tipo?: TipoRecurso;
  recursoId?: string;
}): Promise<AtendimentoListado[]> {
  const supabase = await createServerSupabase();
  const juntaEquip = f.tipo === "equipamento" ? "!inner" : "";
  const juntaProf = f.tipo === "profissional" ? "!inner" : "";

  let q = supabase
    .from("agendamento")
    .select(
      `id, inicio, status, valor_avulso, numero_sessao, sala_id,
       paciente:paciente_id (id, nome),
       procedimento:procedimento_id (nome),
       sala:sala_id (numero, nome),
       agendamento_equipamento${juntaEquip} (equipamento_id),
       agendamento_profissional${juntaProf} (profissional_id, profissional:profissional_id (nome))`,
    )
    .gte("inicio", f.inicio.toISOString())
    .lte("inicio", f.fim.toISOString())
    .order("inicio", { ascending: false })
    .limit(500);

  if (f.status?.length) q = q.in("status", f.status);
  if (f.recursoId && f.tipo === "sala") q = q.eq("sala_id", f.recursoId);
  if (f.recursoId && f.tipo === "equipamento")
    q = q.eq("agendamento_equipamento.equipamento_id", f.recursoId);
  if (f.recursoId && f.tipo === "profissional")
    q = q.eq("agendamento_profissional.profissional_id", f.recursoId);

  const { data } = await q;
  return (data ?? []).map((a) => {
    const l = a as unknown as AtendimentoListado & {
      agendamento_profissional: { profissional: { nome: string } | null }[];
    };
    return {
      ...l,
      profissionais: (l.agendamento_profissional ?? [])
        .map((p) => p.profissional?.nome)
        .filter((n): n is string => !!n),
    };
  });
}

/**
 * RF-92 · faltas e cancelamentos no período: volume, taxa e quem mais falta.
 * A taxa é sobre as sessões que deveriam ter acontecido (realizadas + faltas);
 * cancelamento conta à parte, porque liberou o horário a tempo.
 */
export async function faltasECancelamentos(inicio: Date, fim: Date) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("agendamento")
    .select("status, motivo_cancelamento, paciente:paciente_id (id, nome)")
    .gte("inicio", inicio.toISOString())
    .lte("inicio", fim.toISOString())
    .in("status", ["realizado", "falta", "cancelado"]);

  const linhas = (data ?? []) as unknown as {
    status: StatusAgendamento;
    motivo_cancelamento: string | null;
    paciente: { id: string; nome: string } | null;
  }[];
  const realizadas = linhas.filter((l) => l.status === "realizado").length;
  const faltas = linhas.filter((l) => l.status === "falta");
  const cancelados = linhas.filter((l) => l.status === "cancelado");

  const porPaciente = new Map<string, { id: string; nome: string; faltas: number; cancelamentos: number }>();
  for (const l of [...faltas, ...cancelados]) {
    if (!l.paciente) continue;
    const p = porPaciente.get(l.paciente.id) ?? { ...l.paciente, faltas: 0, cancelamentos: 0 };
    if (l.status === "falta") p.faltas++;
    else p.cancelamentos++;
    porPaciente.set(l.paciente.id, p);
  }

  const motivos = new Map<string, number>();
  for (const c of cancelados) {
    const m = c.motivo_cancelamento?.trim() || "Sem motivo informado";
    motivos.set(m, (motivos.get(m) ?? 0) + 1);
  }

  return {
    faltas: faltas.length,
    cancelamentos: cancelados.length,
    taxaFalta: realizadas + faltas.length > 0 ? faltas.length / (realizadas + faltas.length) : null,
    ranking: [...porPaciente.values()]
      .sort((a, b) => b.faltas - a.faltas || b.cancelamentos - a.cancelamentos)
      .slice(0, 15),
    motivos: [...motivos.entries()].sort((a, b) => b[1] - a[1]),
  };
}

/** RF-66 · pacotes com sessões ainda a entregar, por paciente. */
export async function pacotesPendentes() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("pacotes_pendentes");
  return data ?? [];
}

/** RF-101 · receita e margem de cada aparelho no período, contra o custo de aquisição. */
export async function retornoEquipamentos(inicio: Date, fim: Date) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("retorno_equipamentos", {
    p_inicio: inicio.toISOString(),
    p_fim: fim.toISOString(),
  });
  return data ?? [];
}

/** RF-75 · ocupação efetiva dia a dia. */
export async function serieOcupacao(tipo: TipoRecurso, de: string, ate: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("serie_ocupacao", { p_tipo: tipo, p_inicio: de, p_fim: ate });
  return (data ?? []).map((d) => ({
    dia: String(d.dia).slice(0, 10),
    capacidade: Number(d.capacidade_h),
    realizadas: Number(d.realizadas_h),
  }));
}

export interface Vaga {
  inicio: string;
  fim: string;
  minutos: number;
  recurso: string;
}

/**
 * RF-91 · janelas vagas por recurso, ordenadas por tamanho.
 * É insumo comercial direto: diz onde exatamente encaixar mais um paciente.
 */
export async function janelasVagas(
  tipo: TipoRecurso,
  recursos: { recurso_id: string; nome: string }[],
  periodo: Periodo,
): Promise<Vaga[]> {
  const supabase = await createServerSupabase();

  // RF-19a/91 · todos os recursos, sem teto fixo no código.
  const porRecurso = await Promise.all(
    recursos.map(async (r) => {
      const { data } = await supabase.rpc("janelas_vagas", {
        p_tipo: tipo,
        p_id: r.recurso_id,
        p_inicio: periodo.inicio.toISOString(),
        p_fim: periodo.fim.toISOString(),
        p_min_minutos: 30,
      });
      return (data ?? []).map((v) => ({
        ...v,
        recurso: r.nome,
      }));
    }),
  );

  return porRecurso.flat().sort((a, b) => b.minutos - a.minutos);
}
