import type { NextRequest } from "next/server";
import { atualizarSessao } from "@/lib/supabase/proxy";

/**
 * Next 16 renomeou `middleware` para `proxy`. O runtime é nodejs e não é
 * configurável — o edge não é suportado aqui.
 */
export async function proxy(request: NextRequest) {
  return atualizarSessao(request);
}

export const config = {
  matcher: [
    // Tudo, menos estáticos e imagens.
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
