import Link from "next/link";
import {
  agendamentosDoPeriodo,
  regrasDoCatalogo,
  type ColunaRecurso,
} from "@/lib/consultas/agenda";
import {
  listarSalas,
  listarEquipamentos,
  listarProfissionais,
  listarProcedimentos,
} from "@/lib/consultas/recursos";
import { Timeline } from "@/components/agenda/timeline";
import { AvisoBanco } from "@/components/ui/primitivos";
import { NovoAgendamento } from "./novo-agendamento";
import { ProvedorAgendamento } from "@/components/agenda/contexto-agendamento";
import { FiltroRecurso } from "@/components/agenda/filtro-recurso";
import { AgendaMes, semanasDoMes } from "@/components/agenda/mes";
import type { ColunaGrade } from "@/components/agenda/timeline";
import { diasDaSemana, somarDias } from "@/lib/grade-agenda";

export const metadata = { title: "Agenda" };

const TZ = "America/Sao_Paulo";

/** "hoje" no fuso da clínica, não no do servidor. */
function hojeNaClinica(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/** Limites dos dias locais convertidos para instantes absolutos. */
function limites(primeiro: string, ultimo: string): { inicio: Date; fim: Date } {
  const inicio = new Date(`${primeiro}T00:00:00-03:00`);
  const fim = new Date(new Date(`${ultimo}T00:00:00-03:00`).getTime() + 24 * 3_600_000);
  return { inicio, fim };
}

const SEMANA_CURTA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
/** "Seg 05/10" */
const rotuloDia = (dia: string) =>
  `${SEMANA_CURTA[new Date(`${dia}T12:00:00Z`).getUTCDay()]} ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

const VISOES = [
  { chave: "sala", rotulo: "Salas" },
  { chave: "equipamento", rotulo: "Equipamentos" },
  { chave: "profissional", rotulo: "Profissionais" },
  { chave: "semana", rotulo: "Semana" },
  { chave: "mes", rotulo: "Mês" },
] as const;

export default async function AgendaPage(props: {
  searchParams: Promise<{ dia?: string; por?: string; recurso?: string }>;
}) {
  const { dia = hojeNaClinica(), por = "sala", recurso = "" } = await props.searchParams;
  const semana = por === "semana";
  const mes = por === "mes";
  const hoje = hojeNaClinica();
  const dias = mes ? semanasDoMes(dia).flat() : semana ? diasDaSemana(dia) : [dia];
  const { inicio, fim } = limites(dias[0], dias[dias.length - 1]);

  const [salas, equipamentos, profissionais, procedimentos, agendamentos, regras] =
    await Promise.all([
      listarSalas(),
      listarEquipamentos(),
      listarProfissionais(),
      listarProcedimentos(),
      agendamentosDoPeriodo(inicio, fim),
      regrasDoCatalogo(),
    ]);

  if (salas.semSchema) return <AvisoBanco />;

  const colunasDe = (tipo: string): ColunaRecurso[] =>
    tipo === "equipamento"
      ? equipamentos.dados
          .filter((e) => e.ativo)
          .map((e) => ({
            tipo: "equipamento" as const,
            id: e.id,
            rotulo: e.nome,
            subtitulo: e.modelo,
          }))
      : tipo === "profissional"
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

  const todosRecursos = [
    ...colunasDe("sala"),
    ...colunasDe("equipamento"),
    ...colunasDe("profissional"),
  ];
  const filtro = todosRecursos.find((r) => `${r.tipo}:${r.id}` === recurso);

  // Dia: uma coluna por recurso. Semana: uma coluna por dia, como no Google Calendar.
  const colunas: ColunaGrade[] = semana
    ? dias.map((d) => ({
        chave: d,
        rotulo: rotuloDia(d),
        subtitulo: d === hoje ? "Hoje" : undefined,
        dia: d,
        recurso: filtro,
        href: `/agenda?dia=${d}&por=${filtro?.tipo ?? "sala"}`,
        destaque: d === hoje,
      }))
    : colunasDe(por).map((r) => ({
        chave: `${r.tipo}-${r.id}`,
        rotulo: r.rotulo,
        subtitulo: r.subtitulo,
        dia,
        recurso: r,
      }));

  const passo = semana ? 7 : 1;
  const comFiltro = semana && recurso ? `&recurso=${recurso}` : "";
  // No mês, as setas trocam de mês (dia 1 do mês vizinho).
  const mesVizinho = (delta: number) => {
    const [a, m] = dia.split("-").map(Number);
    return new Date(Date.UTC(a, m - 1 + delta, 1)).toISOString().slice(0, 10);
  };
  const diaAnterior = mes ? mesVizinho(-1) : somarDias(dia, -passo);
  const diaSeguinte = mes ? mesVizinho(1) : somarDias(dia, passo);

  const realizados = agendamentos.filter((a) => a.status === "realizado").length;
  const faltas = agendamentos.filter((a) => a.status === "falta").length;

  return (
    // O botão "Novo agendamento" e o clique na grade abrem o mesmo formulário.
    <ProvedorAgendamento>
      <div className="space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Agenda</h1>
            <p className="text-sm text-[var(--tinta-3)]">
              {agendamentos.length} atendimento(s) · {realizados} realizado(s)
              {faltas > 0 && ` · ${faltas} falta(s)`}
              {semana && ` na semana de ${rotuloDia(dias[0])} a ${rotuloDia(dias[6])}`} · clique ou
              arraste num horário para agendar, arraste o atendimento para remarcar
            </p>
          </div>
          <NovoAgendamento
            salas={salas.dados.filter((s) => s.ativo)}
            equipamentos={equipamentos.dados.filter((e) => e.ativo)}
            profissionais={profissionais.dados.filter((p) => p.ativo)}
            procedimentos={procedimentos.dados.filter((p) => p.ativo)}
            diaPadrao={dia}
            regras={regras}
          />
        </header>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1">
            <Link
              href={`/agenda?dia=${diaAnterior}&por=${por}${comFiltro}`}
              className="rounded-md border border-[var(--traco)] px-2 py-1 text-sm transition hover:bg-[var(--superficie-2)] dark:hover:bg-slate-800"
            >
              ←
            </Link>
            {/* Estado na URL: qualquer visão da agenda é compartilhável por link. */}
            <form method="get" className="flex items-center gap-1">
              <input type="hidden" name="por" value={por} />
              {semana && recurso && <input type="hidden" name="recurso" value={recurso} />}
              <input
                type="date"
                name="dia"
                defaultValue={dia}
                className="rounded-md border border-[var(--traco)] px-2 py-1 text-sm "
              />
            </form>
            <Link
              href={`/agenda?dia=${diaSeguinte}&por=${por}${comFiltro}`}
              className="rounded-md border border-[var(--traco)] px-2 py-1 text-sm transition hover:bg-[var(--superficie-2)] dark:hover:bg-slate-800"
            >
              →
            </Link>
            <Link
              href={`/agenda?dia=${hoje}&por=${por}${comFiltro}`}
              className="ml-1 rounded-md px-2 py-1 text-sm text-[var(--tinta-3)] transition hover:text-[var(--tinta-1)] dark:hover:text-slate-100"
            >
              Hoje
            </Link>
          </div>

          <nav className="flex gap-1 rounded-lg border border-[var(--traco)] p-0.5 ">
            {VISOES.map((v) => (
              <Link
                key={v.chave}
                href={`/agenda?dia=${dia}&por=${v.chave}`}
                className={`rounded-md px-2.5 py-1 text-sm transition ${
                  por === v.chave
                    ? "bg-[var(--superficie-inversa)] font-medium text-[var(--tinta-inversa)]"
                    : "text-[var(--tinta-2)] hover:text-[var(--tinta-1)] dark:hover:text-slate-100"
                }`}
              >
                {v.rotulo}
              </Link>
            ))}
          </nav>

          {semana && <FiltroRecurso dia={dia} valor={recurso} recursos={todosRecursos} />}
        </div>

        {mes ? (
          <AgendaMes dia={dia} hoje={hoje} agendamentos={agendamentos} />
        ) : (
          <Timeline colunas={colunas} agendamentos={agendamentos} semana={semana} />
        )}
      </div>
    </ProvedorAgendamento>
  );
}
