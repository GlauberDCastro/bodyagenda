import Link from "next/link";
import { notFound } from "next/navigation";
import { buscarPaciente, pacotesDoPaciente, type PacoteComSaldo } from "@/lib/consultas/pacientes";
import { agendamentosDoPacienteNaAgenda, regrasDoCatalogo } from "@/lib/consultas/agenda";
import {
  listarEquipamentos,
  listarProcedimentos,
  listarProfissionais,
  listarSalas,
} from "@/lib/consultas/recursos";
import { formatarCpf } from "@/lib/domain/cpf";
import { Aviso, Etiqueta, Vazio } from "@/components/ui/primitivos";
import { FormularioPacote } from "./formulario-pacote";
import { cobrancas, diasDeAtraso, emAberto, hojeNaClinica } from "@/lib/consultas/caixa";
import { TabelaCobrancas } from "@/components/financeiro/tabela-cobrancas";
import { CancelarPacote } from "@/components/financeiro/cancelar-pacote";
import { AtivarPaciente } from "@/components/pacientes/ativar-paciente";
import { AtendimentosPaciente } from "@/components/pacientes/atendimentos-paciente";
import { ProvedorAgendamento } from "@/components/agenda/contexto-agendamento";
import { FINALIZADOS } from "@/lib/status-agendamento";
import { FormularioPaciente } from "../formulario-paciente";
import { NovoAgendamento } from "../../agenda/novo-agendamento";

const TZ = "America/Sao_Paulo";
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const data = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const diaCurto = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: TZ });
const desde = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: TZ });
const proximaData = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TZ,
});

function idade(nascimento: string, hoje: string): number {
  const [a, m, d] = nascimento.split("-").map(Number);
  const [ha, hm, hd] = hoje.split("-").map(Number);
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}

const ROTULO_PACOTE: Record<string, string> = {
  ativo: "Ativo",
  concluido: "Concluído",
  cancelado: "Cancelado",
  expirado: "Expirado",
};

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] text-[var(--tinta-3)]">{rotulo}</dt>
      <dd className="mt-0.5 truncate text-[14.5px] text-[var(--tinta-1)]">{children}</dd>
    </div>
  );
}

function Indicador({
  rotulo,
  valor,
  detalhe,
  tom,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  tom?: "critico";
}) {
  return (
    <div className="cartao px-5 py-4">
      <p className="text-[13px] text-[var(--tinta-3)]">{rotulo}</p>
      <p
        className="mt-1 text-[22px] font-semibold tabular-nums leading-tight tracking-tight"
        style={tom ? { color: "var(--status-critico)" } : undefined}
      >
        {valor}
      </p>
      {detalhe && <p className="mt-0.5 text-[13px] text-[var(--tinta-2)]">{detalhe}</p>}
    </div>
  );
}

/** RF-62 · realizadas, agendadas e a agendar numa barra só, cada uma no seu tom. */
function CartaoPacote({ p, pacienteId }: { p: PacoteComSaldo; pacienteId: string }) {
  const liquido = Number(p.valor_total) - Number(p.desconto);
  const total = p.quantidade_sessoes;
  const fatias = [
    { n: p.realizadas, cor: "var(--status-bom)", rotulo: "realizada(s)" },
    { n: p.agendadas, cor: "var(--serie-1)", rotulo: "agendada(s)" },
    { n: p.restantes, cor: "var(--traco-forte)", rotulo: "a agendar" },
  ];
  return (
    <div className="cartao space-y-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15.5px] font-semibold">{p.procedimento?.nome ?? "—"}</p>
          <p className="text-[13px] text-[var(--tinta-2)]">
            {brl.format(liquido)} · {brl.format(liquido / total)} por sessão
          </p>
        </div>
        <Etiqueta tom={p.status === "ativo" ? "bom" : "neutro"}>
          {ROTULO_PACOTE[p.status] ?? p.status}
        </Etiqueta>
      </div>

      <div
        className="flex h-2.5 gap-[2px] overflow-hidden rounded-full"
        role="img"
        aria-label={`${p.realizadas} de ${total} sessões realizadas, ${p.agendadas} agendadas, ${p.restantes} a agendar`}
      >
        {fatias
          .filter((f) => f.n > 0)
          .map((f) => (
            <span key={f.rotulo} style={{ flex: f.n, background: f.cor }} />
          ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[var(--tinta-2)]">
        {fatias.map((f) => (
          <li key={f.rotulo} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full" style={{ background: f.cor }} />
            <span className="font-medium tabular-nums text-[var(--tinta-1)]">{f.n}</span> {f.rotulo}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--traco)] pt-3 text-[12.5px] text-[var(--tinta-3)]">
        <span>
          {p.data_venda ? `Vendido em ${data(p.data_venda)}` : ""}
          {p.validade ? ` · válido até ${data(p.validade)}` : ""}
        </span>
        {p.status === "ativo" && (
          <CancelarPacote
            pacoteId={p.id}
            pacienteId={pacienteId}
            nome={p.procedimento?.nome ?? "pacote"}
          />
        )}
      </div>
    </div>
  );
}

export default async function PacientePage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vender?: string }>;
}) {
  const { id } = await props.params;
  const { vender } = await props.searchParams;

  const [
    paciente,
    pacotes,
    agendamentos,
    financeiro,
    salas,
    equipamentos,
    profissionais,
    procedimentos,
    regras,
  ] = await Promise.all([
    buscarPaciente(id),
    pacotesDoPaciente(id),
    agendamentosDoPacienteNaAgenda(id),
    cobrancas(id),
    listarSalas(),
    listarEquipamentos(),
    listarProfissionais(),
    listarProcedimentos(),
    regrasDoCatalogo(),
  ]);
  if (!paciente) notFound();

  const hoje = hojeNaClinica();
  const agora = new Date().toISOString();

  // Próximos: o que ainda vai acontecer. O resto (inclusive cancelados) é histórico.
  const proximos = agendamentos
    .filter((a) => a.inicio >= agora && !FINALIZADOS.includes(a.status))
    .reverse();
  const historico = agendamentos.filter((a) => !proximos.includes(a));
  const realizados = agendamentos.filter((a) => a.status === "realizado").length;
  const faltas = agendamentos.filter((a) => a.status === "falta").length;
  const ultimoRealizado = agendamentos.find((a) => a.status === "realizado");
  // Avaliação inicial: feita, só agendada, ou nenhuma (comum quando o comercial vendeu direto).
  const avaliacaoFeita = agendamentos.find(
    (a) => a.procedimento?.avaliacao && a.status === "realizado",
  );
  const avaliacaoAgendada = proximos.find((a) => a.procedimento?.avaliacao);

  // RF-13 · situação financeira na ficha.
  const abertas = financeiro.filter(emAberto);
  const totalAberto = abertas.reduce((t, c) => t + Number(c.valor), 0);
  const totalAtraso = abertas
    .filter((c) => diasDeAtraso(c.vencimento) > 0)
    .reduce((t, c) => t + Number(c.valor), 0);
  const totalPago = financeiro
    .filter((c) => c.status === "pago")
    .reduce((t, c) => t + Number(c.valor), 0);
  // Em ordem de vencimento: a próxima parcela a cobrar fica no topo das abertas.
  const cobrancasVisiveis = financeiro
    .filter((c) => c.status !== "cancelado")
    .sort(
      (a, b) =>
        Number(a.status === "pago") - Number(b.status === "pago") ||
        a.vencimento.localeCompare(b.vencimento) ||
        (a.parcela_num ?? 0) - (b.parcela_num ?? 0),
    );

  const pacotesAtivos = pacotes.filter((p) => p.status === "ativo");
  const outrosPacotes = pacotes.filter((p) => p.status !== "ativo");
  const iniciais = paciente.nome
    .replace(/\(.*?\)/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
  const telefone = paciente.telefone?.replace(/\D/g, "") ?? "";

  return (
    <ProvedorAgendamento>
      <div className="space-y-6">
        <Link
          href="/pacientes"
          className="text-[14px] text-[var(--tinta-3)] underline-offset-4 hover:text-[var(--tinta-1)] hover:underline"
        >
          ← Pacientes
        </Link>

        {/* Identificação, contato e ações num cartão só: é a "capa" da ficha. */}
        <header className="cartao space-y-6 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <span
                aria-hidden
                className="grid size-16 shrink-0 place-items-center rounded-full text-[22px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg, var(--marca), oklch(0.6 0.19 300))" }}
              >
                {iniciais}
              </span>
              <div className="min-w-0">
                <h1 className="titulo-xl">{paciente.nome}</h1>
                <p className="mt-1 text-[15px] text-[var(--tinta-2)]">
                  {[
                    paciente.data_nascimento && `${idade(paciente.data_nascimento, hoje)} anos`,
                    `paciente desde ${desde.format(new Date(paciente.created_at))}`,
                    ultimoRealizado &&
                      `última visita em ${diaCurto.format(new Date(ultimoRealizado.inicio))}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {!paciente.ativo && <Etiqueta>Inativo</Etiqueta>}
                  {paciente.consentimento_lgpd ? (
                    <Etiqueta tom="bom">LGPD assinado</Etiqueta>
                  ) : (
                    <Etiqueta tom="atencao">Consentimento LGPD pendente</Etiqueta>
                  )}
                  {avaliacaoFeita ? (
                    <Etiqueta tom="bom">
                      Avaliação em {diaCurto.format(new Date(avaliacaoFeita.inicio))}
                    </Etiqueta>
                  ) : avaliacaoAgendada ? (
                    <Etiqueta tom="marca">
                      Avaliação agendada para{" "}
                      {diaCurto.format(new Date(avaliacaoAgendada.inicio))}
                    </Etiqueta>
                  ) : (
                    <Etiqueta tom="atencao">Sem avaliação inicial</Etiqueta>
                  )}
                  {totalAtraso > 0 && (
                    <Etiqueta tom="critico">Em atraso: {brl.format(totalAtraso)}</Etiqueta>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <AtivarPaciente id={paciente.id} ativo={paciente.ativo} nome={paciente.nome} />
              <FormularioPaciente inicial={paciente} />
              <FormularioPacote
                pacienteId={paciente.id}
                procedimentos={procedimentos.dados.filter((p) => p.ativo)}
                variante="secundario"
                abertoInicial={vender === "1"}
              />
              {paciente.ativo && (
                <NovoAgendamento
                  rotulo="Agendar atendimento"
                  presetPadrao={{ paciente: { id: paciente.id, nome: paciente.nome } }}
                  salas={salas.dados.filter((s) => s.ativo)}
                  equipamentos={equipamentos.dados.filter((e) => e.ativo)}
                  profissionais={profissionais.dados.filter((p) => p.ativo)}
                  procedimentos={procedimentos.dados.filter((p) => p.ativo)}
                  diaPadrao={hoje}
                  regras={regras}
                />
              )}
            </div>
          </div>

          <dl className="grid gap-x-6 gap-y-4 border-t border-[var(--traco)] pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <Dado rotulo="Telefone">
              {paciente.telefone ? (
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{paciente.telefone}</span>
                  {telefone.length >= 10 && (
                    <a
                      href={`https://wa.me/${telefone.length <= 11 ? `55${telefone}` : telefone}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[13px] font-medium text-[var(--marca)] hover:underline"
                    >
                      WhatsApp
                    </a>
                  )}
                </span>
              ) : (
                "—"
              )}
            </Dado>
            <Dado rotulo="E-mail">
              {paciente.email ? (
                <a href={`mailto:${paciente.email}`} className="hover:underline">
                  {paciente.email}
                </a>
              ) : (
                "—"
              )}
            </Dado>
            <Dado rotulo="CPF">
              <span className="tabular-nums">{paciente.cpf ? formatarCpf(paciente.cpf) : "—"}</span>
            </Dado>
            <Dado rotulo="Nascimento">
              <span className="tabular-nums">
                {paciente.data_nascimento ? data(paciente.data_nascimento) : "—"}
              </span>
            </Dado>
            <div className="sm:col-span-2 lg:col-span-4">
              <Dado rotulo="Endereço">{paciente.endereco || "—"}</Dado>
            </div>
          </dl>
        </header>

        {paciente.observacoes && (
          <Aviso>
            <span className="font-medium">Observações do paciente:</span> {paciente.observacoes}
          </Aviso>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicador
            rotulo="Próximo atendimento"
            valor={
              proximos[0] ? proximaData.format(new Date(proximos[0].inicio)).replace(".", "") : "—"
            }
            detalhe={proximos[0]?.procedimento?.nome ?? "Nada agendado"}
          />
          <Indicador
            rotulo="Atendimentos realizados"
            valor={String(realizados)}
            detalhe={`${proximos.length} agendado(s)`}
          />
          <Indicador
            rotulo="Faltas"
            valor={String(faltas)}
            detalhe={
              realizados + faltas > 0
                ? `${Math.round((faltas / (realizados + faltas)) * 100)}% dos atendimentos`
                : "Sem histórico"
            }
            tom={faltas > 0 ? "critico" : undefined}
          />
          <Indicador
            rotulo="Em aberto"
            valor={brl.format(totalAberto)}
            detalhe={`${brl.format(totalPago)} já pago`}
            tom={totalAtraso > 0 ? "critico" : undefined}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-6">
            <AtendimentosPaciente proximos={proximos} historico={historico} />
          </div>

          <aside className="space-y-3">
            <h2 className="titulo-md">Pacotes</h2>
            {pacotes.length === 0 ? (
              <Vazio>Nenhum pacote vendido. Use &ldquo;Vender pacote&rdquo; no topo.</Vazio>
            ) : (
              <>
                {pacotesAtivos.map((p) => (
                  <CartaoPacote key={p.id} p={p} pacienteId={paciente.id} />
                ))}
                {outrosPacotes.length > 0 && (
                  <details className="group">
                    <summary className="cursor-pointer list-none py-1 text-[13.5px] text-[var(--tinta-2)] hover:text-[var(--tinta-1)]">
                      {outrosPacotes.length} pacote(s) encerrado(s)
                    </summary>
                    <div className="mt-2 space-y-3">
                      {outrosPacotes.map((p) => (
                        <CartaoPacote key={p.id} p={p} pacienteId={paciente.id} />
                      ))}
                    </div>
                  </details>
                )}
              </>
            )}
          </aside>
        </div>

        {/* Largura total: descrição, vencimento, valor e situação lado a lado. */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="titulo-md">Financeiro</h2>
            <p className="text-[13.5px] text-[var(--tinta-2)]">
              Pago {brl.format(totalPago)} · em aberto {brl.format(totalAberto)}
              {totalAtraso > 0 && ` · atrasado ${brl.format(totalAtraso)}`}
            </p>
          </div>
          <TabelaCobrancas
            cobrancas={cobrancasVisiveis}
            mostrarPaciente={false}
            vazio="Nenhuma cobrança. Sessões avulsas geram cobrança ao serem marcadas como realizadas."
          />
        </section>
      </div>
    </ProvedorAgendamento>
  );
}
