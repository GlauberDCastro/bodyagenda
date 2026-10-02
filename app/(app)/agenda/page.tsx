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
import { BarraAgenda } from "@/components/agenda/barra-agenda";
import { serieOcupacao } from "@/lib/consultas/relatorios";
import type { StatusAgendamento } from "@/lib/types/database";
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
  { chave: "sala", rotulo: "Dia · Sala" },
  { chave: "equipamento", rotulo: "Dia · Equipamento" },
  { chave: "profissional", rotulo: "Dia · Profissional" },
  { chave: "semana", rotulo: "Semana" },
  { chave: "mes", rotulo: "Mês com ocupação" },
] as const;

export default async function AgendaPage(props: {
  searchParams: Promise<{ dia?: string; por?: string; recurso?: string; status?: string }>;
}) {
  const {
    dia = hojeNaClinica(),
    por = "sala",
    recurso = "",
    status = "",
  } = await props.searchParams;
  const semana = por === "semana";
  const mes = por === "mes";
  const hoje = hojeNaClinica();
  const dias = mes ? semanasDoMes(dia).flat() : semana ? diasDaSemana(dia) : [dia];
  const { inicio, fim } = limites(dias[0], dias[dias.length - 1]);

  const [salas, equipamentos, profissionais, procedimentos, todosAgendamentos, regras, capacidade] =
    await Promise.all([
      listarSalas(),
      listarEquipamentos(),
      listarProfissionais(),
      listarProcedimentos(),
      agendamentosDoPeriodo(inicio, fim),
      regrasDoCatalogo(),
      // Mês com ocupação: capacidade de sala por dia, para a barra de cada dia.
      mes ? serieOcupacao("sala", dias[0], dias[dias.length - 1]) : Promise.resolve([]),
    ]);
  const agendamentos = status
    ? todosAgendamentos.filter((a) => a.status === (status as StatusAgendamento))
    : todosAgendamentos;

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
  // No mês, as setas trocam de mês (dia 1 do mês vizinho).
  const mesVizinho = (delta: number) => {
    const [a, m] = dia.split("-").map(Number);
    return new Date(Date.UTC(a, m - 1 + delta, 1)).toISOString().slice(0, 10);
  };
  const diaAnterior = mes ? mesVizinho(-1) : somarDias(dia, -passo);
  const diaSeguinte = mes ? mesVizinho(1) : somarDias(dia, passo);

  const realizados = agendamentos.filter((a) => a.status === "realizado").length;
  const faltas = agendamentos.filter((a) => a.status === "falta").length;

  const resumo = [
    `${agendamentos.length} atendimento(s)`,
    `${realizados} realizado(s)`,
    faltas > 0 ? `${faltas} falta(s)` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    // O botão "Novo agendamento" e o clique na grade abrem o mesmo formulário.
    <ProvedorAgendamento>
      <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-[28px] font-semibold tracking-tight">Agenda</h1>
          <NovoAgendamento
            salas={salas.dados.filter((s) => s.ativo)}
            equipamentos={equipamentos.dados.filter((e) => e.ativo)}
            profissionais={profissionais.dados.filter((p) => p.ativo)}
            procedimentos={procedimentos.dados.filter((p) => p.ativo)}
            diaPadrao={dia}
            regras={regras}
          />
        </header>

        <nav
          aria-label="Visão da agenda"
          className="inline-flex flex-wrap gap-1 rounded-full bg-[var(--superficie)] p-1.5 shadow-[var(--sombra-1)]"
        >
          {VISOES.map((v) => (
            <Link
              key={v.chave}
              href={`/agenda?${new URLSearchParams({ dia, por: v.chave, ...(status && { status }) })}`}
              aria-current={por === v.chave ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-[14.5px] transition-colors ${
                por === v.chave
                  ? "bg-[var(--superficie-inversa)] font-medium text-[var(--tinta-inversa)]"
                  : "text-[var(--tinta-2)] hover:text-[var(--tinta-1)]"
              }`}
            >
              {v.rotulo}
            </Link>
          ))}
        </nav>

        <BarraAgenda
          dia={dia}
          por={por}
          hoje={hoje}
          anterior={diaAnterior}
          seguinte={diaSeguinte}
          status={status}
          recurso={semana ? recurso : ""}
          recursos={todosRecursos}
          semana={diasDaSemana(dia)}
          resumo={resumo}
        />

        {mes ? (
          <AgendaMes
            dia={dia}
            hoje={hoje}
            agendamentos={agendamentos}
            capacidade={capacidade}
          />
        ) : (
          <Timeline colunas={colunas} agendamentos={agendamentos} semana={semana} hoje={hoje} />
        )}
      </div>
    </ProvedorAgendamento>
  );
}
