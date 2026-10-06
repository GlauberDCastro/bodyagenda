import { createServerSupabase } from "@/lib/supabase/server";
import { avaliarMetas, vendasSemRegiao, type Meta, type MetaAvaliada } from "@/lib/domain/metas";
import { expedienteDaClinica } from "./horarios";
import { carregarPainel, consolidar, resolverPeriodo } from "./painel";
import { vendasDoPeriodo } from "./gestao";

export interface MetasDoMes {
  ocupacao: number | null;
  metas: (Meta & { ordem: number })[];
}

export async function metasDoMes(mes: string): Promise<MetasDoMes> {
  const supabase = await createServerSupabase();
  const [{ data: m }, { data: lista }] = await Promise.all([
    supabase.from("meta_mes").select("ocupacao").eq("mes", mes).maybeSingle(),
    supabase.from("meta_venda").select("*").eq("mes", mes).order("ordem").order("rotulo"),
  ]);
  return {
    ocupacao: m?.ocupacao == null ? null : Number(m.ocupacao),
    metas: (lista ?? []).map((x) => ({
      id: x.id,
      rotulo: x.rotulo,
      procedimento_id: x.procedimento_id,
      regioes: x.regioes,
      contagem: x.contagem as Meta["contagem"],
      por_dia_min: Number(x.por_dia_min),
      por_dia_max: x.por_dia_max == null ? null : Number(x.por_dia_max),
      ordem: x.ordem,
    })),
  };
}

export interface AndamentoDasMetas {
  mes: string;
  hoje: string;
  ocupacao: { meta: number | null; efetivaAteHoje: number | null; agendadaNoMes: number | null };
  metas: MetaAvaliada[];
  semRegiao: number;
  diasDeAtendimento: { total: number; corridos: number };
}

/** Andamento do mês de `hoje`: vendas contra as metas e ocupação das salas contra a meta. */
export async function andamentoDasMetas(hoje: string): Promise<AndamentoDasMetas> {
  const mes = hoje.slice(0, 7);
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  const doMes = resolverPeriodo(`${mes}-01`, ultimo);
  const ateHoje = resolverPeriodo(`${mes}-01`, hoje);

  const [definidas, vendas, expediente, mesInteiro, corrido] = await Promise.all([
    metasDoMes(mes),
    vendasDoPeriodo(doMes),
    expedienteDaClinica(),
    carregarPainel("sala", doMes),
    carregarPainel("sala", ateHoje),
  ]);

  const diasDoMes = Array.from(
    { length: Number(ultimo.slice(8)) },
    (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`,
  ).filter(
    (d) =>
      expediente.dias.length === 0 ||
      expediente.dias.includes(new Date(`${d}T12:00:00Z`).getUTCDay()),
  );
  const paraMeta = vendas.map((v) => ({
    tipo: v.tipo,
    dia: v.dia,
    procedimento_id: v.procedimento_id,
    regioes: v.regioes,
  }));

  return {
    mes,
    hoje,
    ocupacao: {
      meta: definidas.ocupacao,
      efetivaAteHoje: consolidar(corrido.linhas).taxaEfetiva,
      agendadaNoMes: consolidar(mesInteiro.linhas).taxaAgendada,
    },
    metas: avaliarMetas(definidas.metas, paraMeta, { hoje, diasDoMes }),
    semRegiao: vendasSemRegiao(definidas.metas, paraMeta),
    diasDeAtendimento: {
      total: diasDoMes.length,
      corridos: diasDoMes.filter((d) => d <= hoje).length,
    },
  };
}
