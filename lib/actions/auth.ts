"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/schemas/auth";
import { COOKIE_ATIVIDADE, opcoesCookieAtividade } from "@/lib/supabase/proxy";

export interface EstadoFormulario {
  erro?: string;
}

/**
 * Login novo zera a contagem de inatividade. Sem isto, uma marca antiga que
 * ficou no navegador (de uma sessão expirada) derrubava a sessão recém-aberta
 * no clique seguinte, e a pessoa voltava para o login em loop.
 */
export async function marcarAtividade() {
  (await cookies()).set(COOKIE_ATIVIDADE, String(Date.now()), opcoesCookieAtividade);
}

export async function entrar(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    senha: formData.get("senha"),
  });

  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.senha,
  });

  if (error) {
    // Mensagem genérica de propósito: distinguir "e-mail não existe" de
    // "senha errada" entrega a terceiros quem tem conta na clínica.
    return { erro: "E-mail ou senha incorretos." };
  }

  await marcarAtividade();
  const destino = String(formData.get("redirecionar") || "/");
  revalidatePath("/", "layout");
  redirect(destino.startsWith("/") ? destino : "/");
}

export async function sair() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
