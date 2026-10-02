import { createServerSupabase } from "@/lib/supabase/server";
import type { Resultado } from "@/lib/actions/recursos";

/**
 * Só o admin cria acesso (usuário ou convite) — nem a gestão. Checado no
 * servidor com a sessão real, ANTES de qualquer uso da service_role.
 *
 * Fica fora de um arquivo "use server" de propósito: lá, toda função
 * exportada vira endpoint chamável pelo navegador.
 */
export async function exigirAdmin(): Promise<Resultado | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Sessão expirada." };

  const { data } = await supabase.from("usuario").select("perfil").eq("id", user.id).maybeSingle();

  return data?.perfil === "admin" ? null : { erro: "Apenas o administrador gerencia acessos." };
}
