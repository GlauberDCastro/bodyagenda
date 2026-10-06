import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

/** Rotas acessíveis sem sessão. */
const PUBLICAS = ["/login", "/auth", "/convite"];

/** RF-05 · sessão expira após 8 h sem nenhuma requisição. */
const INATIVIDADE_MAX_MS = 8 * 60 * 60 * 1000;
export const COOKIE_ATIVIDADE = "hd_ultima_atividade";

export const opcoesCookieAtividade = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

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

  if (user && !ehPublica) {
    const ultima = Number(request.cookies.get(COOKIE_ATIVIDADE)?.value ?? 0);
    if (ultima && Date.now() - ultima > INATIVIDADE_MAX_MS) {
      // signOut() limpa os cookies de sessão através do setAll acima.
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("expirada", "1");
      url.searchParams.set("redirecionar", caminho);
      const redirecionar = NextResponse.redirect(url);
      for (const c of response.cookies.getAll()) redirecionar.cookies.set(c);
      redirecionar.cookies.delete(COOKIE_ATIVIDADE);
      return redirecionar;
    }
    response.cookies.set(COOKIE_ATIVIDADE, String(Date.now()), opcoesCookieAtividade);
  }

  if (user && caminho === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
