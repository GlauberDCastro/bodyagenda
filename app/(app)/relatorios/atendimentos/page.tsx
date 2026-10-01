import Link from "next/link";
import { listarAtendimentos } from "@/lib/consultas/relatorios";
import { hojeNaClinica, resolverPeriodo } from "@/lib/consultas/painel";
import { SeletorPeriodo } from "@/components/relatorios/seletor-periodo";
import { Cabecalho, Etiqueta, Tabela, Td, Th, Tr, Vazio } from "@/components/ui/primitivos";
import type { StatusAgendamento, TipoRecurso } from "@/lib/types/database";
import { Exportar } from "@/components/relatorios/exportar";

export const metadata = { title: "Atendimentos" };

const ROTULO: Record<StatusAgendamento, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  em_atendimento: "Em atendimento",
  realizado: "Realizado",
  falta: "Falta",
  cancelado: "Cancelado",
};
const TOM: Record<StatusAgendamento, "neutro" | "bom" | "atencao" | "critico"> = {
  agendado: "neutro",
  confirmado: "neutro",
  em_atendimento: "atencao",
  realizado: "bom",
  falta: "critico",
  cancelado: "neutro",
};
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

/** RF-77 · os atendimentos por trás de cada número do painel. */
export default async function AtendimentosPage(props: {
  searchParams: Promise<{
    de?: string;
    ate?: string;
    status?: string;
    tipo?: string;
    recurso?: string;
    nome?: string;
  }>;
}) {
  const sp = await props.searchParams;
  const periodo = resolverPeriodo(sp.de, sp.ate);
  const status = sp.status ? (sp.status.split(",") as StatusAgendamento[]) : undefined;
  const tipo = (["sala", "equipamento", "profissional"] as const).find((t) => t === sp.tipo) as
    | TipoRecurso
    | undefined;

  const lista = await listarAtendimentos({
    inicio: periodo.inicio,
    fim: periodo.fim,
    status,
    tipo,
    recursoId: sp.recurso,
  });

  const filtros = [
    status ? status.map((s) => ROTULO[s]).join(" ou ") : "Todos os status",
    sp.nome,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/" className="text-sm text-[var(--tinta-3)] underline-offset-4 hover:underline">
          ← Painel
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">Atendimentos</h1>
        <p className="text-sm text-[var(--tinta-3)]">
          {periodo.rotulo} · {filtros.join(" · ")} · {lista.length} atendimento(s)
        </p>
      </header>

      <div className="flex justify-end">
        <Exportar
          relatorio="atendimentos"
          params={{ de: periodo.de, ate: periodo.ate, status: sp.status, tipo: sp.tipo, recurso: sp.recurso }}
        />
      </div>

      <SeletorPeriodo
        caminho="/relatorios/atendimentos"
        de={periodo.de}
        ate={periodo.ate}
        hoje={hojeNaClinica()}
        manter={{ status: sp.status, tipo: sp.tipo, recurso: sp.recurso, nome: sp.nome }}
      />

      {lista.length === 0 ? (
        <Vazio>Nenhum atendimento com estes filtros.</Vazio>
      ) : (
        <Tabela>
          <Cabecalho>
            <Th>Quando</Th>
            <Th>Paciente</Th>
            <Th>Procedimento</Th>
            <Th>Sala</Th>
            <Th>Profissionais</Th>
            <Th>Status</Th>
          </Cabecalho>
          <tbody>
            {lista.map((a) => (
              <Tr key={a.id}>
                <Td>
                  <Link
                    href={`/agenda?dia=${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(a.inicio))}`}
                    className="hover:underline"
                  >
                    {dataHora.format(new Date(a.inicio))}
                  </Link>
                </Td>
                <Td forte>
                  {a.paciente ? (
                    <Link href={`/pacientes/${a.paciente.id}`} className="hover:underline">
                      {a.paciente.nome}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>{a.procedimento?.nome ?? "—"}</Td>
                <Td>{a.sala ? `Sala ${a.sala.numero}` : "—"}</Td>
                <Td>{a.profissionais.join(", ") || "—"}</Td>
                <Td>
                  <Etiqueta tom={TOM[a.status]}>{ROTULO[a.status]}</Etiqueta>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Tabela>
      )}
    </div>
  );
}
