import Link from "next/link";
import {
  agendamentosDoPeriodo,
  contarAConfirmar,
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
import { diaDeAtendimento, diasDaSemana, somarDias, usaRecurso } from "@/lib/grade-agenda";
import { expedienteDaClinica } from "@/lib/consultas/horarios";

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

/** Dois eixos independentes: de quem é a agenda e quanto tempo ela cobre. */
const TIPOS = [
  { chave: "sala", rotulo: "Salas" },
  { chave: "equipamento", rotulo: "Equipamentos" },
  { chave: "profissional", rotulo: "Profissionais" },
] as const;
const PERIODOS = [
  { chave: "dia", rotulo: "Dia" },
  { chave: "semana", rotulo: "Semana" },
  { chave: "mes", rotulo: "Mês" },
] as const;
type Tipo = (typeof TIPOS)[number]["chave"];

function Segmentos({
  rotulo,
  opcoes,
  atual,
  href,
}: {
  rotulo: string;
  opcoes: readonly { chave: string; rotulo: string }[];
  atual: string;
  href: (chave: string) => string;
}) {
  return (
    <nav
      aria-label={rotulo}
      className="inline-flex flex-wrap gap-1 rounded-full bg-[var(--superficie)] p-1.5 shadow-[var(--sombra-1)]"
    >
      {opcoes.map((o) => (
        <Link
          key={o.chave}
          href={href(o.chave)}
          aria-current={atual === o.chave ? "page" : undefined}
          className={`rounded-full px-4 py-2 text-[14.5px] transition-colors ${
            atual === o.chave
              ? "bg-[var(--superficie-inversa)] font-medium text-[var(--tinta-inversa)]"
              : "text-[var(--tinta-2)] hover:text-[var(--tinta-1)]"
          }`}
        >
          {o.rotulo}
        </Link>
      ))}
    </nav>
  );
}

export default async function AgendaPage(props: {
  searchParams: Promise<{
    dia?: string;
    por?: string;
    periodo?: string;
    recurso?: string;
    status?: string;
  }>;
}) {
  const q = await props.searchParams;
  const { dia = hojeNaClinica(), status = "" } = q;
  // Links antigos usavam `por=semana` e `por=mes`; o tipo vinha do recurso.
  const legado = q.por === "semana" || q.por === "mes" ? q.por : null;
  const periodo = legado ?? (q.periodo === "semana" || q.periodo === "mes" ? q.periodo : "dia");
  const tipoBruto = legado ? q.recurso?.split(":")[0] : q.por;
  const tipo: Tipo = TIPOS.some((t) => t.chave === tipoBruto) ? (tipoBruto as Tipo) : "sala";
  // Recurso só vale para o tipo atual e fora do dia (no dia, cada recurso já é uma coluna).
  const recurso = periodo !== "dia" && q.recurso?.startsWith(`${tipo}:`) ? q.recurso : "";
  const semana = periodo === "semana";
  const mes = periodo === "mes";
  const hoje = hojeNaClinica();
  const dias = mes ? semanasDoMes(dia).flat() : semana ? diasDaSemana(dia) : [dia];
  const { inicio, fim } = limites(dias[0], dias[dias.length - 1]);

  // Atalho da véspera: quantos do próximo dia de atendimento faltam confirmar.
  const expediente = await expedienteDaClinica();
  const diaConfirmar = diaDeAtendimento(hoje, expediente.dias);
  // Semana sem os dias em que a clínica não abre (Configurações › Horários).
  const abre = (d: string) =>
    expediente.dias.length === 0 || expediente.dias.includes(new Date(`${d}T12:00:00Z`).getUTCDay());
  const limitesConfirmar = limites(diaConfirmar, diaConfirmar);
  const [
    salas,
    equipamentos,
    profissionais,
    procedimentos,
    todosAgendamentos,
    regras,
    capacidade,
    aConfirmar,
  ] = await Promise.all([
    listarSalas(),
    listarEquipamentos(),
    listarProfissionais(),
    listarProcedimentos(),
    agendamentosDoPeriodo(inicio, fim),
    regrasDoCatalogo(),
    // Mês: capacidade por dia do tipo (ou do recurso escolhido), para a barra de cada dia.
    mes
      ? serieOcupacao(tipo, dias[0], dias[dias.length - 1], recurso.split(":")[1])
      : Promise.resolve([]),
    contarAConfirmar(limitesConfirmar.inicio, limitesConfirmar.fim),
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
  const agendamentos = todosAgendamentos.filter(
    (a) =>
      (!status || a.status === (status as StatusAgendamento)) && (!filtro || usaRecurso(a, filtro)),
  );

  // Dia: uma coluna por recurso. Semana: uma coluna por dia, como no Google Calendar.
  const colunas: ColunaGrade[] = semana
    ? dias.filter(abre).map((d) => ({
        chave: d,
        rotulo: rotuloDia(d),
        subtitulo: d === hoje ? "Hoje" : undefined,
        dia: d,
        recurso: filtro,
        href: `/agenda?dia=${d}&por=${tipo}`,
        destaque: d === hoje,
      }))
    : colunasDe(tipo).map((r) => ({
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

  const linkAgenda = (m: { por: string; periodo: string; recurso?: string }) =>
    `/agenda?${new URLSearchParams({
      dia,
      por: m.por,
      ...(m.periodo !== "dia" && { periodo: m.periodo }),
      ...(m.recurso && { recurso: m.recurso }),
      ...(status && { status }),
    })}`;

  return (
    // O botão "Novo agendamento" e o clique na grade abrem o mesmo formulário.
    <ProvedorAgendamento>
      <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="titulo-xl">Agenda</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/agenda/confirmacoes?dia=${diaConfirmar}`}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--traco)] bg-[var(--superficie)] px-4 py-2.5 text-[13.5px] font-medium shadow-[var(--sombra-1)] transition-colors hover:bg-[var(--superficie-2)]"
            >
              Confirmações
              {aConfirmar > 0 && (
                <span className="rounded-full bg-[var(--superficie-inversa)] px-2 py-0.5 text-[12px] tabular-nums text-[var(--tinta-inversa)]">
                  {aConfirmar}
                </span>
              )}
            </Link>
            <NovoAgendamento
              salas={salas.dados.filter((s) => s.ativo)}
              equipamentos={equipamentos.dados.filter((e) => e.ativo)}
              profissionais={profissionais.dados.filter((p) => p.ativo)}
              procedimentos={procedimentos.dados.filter((p) => p.ativo)}
              diaPadrao={dia}
              regras={regras}
            />
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <Segmentos
            rotulo="Ver agenda por"
            opcoes={TIPOS}
            atual={tipo}
            href={(t) => linkAgenda({ por: t, periodo })}
          />
          <Segmentos
            rotulo="Período"
            opcoes={PERIODOS}
            atual={periodo}
            href={(p) => linkAgenda({ por: tipo, periodo: p, recurso })}
          />
        </div>

        <BarraAgenda
          dia={dia}
          tipo={tipo}
          periodo={periodo}
          hoje={hoje}
          anterior={diaAnterior}
          seguinte={diaSeguinte}
          status={status}
          recurso={recurso}
          recursos={colunasDe(tipo)}
          semana={diasDaSemana(dia).filter(abre)}
          resumo={resumo}
          diasAbertos={expediente.dias}
        />

        {mes ? (
          <AgendaMes
            dia={dia}
            tipo={tipo}
            hoje={hoje}
            agendamentos={agendamentos}
            capacidade={capacidade}
          />
        ) : (
          <Timeline
            colunas={colunas}
            agendamentos={agendamentos}
            semana={semana}
            hoje={hoje}
            horaInicio={expediente.horaInicio}
            horaFim={expediente.horaFim}
          />
        )}
      </div>
    </ProvedorAgendamento>
  );
}
