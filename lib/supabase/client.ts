"use client";

import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/** Cliente para componentes de navegador. Opera sob RLS, como qualquer usuário. */
export function createClient() {
  return createBrowserClient(env.supabaseUrl, env.supabaseChavePublica);
}
