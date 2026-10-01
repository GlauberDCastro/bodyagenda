import type { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { RELATORIOS } from "@/lib/exportar/relatorios";
import { gerarCsv, nomeDeArquivo } from "@/lib/exportar/formato";
import { gerarXlsx } from "@/lib/exportar/xlsx";

/** RF-102 · /api/exportar/<relatório>?formato=csv|xlsx&<os filtros da tela> */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ relatorio: string }> },
) {
  const { relatorio } = await ctx.params;
  const gerador = RELATORIOS[relatorio];
  if (!gerador) return new Response("Relatório não encontrado", { status: 404 });

  // A consulta roda com a sessão de quem pede: o RLS decide o que sai no arquivo.
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Faça login para exportar", { status: 401 });

  const params = request.nextUrl.searchParams;
  const planilha = await gerador(params);
  const nome = nomeDeArquivo(planilha.titulo);

  if (params.get("formato") === "xlsx") {
    return new Response(await gerarXlsx(planilha), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nome}.xlsx"`,
      },
    });
  }
  return new Response(gerarCsv(planilha), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}.csv"`,
    },
  });
}
