import { createHash, randomBytes } from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/server";

/** 256 bits aleatórios, seguros para URL. O banco nunca vê este valor. */
export function novoToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashDoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface ConviteValido {
  id: string;
  expira_em: string;
  profissional: {
    id: string;
    nome: string;
    cpf: string | null;
    especialidade: string | null;
    telefone: string | null;
    data_nascimento: string | null;
    registro_conselho: string | null;
  };
}

export type SituacaoConvite =
  | { ok: true; convite: ConviteValido }
  | { ok: false; motivo: "invalido" | "usado" | "expirado" | "revogado" | "ja_tem_acesso" };

/**
 * Lê o convite pelo token, com a service_role: quem abre o link ainda não
 * tem sessão. Só a página do convite e a ação de aceitar chamam isto.
 */
export async function situacaoDoConvite(token: string): Promise<SituacaoConvite> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return { ok: false, motivo: "invalido" };

  const admin = createAdminSupabase();
  const { data } = await admin
    .from("convite_profissional")
    .select(
      `id, expira_em, usado_em, revogado_em,
       profissional:profissional_id (id, nome, cpf, especialidade, telefone, data_nascimento,
                                     registro_conselho, usuario_id, ativo)`,
    )
    .eq("token_hash", hashDoToken(token))
    .maybeSingle();

  const c = data as unknown as {
    id: string;
    expira_em: string;
    usado_em: string | null;
    revogado_em: string | null;
    profissional:
      | (ConviteValido["profissional"] & { usuario_id: string | null; ativo: boolean })
      | null;
  } | null;

  if (!c?.profissional || !c.profissional.ativo) return { ok: false, motivo: "invalido" };
  if (c.usado_em) return { ok: false, motivo: "usado" };
  if (c.revogado_em) return { ok: false, motivo: "revogado" };
  if (new Date(c.expira_em) < new Date()) return { ok: false, motivo: "expirado" };
  if (c.profissional.usuario_id) return { ok: false, motivo: "ja_tem_acesso" };

  const { usuario_id: _u, ativo: _a, ...profissional } = c.profissional;
  return { ok: true, convite: { id: c.id, expira_em: c.expira_em, profissional } };
}
