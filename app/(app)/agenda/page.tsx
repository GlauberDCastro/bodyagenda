import Link from "next/link";
import { agendamentosDoPeriodo, type ColunaRecurso } from "@/lib/consultas/agenda";
import {
  listarSalas,
  listarEquipamentos,
  listarProfissionais,
  listarProcedimentos,
} from "@/lib/consultas/recursos";
import { Timeline } from "@/components/agenda/timeline";
import { AvisoBanco } from "@/components/ui/primitivos";
import { NovoAgendamento } from "./novo-agendamento";

export const metadata = { title: "Agenda" };

const TZ = "America/Sao_Paulo";

/** "hoje" no fuso da clínica, não no do servidor. */
function hojeNaClinica(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/** Limites do dia local convertidos para instantes absolutos. */
function limitesDoDia(dia: string): { inicio: Date; fim: Date } {
  const inicio = new Date(`${dia}T00:00:00-03:00`);
  const fim = new Date(inicio.getTime() + 24 * 3_600_000);
  return { inicio, fim };
}

const VISOES = [
  { chave: "sala", rotulo: "Salas" },
  { chave: "equipamento", rotulo: "Equipamentos" },
  { chave: "profissional", rotulo: "Profissionais" },
] as const;

export default async function AgendaPage(props: {
  searchParams: Promise<{ dia?: string; por?: string }>;
}) {
  const { dia = hojeNaClinica(), por = "sala" } = await props.searchParams;
  const { inicio, fim } = limitesDoDia(dia);

  const [salas, equipamentos, profissionais, procedimentos, agendamentos] =
    await Promise.all([
      listarSalas(),
      listarEquipamentos(),
      listarProfissionais(),
      listarProcedimentos(),
      agendamentosDoPeriodo(inicio, fim),
    ]);

  if (salas.semSchema) return <AvisoBanco />;

  const colunas: ColunaRecurso[] =
    por === "equipamento"
      ? equipamentos.dados
          .filter((e) => e.ativo)
          .map((e) => ({
            tipo: "equipamento" as const,
            id: e.id,
            rotulo: e.nome,
            subtitulo: e.modelo,
          }))
      : por === "profissional"
        ? profissionais.dados
            .filter((p) => p.ativo)
            .map((p) => ({
              tipo: "profissional" as const,
              id: p.id,
              rotulo: p.nome,
              subtitulo: p.especialidade ?? undefined,
            }))
        : salas.dados
            .filter((s) => s.ativo)
            .map((s) => ({
              tipo: "sala" as const,
              id: s.id,
              rotulo: `Sala ${s.numero}`,
              subtitulo: s.nome,
            }));

  const diaAnterior = new Date(inicio.getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const diaSeguinte = new Date(inicio.getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10);

  const realizados = agendamentos.filter((a) => a.status === "realizado").length;
  const faltas = agendamentos.filter((a) => a.status === "falta").length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {agendamentos.length} atendimento(s) · {realizados} realizado(s)
            {faltas > 0 && ` · ${faltas} falta(s)`}
          </p>
        </div>
        <NovoAgendamento
          salas={salas.dados.filter((s) => s.ativo)}
          equipamentos={equipamentos.dados.filter((e) => e.ativo)}
          profissionais={profissionais.dados.filter((p) => p.ativo)}
          procedimentos={procedimentos.dados.filter((p) => p.ativo)}
          diaPadrao={dia}
        />
      </header>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1">
          <Link
            href={`/agenda?dia=${diaAnterior}&por=${por}`}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            ←
          </Link>
          {/* Estado na URL: qualquer visão da agenda é compartilhável por link. */}
          <form method="get" className="flex items-center gap-1">
            <input type="hidden" name="por" value={por} />
            <input
              type="date"
              name="dia"
              defaultValue={dia}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </form>
          <Link
            href={`/agenda?dia=${diaSeguinte}&por=${por}`}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            →
          </Link>
          <Link
            href={`/agenda?dia=${hojeNaClinica()}&por=${por}`}
            className="ml-1 rounded-md px-2 py-1 text-sm text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            Hoje
          </Link>
        </div>

        <nav className="flex gap-1 rounded-lg border border-slate-200 p-0.5 dark:border-slate-800">
          {VISOES.map((v) => (
            <Link
              key={v.chave}
              href={`/agenda?dia=${dia}&por=${v.chave}`}
              className={`rounded-md px-2.5 py-1 text-sm transition ${
                por === v.chave
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              {v.rotulo}
            </Link>
          ))}
        </nav>
      </div>

      <Timeline
        colunas={colunas}
        agendamentos={agendamentos}
        pertence={(a, c) =>
          c.tipo === "sala"
            ? a.sala_id === c.id
            : c.tipo === "equipamento"
              ? a.equipamentos.some((e) => e.id === c.id)
              : a.profissionais.some((p) => p.id === c.id)
        }
      />
    </div>
  );
}
