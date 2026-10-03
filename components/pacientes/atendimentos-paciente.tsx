"use client";

import { useState } from "react";
import type { AgendamentoNaAgenda } from "@/lib/consultas/agenda";
import { COR_STATUS, ROTULO_STATUS } from "@/lib/status-agendamento";
import { DetalheAtendimento } from "@/components/agenda/detalhe-atendimento";
import { Vazio } from "@/components/ui/primitivos";

const TZ = "America/Sao_Paulo";
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const dia = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", timeZone: TZ });
const mesCurto = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: TZ });
const semana = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: TZ });
const dataCompleta = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: TZ,
});

function Status({ a }: { a: AgendamentoNaAgenda }) {
  const cor = COR_STATUS[a.status] ?? "var(--tinta-3)";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13.5px] text-[var(--tinta-1)]">
      <span aria-hidden className="size-2 rounded-full" style={{ background: cor }} />
      {ROTULO_STATUS[a.status]}
    </span>
  );
}

const cobranca = (a: AgendamentoNaAgenda) =>
  a.pacote_id && a.numero_sessao
    ? `Sessão ${a.numero_sessao}${a.sessoes_pacote ? ` de ${a.sessoes_pacote}` : ""}`
    : a.valor_avulso
      ? `Avulsa · ${brl.format(a.valor_avulso)}`
      : "Avulsa";

/** De onde veio o atendimento, quando não foi a agenda da clínica. */
const origem = (a: AgendamentoNaAgenda) =>
  a.origem === "upsell"
    ? `Upsell${a.vendedor ? ` · ${a.vendedor.nome.split(" ")[0]}` : ""}`
    : a.origem === "comercial"
      ? `Comercial${a.vendedor ? ` · ${a.vendedor.nome.split(" ")[0]}` : ""}`
      : null;

const quem = (a: AgendamentoNaAgenda) =>
  [a.profissionais.map((p) => p.nome.split(" ")[0]).join(", "), a.sala && `Sala ${a.sala.numero}`]
    .filter(Boolean)
    .join(" · ");

/**
 * Próximos atendimentos em destaque e o histórico abaixo. Clicar abre o mesmo
 * painel da agenda: status, edição e próxima sessão sem sair da ficha.
 */
export function AtendimentosPaciente({
  proximos,
  historico,
}: {
  proximos: AgendamentoNaAgenda[];
  historico: AgendamentoNaAgenda[];
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const selecionado = [...proximos, ...historico].find((a) => a.id === aberto);

  return (
    <>
      <section className="space-y-3">
        <h2 className="titulo-md">Próximos atendimentos</h2>
        {proximos.length === 0 ? (
          <Vazio>Nenhum atendimento futuro. Use &ldquo;Agendar atendimento&rdquo; no topo.</Vazio>
        ) : (
          <ul className="cartao divide-y divide-[var(--traco)] overflow-hidden">
            {proximos.map((a) => {
              const d = new Date(a.inicio);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setAberto(a.id)}
                    className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-[var(--superficie-2)]"
                  >
                    <span className="grid w-12 shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--superficie-2)] py-1.5 text-center leading-tight">
                      <span className="text-[11.5px] uppercase text-[var(--tinta-3)]">
                        {mesCurto.format(d).replace(".", "")}
                      </span>
                      <span className="text-[19px] font-semibold tabular-nums">
                        {dia.format(d)}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">
                        {a.procedimento?.nome ?? "—"}
                      </span>
                      <span className="block truncate text-[13.5px] text-[var(--tinta-2)]">
                        {semana.format(d).replace(".", "")}, {hora.format(d)} · {quem(a)} ·{" "}
                        {cobranca(a)}
                        {origem(a) && ` · ${origem(a)}`}
                      </span>
                    </span>
                    <Status a={a} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="titulo-md">Histórico de atendimentos</h2>
        {historico.length === 0 ? (
          <Vazio>Nenhum atendimento anterior.</Vazio>
        ) : (
          <div className="cartao overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead className="border-b border-[var(--traco)] text-left text-[13px] text-[var(--tinta-3)]">
                <tr>
                  <th className="px-5 py-3 font-medium">Data</th>
                  <th className="px-5 py-3 font-medium">Procedimento</th>
                  <th className="px-5 py-3 font-medium">Com</th>
                  <th className="px-5 py-3 font-medium">Cobrança</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => setAberto(a.id)}
                    className="cursor-pointer border-b border-[var(--traco)] transition-colors last:border-0 hover:bg-[var(--superficie-2)]"
                  >
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums">
                      {/* O botão leva o teclado à linha; o clique vale na linha toda. */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAberto(a.id);
                        }}
                        className="text-left hover:underline"
                      >
                        {dataCompleta.format(new Date(a.inicio)).replace(".", "")},{" "}
                        {hora.format(new Date(a.inicio))}
                      </button>
                    </td>
                    <td className="px-5 py-3 font-medium">
                      {a.procedimento?.nome ?? "—"}
                      {origem(a) && (
                        <span className="block text-[12.5px] font-normal text-[var(--tinta-3)]">
                          {origem(a)}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-[var(--tinta-2)]">{quem(a) || "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-[var(--tinta-2)]">
                      {cobranca(a)}
                    </td>
                    <td className="px-5 py-3">
                      <Status a={a} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selecionado && (
        <DetalheAtendimento
          agendamento={selecionado}
          aberto
          aoFechar={() => setAberto(null)}
          naFicha
        />
      )}
    </>
  );
}
