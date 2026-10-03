import Link from "next/link";
import { agendamentosDoPeriodo } from "@/lib/consultas/agenda";
import { hojeNaClinica } from "@/lib/consultas/caixa";
import { diaDeAtendimento } from "@/lib/grade-agenda";
import { expedienteDaClinica } from "@/lib/consultas/horarios";
import { ListaConfirmacoes } from "@/components/agenda/lista-confirmacoes";
import { Vazio } from "@/components/ui/primitivos";

export const metadata = { title: "Confirmações" };

const diaLongo = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  timeZone: "UTC",
});

const seta =
  "grid size-11 place-items-center rounded-full text-[18px] text-[var(--tinta-2)] hover:bg-[var(--superficie)]";

export default async function ConfirmacoesPage(props: { searchParams: Promise<{ dia?: string }> }) {
  const hoje = hojeNaClinica();
  const { dias: diasAbertos } = await expedienteDaClinica();
  const amanha = diaDeAtendimento(hoje, diasAbertos);
  const { dia = amanha } = await props.searchParams;

  const inicio = new Date(`${dia}T00:00:00-03:00`);
  const fim = new Date(inicio.getTime() + 24 * 3_600_000);
  const agendamentos = await agendamentosDoPeriodo(inicio, fim);
  // Quem falta confirmar primeiro; dentro de cada grupo, pela hora.
  const ordenados = [...agendamentos].sort(
    (a, b) =>
      Number(a.status !== "agendado") - Number(b.status !== "agendado") ||
      a.inicio.localeCompare(b.inicio),
  );
  const aConfirmar = agendamentos.filter((a) => a.status === "agendado").length;
  const confirmados = agendamentos.filter((a) => a.status === "confirmado").length;
  const rotulo = diaLongo.format(new Date(`${dia}T12:00:00Z`));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href={`/agenda?dia=${dia}`}
            className="text-[14px] text-[var(--tinta-3)] underline-offset-4 hover:text-[var(--tinta-1)] hover:underline"
          >
            ← Agenda
          </Link>
          <h1 className="titulo-xl mt-1">Confirmações</h1>
          <p className="mt-1 text-[15px] text-[var(--tinta-2)]">
            Mande a mensagem pelo WhatsApp e marque quem confirmou.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/agenda/confirmacoes?dia=${diaDeAtendimento(dia, diasAbertos, -1)}`}
            aria-label="Dia anterior"
            className={seta}
          >
            ‹
          </Link>
          <span className="rounded-full bg-[var(--superficie)] px-5 py-2.5 text-[15px] font-medium shadow-[var(--sombra-1)]">
            {rotulo.charAt(0).toUpperCase() + rotulo.slice(1)}
            {dia === amanha && <span className="text-[var(--tinta-3)]"> · próximo dia</span>}
          </span>
          <Link
            href={`/agenda/confirmacoes?dia=${diaDeAtendimento(dia, diasAbertos)}`}
            aria-label="Próximo dia"
            className={seta}
          >
            ›
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        {[
          { rotulo: "A confirmar", valor: aConfirmar },
          { rotulo: "Confirmados", valor: confirmados },
          { rotulo: "Atendimentos no dia", valor: agendamentos.length },
        ].map((k) => (
          <div key={k.rotulo} className="cartao px-5 py-4">
            <p className="text-[13px] text-[var(--tinta-3)]">{k.rotulo}</p>
            <p className="mt-1 text-[24px] font-semibold tabular-nums">{k.valor}</p>
          </div>
        ))}
      </div>

      {ordenados.length === 0 ? (
        <Vazio>Nenhum atendimento neste dia.</Vazio>
      ) : (
        <ListaConfirmacoes agendamentos={ordenados} />
      )}
    </div>
  );
}
