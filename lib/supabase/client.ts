"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/supabase";
import { env } from "@/lib/env";

/** Cliente para componentes de navegador. Opera sob RLS, como qualquer usuário. */
export function createClient() {
  return createBrowserClient<Database>(env.supabaseUrl, env.supabaseChavePublica);
}
