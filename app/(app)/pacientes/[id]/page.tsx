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
import { cobrancas, diasDeAtraso, emAberto } from "@/lib/consultas/caixa";
import { TabelaCobrancas } from "@/components/financeiro/tabela-cobrancas";
import { CancelarPacote } from "@/components/financeiro/cancelar-pacote";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const TOM_STATUS: Record<string, "neutro" | "bom" | "atencao"> = {
  realizado: "bom",
  agendado: "neutro",
  confirmado: "neutro",
  em_atendimento: "atencao",
  falta: "atencao",
  cancelado: "neutro",
};

export default async function PacientePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const [paciente, pacotes, agendamentos, procedimentos, financeiro] = await Promise.all([
    buscarPaciente(id),
    pacotesDoPaciente(id),
    agendamentosDoPaciente(id),
    listarProcedimentos(),
    cobrancas(id),
  ]);

  // RF-13 · situação financeira na ficha.
  const abertas = financeiro.filter(emAberto);
  const emAtraso = abertas.filter((c) => diasDeAtraso(c.vencimento) > 0);
  const totalAberto = abertas.reduce((t, c) => t + Number(c.valor), 0);
  const totalAtraso = emAtraso.reduce((t, c) => t + Number(c.valor), 0);
  const totalPago = financeiro
    .filter((c) => c.status === "pago")
    .reduce((t, c) => t + Number(c.valor), 0);
  const cobrancasVisiveis = [...financeiro]
    .filter((c) => c.status !== "cancelado")
    .sort((a, b) => b.vencimento.localeCompare(a.vencimento));

  if (!paciente) notFound();

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <Link
          href="/pacientes"
          className="text-sm text-[var(--tinta-3)] underline-offset-4 hover:underline "
        >
          ← Pacientes
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">{paciente.nome}</h1>
        <p className="text-sm text-[var(--tinta-3)]">
          {[paciente.cpf ? formatarCpf(paciente.cpf) : null, paciente.telefone, paciente.email]
            .filter(Boolean)
            .join(" · ") || "Sem dados de contato"}
        </p>
        <div className="flex flex-wrap gap-2">
          {!paciente.consentimento_lgpd && (
            <Etiqueta tom="atencao">Consentimento LGPD pendente</Etiqueta>
          )}
          {totalAtraso > 0 && (
            <Etiqueta tom="critico">Em atraso: {brl.format(totalAtraso)}</Etiqueta>
          )}
        </div>
      </header>

      {paciente.observacoes && (
        <section className="rounded-lg border border-[var(--traco)] p-4 text-sm ">
          <h2 className="mb-1 font-medium">Observações</h2>
          <p className="text-[var(--tinta-2)]">{paciente.observacoes}</p>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold">Pacotes</h2>
          <FormularioPacote pacienteId={paciente.id} procedimentos={procedimentos.dados} />
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
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--traco)] p-3 text-sm "
                >
                  <div>
                    <p className="font-medium">{p.procedimento?.nome ?? "—"}</p>
                    <p className="text-[var(--tinta-3)]">
                      {brl.format(valorLiquido)} · {brl.format(porSessao)} por sessão
                      {p.validade ? ` · validade ${p.validade}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* RF-62 · saldo no formato "sessão 3 de 10" */}
                    <span className="tabular-nums text-[var(--tinta-2)]">
                      sessão {p.usadas} de {p.quantidade_sessoes}
                    </span>
                    <Etiqueta
                      tom={p.status === "ativo" ? (p.restantes > 0 ? "bom" : "atencao") : "neutro"}
                    >
                      {p.status === "ativo"
                        ? p.restantes > 0
                          ? `${p.restantes} restante(s)`
                          : "Sem saldo"
                        : p.status}
                    </Etiqueta>
                    {p.status === "ativo" && (
                      <CancelarPacote
                        pacoteId={p.id}
                        pacienteId={paciente.id}
                        nome={p.procedimento?.nome ?? "pacote"}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Financeiro</h2>
          <p className="text-[13px] text-[var(--tinta-3)]">
            Pago {brl.format(totalPago)} · em aberto {brl.format(totalAberto)}
            {totalAtraso > 0 && ` · atrasado ${brl.format(totalAtraso)}`}
          </p>
        </div>
        <TabelaCobrancas
          cobrancas={cobrancasVisiveis}
          mostrarPaciente={false}
          vazio="Nenhuma cobrança para este paciente."
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Histórico de atendimentos</h2>
        {agendamentos.length === 0 ? (
          <Vazio>Nenhum atendimento registrado.</Vazio>
        ) : (
          <div className="cartao overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--traco)] text-left ">
                <tr className="text-[var(--tinta-3)]">
                  <th className="px-4 py-2.5 font-medium">Quando</th>
                  <th className="px-4 py-2.5 font-medium">Procedimento</th>
                  <th className="px-4 py-2.5 font-medium">Sessão</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {agendamentos.map((a) => (
                  <tr key={a.id} className="border-b border-[var(--traco)] last:border-0 ">
                    <td className="px-4 py-2.5 tabular-nums">
                      {dataHora.format(new Date(a.inicio))}
                    </td>
                    <td className="px-4 py-2.5">{a.procedimento?.nome ?? "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--tinta-2)]">
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
