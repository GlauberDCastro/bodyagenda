"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { env, chaveServiceRole } from "@/lib/env";
import type { Resultado } from "./recursos";

const vazioParaNulo = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), schema.nullable());

const usuarioSchema = z.object({
  nome: z.string().min(2, "Informe o nome"),
  email: z.email("E-mail inválido"),
  perfil: z.enum(["admin", "gestao", "financeiro", "recepcao", "profissional"]),
  senha: vazioParaNulo(z.string().min(8, "A senha precisa de ao menos 8 caracteres")),
  profissional_id: vazioParaNulo(z.uuid()),
  ativo: z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean()),
});

function validacao(issues: { path: PropertyKey[]; message: string }[]): Resultado {
  const campos: Record<string, string> = {};
  for (const i of issues) campos[String(i.path[0] ?? "_")] ??= i.message;
  return { erro: issues[0]?.message ?? "Dados inválidos", campos };
}

/** Só o admin cria e edita acesso — nem a gestão. Checado no servidor. */
async function exigirAdmin(): Promise<Resultado | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Sessão expirada." };

  const { data } = await supabase.from("usuario").select("perfil").eq("id", user.id).maybeSingle();

  return data?.perfil === "admin" ? null : { erro: "Apenas o administrador gerencia usuários." };
}

/**
 * Cria ou atualiza um usuário.
 *
 * Usa a service_role porque criar conta no Auth e definir senha exigem
 * privilégio que o RLS nega a todos — é o único uso legítimo dessa chave
 * (SPEC §5.3). A checagem de admin é feita ANTES, com a sessão real: sem ela,
 * a service_role deixaria qualquer um criar um admin para si.
 */
export async function salvarUsuario(
  id: string | null,
  _anterior: Resultado,
  formData: FormData,
): Promise<Resultado> {
  const negado = await exigirAdmin();
  if (negado) return negado;

  const parsed = usuarioSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validacao(parsed.error.issues);

  const { senha, profissional_id, ...dados } = parsed.data;

  if (!id && !senha) {
    return { erro: "Informe uma senha inicial.", campos: { senha: "Obrigatória" } };
  }

  const admin = createAdminSupabase();
  let idUsuario = id;

  if (!id) {
    const r = await fetch(`${env.supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: chaveServiceRole(),
        Authorization: `Bearer ${chaveServiceRole()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: dados.email,
        password: senha,
        email_confirm: true,
      }),
    });
    const corpo = await r.json();

    if (!r.ok) {
      const jaExiste = corpo?.error_code === "email_exists" || /already/i.test(corpo?.msg ?? "");
      return {
        erro: jaExiste
          ? "Já existe uma conta com este e-mail."
          : (corpo?.msg ?? "Não consegui criar a conta de acesso."),
        campos: jaExiste ? { email: "E-mail já usado" } : undefined,
      };
    }
    idUsuario = corpo.id;
  } else if (senha) {
    // Troca de senha só acontece quando o campo foi preenchido — em branco
    // significa "manter a atual", não "apagar".
    const r = await fetch(`${env.supabaseUrl}/auth/v1/admin/users/${id}`, {
      method: "PUT",
      headers: {
        apikey: chaveServiceRole(),
        Authorization: `Bearer ${chaveServiceRole()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: senha }),
    });
    if (!r.ok) return { erro: "Não consegui alterar a senha." };
  }

  if (!idUsuario) return { erro: "Não consegui determinar o usuário." };

  const { error } = await admin
    .from("usuario")
    .upsert({ id: idUsuario, ...dados }, { onConflict: "id" });

  if (error) return { erro: error.message };

  // Vínculo com o profissional: é o que faz o perfil `profissional` ver a
  // própria agenda e a própria comissão.
  await admin.from("profissional").update({ usuario_id: null }).eq("usuario_id", idUsuario);
  if (profissional_id) {
    const { error: erroVinculo } = await admin
      .from("profissional")
      .update({ usuario_id: idUsuario })
      .eq("id", profissional_id);
    if (erroVinculo) return { erro: erroVinculo.message };
  }

  revalidatePath("/configuracoes/usuarios");
  revalidatePath("/configuracoes/profissionais");
  return { ok: true };
}

/**
 * Desativa o acesso.
 *
 * Não apaga a conta: usuário desativado precisa continuar existindo para que
 * `criado_por` e a trilha de auditoria não virem referências órfãs.
 */
export async function alternarAcesso(id: string, ativo: boolean): Promise<Resultado> {
  const negado = await exigirAdmin();
  if (negado) return negado;

  const admin = createAdminSupabase();
  const { error } = await admin.from("usuario").update({ ativo }).eq("id", id);
  if (error) return { erro: error.message };

  revalidatePath("/configuracoes/usuarios");
  return { ok: true };
}

export async function listarUsuarios() {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("usuario")
    .select("id, nome, email, perfil, ativo, ultimo_acesso")
    .order("nome");

  const { data: vinculos } = await supabase.from("profissional").select("id, nome, usuario_id");

  return {
    usuarios: data ?? [],
    profissionais: vinculos ?? [],
  };
}
