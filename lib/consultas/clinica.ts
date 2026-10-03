import { cache } from "react";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase/server";

/** Nome da clínica, editável em Configurações › Clínica. Uma consulta por requisição. */
export const nomeDaClinica = cache(async (): Promise<string> => {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("clinica").select("nome").maybeSingle();
  return data?.nome ?? "";
});

/**
 * Para páginas públicas (convite), onde o visitante ainda não tem sessão e o
 * RLS não deixaria ler. Só o nome sai daqui.
 */
export async function nomeDaClinicaPublico(): Promise<string> {
  const { data } = await createAdminSupabase().from("clinica").select("nome").maybeSingle();
  return data?.nome ?? "";
}
