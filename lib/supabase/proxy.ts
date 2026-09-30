import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

/** Rotas acessíveis sem sessão. */
const PUBLICAS = ["/login", "/auth"];

/**
 * Renova a sessão do Supabase e faz o redirecionamento otimista.
 *
 * Atenção ao limite disto: a documentação do Next 16 é explícita em que o
 * proxy NÃO é solução de autorização. Aqui só evitamos que um visitante sem
 * sessão veja a casca da aplicação. Quem de fato protege cada linha de cada
 * tabela é o RLS no Postgres (SPEC §5.2, princípio P2).
 */
export async function atualizarSessao(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl, env.supabaseChavePublica, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() revalida o token no servidor do Supabase. getSession() apenas lê
  // o cookie, que o cliente poderia ter forjado — por isso não serve aqui.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const caminho = request.nextUrl.pathname;
  const ehPublica = PUBLICAS.some((p) => caminho.startsWith(p));

  if (!user && !ehPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirecionar", caminho);
    return NextResponse.redirect(url);
  }

  if (user && caminho === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
