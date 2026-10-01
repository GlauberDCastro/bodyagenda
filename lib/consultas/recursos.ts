import { createServerSupabase } from "@/lib/supabase/server";
import type {
  Sala,
  Equipamento,
  Profissional,
  Procedimento,
  RecursoDisponibilidade,
  TipoRecurso,
} from "@/lib/types/database";

/**
 * `PGRST205` = tabela ausente do cache de schema, ou seja, migrações ainda não
 * aplicadas. Distinguir isso de "sem registros" evita a tela mentir dizendo
 * que a clínica não tem salas quando o que falta é o schema.
 */
export interface Consulta<T> {
  dados: T[];
  semSchema: boolean;
  erro?: string;
}

function interpretar<T>(
  dados: T[] | null,
  error: { code?: string; message: string } | null,
): Consulta<T> {
  if (!error) return { dados: dados ?? [], semSchema: false };
  if (error.code === "PGRST205") return { dados: [], semSchema: true };
  return { dados: [], semSchema: false, erro: error.message };
}

export async function listarSalas(): Promise<Consulta<Sala>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("sala").select("*").order("numero");
  return interpretar<Sala>(data, error);
}

export async function listarEquipamentos(): Promise<Consulta<Equipamento>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("equipamento")
    .select("*")
    .order("modelo")
    .order("nome");
  return interpretar<Equipamento>(data, error);
}

export async function listarProfissionais(): Promise<Consulta<Profissional>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("profissional").select("*").order("nome");
  return interpretar<Profissional>(data, error);
}

export async function listarProcedimentos(): Promise<Consulta<Procedimento>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("procedimento").select("*").order("nome");
  return interpretar<Procedimento>(data, error);
}

export async function listarDisponibilidade(
  tipo: TipoRecurso,
  recursoId: string,
): Promise<Consulta<RecursoDisponibilidade>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("recurso_disponibilidade")
    .select("*")
    .eq("recurso_tipo", tipo)
    .eq("recurso_id", recursoId)
    .order("dia_semana")
    .order("hora_inicio");
  return interpretar<RecursoDisponibilidade>(data, error);
}

/**
 * Conta unidades por modelo — a visão que importa para enxergar gargalo.
 * Com 1 Fotona, "Fotona" e "Melasma" disputam o mesmo aparelho (PRD A-08).
 */
export function agruparPorModelo(equipamentos: Equipamento[]) {
  const mapa = new Map<string, Equipamento[]>();
  for (const e of equipamentos) {
    const lista = mapa.get(e.modelo) ?? [];
    lista.push(e);
    mapa.set(e.modelo, lista);
  }
  return [...mapa.entries()]
    .map(([modelo, unidades]) => ({
      modelo,
      unidades,
      ativas: unidades.filter((u) => u.ativo).length,
    }))
    .sort((a, b) => a.modelo.localeCompare(b.modelo, "pt-BR"));
}

/** Perfil de quem está logado, para mostrar só as ações que ele pode fazer. */
export async function perfilDoUsuario(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("usuario").select("perfil").eq("id", user.id).maybeSingle();
  return data?.perfil ?? null;
}
