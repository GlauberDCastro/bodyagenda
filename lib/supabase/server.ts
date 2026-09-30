import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/supabase";
import { cookies } from "next/headers";
import { env, chaveServiceRole } from "@/lib/env";

/**
 * Cliente para Server Components e Server Actions.
 *
 * Next 16: `cookies()` é assíncrono de forma obrigatória — o acesso síncrono
 * que a v15 ainda tolerava foi removido. Por isso esta função é `async`.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl, env.supabaseChavePublica, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component não pode escrever cookie. O refresh de sessão
          // acontece no proxy.ts, então ignorar aqui é seguro.
        }
      },
    },
  });
}

/**
 * Cliente administrativo que IGNORA O RLS.
 *
 * Uso único e exclusivo: criação de usuário pelo admin (SPEC §5.3).
 * Qualquer outra chamada é bug de segurança — se você está usando isto para
 * "resolver" um erro de permissão, a política RLS é que está errada.
 */
export function createAdminSupabase() {
  return createServerClient<Database>(env.supabaseUrl, chaveServiceRole(), {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
