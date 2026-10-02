"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { mudarStatus } from "@/lib/actions/agenda";
import type { AgendamentoNaAgenda } from "@/lib/consultas/agenda";
import type { StatusAgendamento } from "@/lib/types/database";
import { COR_STATUS, ROTULO_STATUS } from "@/lib/status-agendamento";
import { linkWhatsApp, mensagemConfirmacao } from "@/lib/whatsapp";
import { Botao } from "@/components/ui/primitivos";

const hora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

function Linha({ a }: { a: AgendamentoNaAgenda }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const cor = COR_STATUS[a.status] ?? "var(--tinta-3)";
  const whatsapp = linkWhatsApp(
    a.paciente?.telefone,
    mensagemConfirmacao(a.paciente?.nome ?? "", a.procedimento?.nome ?? "", a.inicio),
  );

  const mudar = (status: StatusAgendamento) =>
    iniciar(async () => {
      const f = new FormData();
      f.set("id", a.id);
      f.set("status", status);
      const r = await mudarStatus({}, f);
      setErro(r.erro ?? null);
      if (r.ok) router.refresh();
    });

  return (
    <li className="grid items-center gap-x-4 gap-y-2 px-5 py-4 md:grid-cols-[4.5rem_minmax(0,1fr)_auto]">
      <span className="text-[17px] font-semibold tabular-nums">
        {hora.format(new Date(a.inicio))}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {a.paciente ? (
            <Link
              href={`/pacientes/${a.paciente.id}`}
              className="truncate text-[15.5px] font-medium hover:underline"
            >
              {a.paciente.nome}
            </Link>
          ) : (
            "—"
          )}
          <span className="inline-flex items-center gap-1.5 text-[13.5px]">
            <span aria-hidden className="size-2 rounded-full" style={{ background: cor }} />
            {ROTULO_STATUS[a.status]}
          </span>
        </span>
        <span className="block truncate text-[13.5px] text-[var(--tinta-2)]">
          {[
            a.procedimento?.nome,
            a.profissionais.map((p) => p.nome.split(" ")[0]).join(", "),
            a.sala && `Sala ${a.sala.numero}`,
            a.paciente?.telefone ?? "sem telefone",
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {erro && (
          <span
            role="alert"
            className="block text-[13px]"
            style={{ color: "var(--status-critico)" }}
          >
            {erro}
          </span>
        )}
      </span>
      <span className="flex flex-wrap items-center gap-2 md:justify-end">
        {whatsapp && a.status === "agendado" && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-[var(--traco)] px-4 py-2.5 text-[13.5px] font-medium transition-colors hover:bg-[var(--superficie-2)]"
          >
            WhatsApp
          </a>
        )}
        {a.status === "agendado" ? (
          <Botao type="button" onClick={() => mudar("confirmado")} disabled={pendente}>
            {pendente ? "Salvando…" : "Confirmado"}
          </Botao>
        ) : a.status === "confirmado" ? (
          <Botao
            type="button"
            variante="fantasma"
            onClick={() => mudar("agendado")}
            disabled={pendente}
          >
            Desfazer
          </Botao>
        ) : null}
      </span>
    </li>
  );
}

/**
 * Véspera: quem atende no dia, com a mensagem de confirmação pronta no
 * WhatsApp e um clique para registrar a resposta.
 */
export function ListaConfirmacoes({ agendamentos }: { agendamentos: AgendamentoNaAgenda[] }) {
  return (
    <ul className="cartao divide-y divide-[var(--traco)] overflow-hidden">
      {agendamentos.map((a) => (
        <Linha key={a.id} a={a} />
      ))}
    </ul>
  );
}
