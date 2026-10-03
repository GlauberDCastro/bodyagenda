"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Resultado } from "./recursos";

const clinicaSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da clínica").max(80, "Nome longo demais"),
});

/** Admin e gestão editam; o RLS recusa os demais e a linha não muda. */
export async function salvarClinica(_anterior: Resultado, formData: FormData): Promise<Resultado> {
  const parsed = clinicaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      erro: parsed.error.issues[0].message,
      campos: { nome: parsed.error.issues[0].message },
    };
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("clinica")
    .update({ nome: parsed.data.nome })
    .eq("unica", true)
    .select("id");
  if (error || !data?.length) return { erro: "Seu perfil não pode alterar os dados da clínica." };

  // O nome aparece no topo de todas as páginas.
  revalidatePath("/", "layout");
  return { ok: true };
}
