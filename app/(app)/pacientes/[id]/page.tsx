import Link from "next/link";
import { notFound } from "next/navigation";
import {
  buscarPaciente,
  pacotesDoPaciente,
  agendamentosDoPaciente,
} from "@/lib/consultas/pacientes";
import { listarProcedimentos } from "@/lib/consultas/recursos";
import { formatarCpf } from "@/lib/domain/cpf";
import { Etiqueta, Vazio } from "@/components/ui/primitivos";
import { FormularioPacote } from "./formulario-pacote";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const TOM_STATUS: Record<string, "neutro" | "verde" | "ambar"> = {
  realizado: "verde",
  agendado: "neutro",
  confirmado: "neutro",
  em_atendimento: "ambar",
  falta: "ambar",
  cancelado: "neutro",
};

export default async function PacientePage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const [paciente, pacotes, agendamentos, procedimentos] = await Promise.all([
    buscarPaciente(id),
    pacotesDoPaciente(id),
    agendamentosDoPaciente(id),
    listarProcedimentos(),
  ]);

  if (!paciente) notFound();

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <Link
          href="/pacientes"
          className="text-sm text-slate-500 underline-offset-4 hover:underline dark:text-slate-400"
        >
          ← Pacientes
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">{paciente.nome}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {[
            paciente.cpf ? formatarCpf(paciente.cpf) : null,
            paciente.telefone,
            paciente.email,
          ]
            .filter(Boolean)
            .join(" · ") || "Sem dados de contato"}
        </p>
        {!paciente.consentimento_lgpd && (
          <Etiqueta tom="ambar">Consentimento LGPD pendente</Etiqueta>
        )}
      </header>

      {paciente.observacoes && (
        <section className="rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-800">
          <h2 className="mb-1 font-medium">Observações</h2>
          <p className="text-slate-600 dark:text-slate-400">{paciente.observacoes}</p>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold">Pacotes</h2>
          <FormularioPacote
            pacienteId={paciente.id}
            procedimentos={procedimentos.dados}
          />
        </div>

        {pacotes.length === 0 ? (
          <Vazio>Nenhum pacote vendido para este paciente.</Vazio>
        ) : (
          <div className="space-y-2">
            {pacotes.map((p) => {
              const valorLiquido = Number(p.valor_total) - Number(p.desconto);
              const porSessao = valorLiquido / p.quantidade_sessoes;
              return (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
                >
                  <div>
                    <p className="font-medium">{p.procedimento?.nome ?? "—"}</p>
                    <p className="text-slate-500 dark:text-slate-400">
                      {brl.format(valorLiquido)} · {brl.format(porSessao)} por sessão
                      {p.validade ? ` · validade ${p.validade}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* RF-62 · saldo no formato "sessão 3 de 10" */}
                    <span className="tabular-nums text-slate-600 dark:text-slate-400">
                      sessão {p.usadas} de {p.quantidade_sessoes}
                    </span>
                    <Etiqueta
                      tom={
                        p.status === "ativo"
                          ? p.restantes > 0
                            ? "verde"
                            : "ambar"
                          : "neutro"
                      }
                    >
                      {p.status === "ativo"
                        ? p.restantes > 0
                          ? `${p.restantes} restante(s)`
                          : "Sem saldo"
                        : p.status}
                    </Etiqueta>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Histórico de atendimentos</h2>
        {agendamentos.length === 0 ? (
          <Vazio>Nenhum atendimento registrado.</Vazio>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left dark:border-slate-800">
                <tr className="text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-2.5 font-medium">Quando</th>
                  <th className="px-4 py-2.5 font-medium">Procedimento</th>
                  <th className="px-4 py-2.5 font-medium">Sessão</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {agendamentos.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-900"
                  >
                    <td className="px-4 py-2.5 tabular-nums">
                      {dataHora.format(new Date(a.inicio))}
                    </td>
                    <td className="px-4 py-2.5">{a.procedimento?.nome ?? "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600 dark:text-slate-400">
                      {a.numero_sessao ?? "avulsa"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Etiqueta tom={TOM_STATUS[a.status] ?? "neutro"}>{a.status}</Etiqueta>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
