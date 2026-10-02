"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase/server";
import { env, chaveServiceRole } from "@/lib/env";
import { exigirAdmin } from "@/lib/auth/exigir-admin";
import { hashDoToken, novoToken, situacaoDoConvite } from "@/lib/auth/convites";
import { cpfValido, limparCpf } from "@/lib/domain/cpf";
import type { Resultado } from "./recursos";

/** Endereço público da aplicação, para montar o link (vale em produção e local). */
async function origem(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Gera o link de convite de um profissional ativo e sem acesso. Revoga o
 * convite pendente anterior: só o link mais recente funciona.
 */
export async function criarConvite(
  profissionalId: string,
): Promise<Resultado & { link?: string; expira_em?: string }> {
  const negado = await exigirAdmin();
  if (negado) return negado;

  const supabase = await createServerSupabase();
  const { data: prof } = await supabase
    .from("profissional")
    .select("id, ativo, usuario_id")
    .eq("id", profissionalId)
    .maybeSingle();
  if (!prof) return { erro: "Profissional não encontrado." };
  if (!prof.ativo) return { erro: "Reative o profissional antes de convidar." };
  if (prof.usuario_id) return { erro: "Este profissional já tem acesso ao sistema." };

  await supabase
    .from("convite_profissional")
    .update({ revogado_em: new Date().toISOString() })
    .eq("profissional_id", profissionalId)
    .is("usado_em", null)
    .is("revogado_em", null);

  const token = novoToken();
  const { data, error } = await supabase
    .from("convite_profissional")
    .insert({ profissional_id: profissionalId, token_hash: hashDoToken(token) })
    .select("expira_em")
    .single();
  if (error) return { erro: "Não consegui gerar o convite." };

  revalidatePath("/configuracoes/profissionais");
  return { ok: true, link: `${await origem()}/convite/${token}`, expira_em: data.expira_em };
}

export async function revogarConvite(profissionalId: string): Promise<Resultado> {
  const negado = await exigirAdmin();
  if (negado) return negado;

  const supabase = await createServerSupabase();
  await supabase
    .from("convite_profissional")
    .update({ revogado_em: new Date().toISOString() })
    .eq("profissional_id", profissionalId)
    .is("usado_em", null)
    .is("revogado_em", null);
  revalidatePath("/configuracoes/profissionais");
  return { ok: true };
}

const vazioParaNulo = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), schema.nullable());

const aceiteSchema = z
  .object({
    nome: z.string().trim().min(3, "Informe o nome completo"),
    email: z.email("E-mail inválido").transform((v) => v.trim().toLowerCase()),
    senha: z.string().min(8, "A senha precisa de ao menos 8 caracteres"),
    confirmacao: z.string(),
    cpf: z.string().refine(cpfValido, "CPF inválido").transform(limparCpf),
    telefone: z
      .string()
      .trim()
      .refine((v) => v.replace(/\D/g, "").length >= 10, "Informe o telefone com DDD"),
    data_nascimento: vazioParaNulo(z.string()),
    especialidade: vazioParaNulo(z.string().trim()),
    registro_conselho: vazioParaNulo(z.string().trim()),
  })
  .refine((d) => d.senha === d.confirmacao, {
    path: ["confirmacao"],
    message: "As senhas não conferem",
  });

const authAdmin = (caminho: string, init: RequestInit) =>
  fetch(`${env.supabaseUrl}/auth/v1/admin/${caminho}`, {
    ...init,
    headers: {
      apikey: chaveServiceRole(),
      Authorization: `Bearer ${chaveServiceRole()}`,
      "Content-Type": "application/json",
    },
  });

/**
 * O profissional aceita o convite: cria a conta, o usuário com perfil
 * `profissional` e o vínculo com o cadastro dele, e já entra no sistema.
 *
 * Sem sessão (é um visitante), então usa a service_role — mas só depois de
 * validar o token, e o convite é "reservado" com um update condicional antes
 * de criar a conta: dois envios simultâneos do mesmo link não criam duas.
 * Se algo falha depois de criar a conta, desfaz tudo e libera o convite.
 */
export async function aceitarConvite(
  token: string,
  _anterior: Resultado,
  formData: FormData,
): Promise<Resultado> {
  const parsed = aceiteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const campos: Record<string, string> = {};
    for (const i of parsed.error.issues) campos[String(i.path[0] ?? "_")] ??= i.message;
    return { erro: parsed.error.issues[0].message, campos };
  }
  const d = parsed.data;

  const situacao = await situacaoDoConvite(token);
  if (!situacao.ok) return { erro: "Este convite não vale mais. Peça um novo link à clínica." };
  const { convite } = situacao;

  const admin = createAdminSupabase();
  const agora = new Date().toISOString();
  const { data: reservado } = await admin
    .from("convite_profissional")
    .update({ usado_em: agora })
    .eq("id", convite.id)
    .is("usado_em", null)
    .is("revogado_em", null)
    .gt("expira_em", agora)
    .select("id");
  if (!reservado?.length)
    return { erro: "Este convite já foi usado. Entre com seu e-mail e senha." };

  const liberar = () =>
    admin.from("convite_profissional").update({ usado_em: null }).eq("id", convite.id);

  const r = await authAdmin("users", {
    method: "POST",
    body: JSON.stringify({ email: d.email, password: d.senha, email_confirm: true }),
  });
  const conta = await r.json();
  if (!r.ok) {
    await liberar();
    const jaExiste = conta?.error_code === "email_exists" || /already/i.test(conta?.msg ?? "");
    return jaExiste
      ? { erro: "Já existe uma conta com este e-mail.", campos: { email: "E-mail já usado" } }
      : { erro: "Não consegui criar sua conta. Tente de novo em instantes." };
  }

  const desfazer = async () => {
    await admin.from("profissional").update({ usuario_id: null }).eq("usuario_id", conta.id);
    await admin.from("usuario").delete().eq("id", conta.id);
    await authAdmin(`users/${conta.id}`, { method: "DELETE" });
    await liberar();
  };

  const { error: erroUsuario } = await admin
    .from("usuario")
    .insert({ id: conta.id, nome: d.nome, email: d.email, perfil: "profissional", ativo: true });
  if (erroUsuario) {
    await desfazer();
    return { erro: "Não consegui criar seu acesso. Tente de novo em instantes." };
  }

  const { error: erroProf } = await admin
    .from("profissional")
    .update({
      usuario_id: conta.id,
      nome: d.nome,
      cpf: d.cpf,
      telefone: d.telefone,
      data_nascimento: d.data_nascimento,
      especialidade: d.especialidade,
      registro_conselho: d.registro_conselho,
    })
    .eq("id", convite.profissional.id)
    .is("usuario_id", null);
  if (erroProf) {
    await desfazer();
    return erroProf.code === "23505"
      ? {
          erro: "Este CPF já está em outro cadastro. Fale com a clínica.",
          campos: { cpf: "CPF já cadastrado" },
        }
      : { erro: "Não consegui salvar seus dados. Tente de novo em instantes." };
  }

  await admin.from("convite_profissional").update({ usuario_id: conta.id }).eq("id", convite.id);

  // Já entra: a sessão nasce aqui, com os cookies da resposta.
  const supabase = await createServerSupabase();
  await supabase.auth.signInWithPassword({ email: d.email, password: d.senha });
  redirect("/");
}
