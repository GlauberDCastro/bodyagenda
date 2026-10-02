"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { mudarStatus, salvarObservacoes } from "@/lib/actions/agenda";
import { resumoPacienteAction } from "@/lib/actions/busca";
import type { Resultado } from "@/lib/actions/recursos";
import type { AgendamentoNaAgenda } from "@/lib/consultas/agenda";
import type { ResumoPaciente } from "@/lib/consultas/pacientes";
import type { StatusAgendamento } from "@/lib/types/database";
import { COR_STATUS, FINALIZADOS, ROTULO_STATUS } from "@/lib/status-agendamento";
import { Modal } from "@/components/ui/modal";
import { Aviso, Botao, Campo, Textarea } from "@/components/ui/primitivos";
import { useAgendamento } from "./contexto-agendamento";
import { linkWhatsApp, mensagemConfirmacao } from "@/lib/whatsapp";

const TZ = "America/Sao_Paulo";
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const diaLongo = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  timeZone: TZ,
});
const diaCurto = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: TZ,
});

/** "2026-10-06T09:00" no fuso da clínica, para o datetime-local. */
const paraLocal = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short", timeZone: TZ })
    .format(d)
    .replace(" ", "T");

/** O caminho normal do atendimento, na ordem em que a recepção o percorre. */
const ETAPAS: StatusAgendamento[] = ["agendado", "confirmado", "em_atendimento", "realizado"];

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] text-[var(--tinta-3)]">{rotulo}</dt>
      <dd className="mt-0.5 text-[14.5px] leading-snug text-[var(--tinta-1)]">{children}</dd>
    </div>
  );
}

/**
 * Painel do atendimento: tudo o que a recepção precisa sem sair da agenda —
 * quem é, o que vai fazer, onde, com quem, quanto custa, o alerta clínico,
 * e as ações (status, editar, próxima sessão, ficha, WhatsApp).
 */
export function DetalheAtendimento({
  agendamento: a,
  aberto,
  aoFechar,
  naFicha = false,
}: {
  agendamento: AgendamentoNaAgenda;
  aberto: boolean;
  aoFechar: () => void;
  /** Na própria ficha, o link "Abrir ficha" não leva a lugar novo. */
  naFicha?: boolean;
}) {
  const { abrir } = useAgendamento();
  const [resumo, setResumo] = useState<ResumoPaciente | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [editandoObs, setEditandoObs] = useState(false);
  const [obs, setObs] = useState(a.observacoes ?? "");
  const [erroObs, setErroObs] = useState<string | null>(null);
  const [salvandoObs, salvarObs] = useTransition();
  const pacienteId = a.paciente?.id;

  useEffect(() => {
    if (!aberto || !pacienteId) return;
    let vivo = true;
    resumoPacienteAction(pacienteId, a.id).then((r) => vivo && setResumo(r));
    return () => {
      vivo = false;
    };
  }, [aberto, pacienteId, a.id]);

  const fechar = () => {
    setCancelando(false);
    setEditandoObs(false);
    aoFechar();
  };

  const [estado, acaoStatus, enviando] = useActionState<Resultado, FormData>(
    async (anterior, formData) => {
      const r = await mudarStatus(anterior, formData);
      if (r.ok) fechar();
      return r;
    },
    {},
  );

  const inicio = new Date(a.inicio);
  const fim = new Date(a.fim);
  const buffer = a.procedimento?.buffer_min ?? 0;
  const minutos = Math.round((fim.getTime() - inicio.getTime()) / 60_000) - buffer;
  const finalizado = FINALIZADOS.includes(a.status);
  const cor = COR_STATUS[a.status] ?? "var(--tinta-3)";
  const sessaoDoPacote =
    a.pacote_id && a.numero_sessao && a.sessoes_pacote
      ? `Pacote · sessão ${a.numero_sessao} de ${a.sessoes_pacote}`
      : null;
  const paciente = a.paciente ?? { id: "", nome: "Paciente" };

  const whatsapp = linkWhatsApp(
    resumo?.telefone,
    mensagemConfirmacao(paciente.nome, a.procedimento?.nome ?? "", a.inicio),
  );

  /** Valores atuais do atendimento, para editar ou repetir na próxima sessão. */
  const base = {
    paciente,
    procedimento_id: a.procedimento?.id,
    sala_id: a.sala_id,
    equipamentos: a.equipamentos.map((e) => e.id),
    profissionais: a.profissionais.map((p) => p.id),
    // Só manda a duração se ela foi ajustada; senão vale a do procedimento.
    duracao_min: minutos !== a.procedimento?.duracao_min ? minutos : null,
    valor_avulso: a.valor_avulso,
  };

  const editar = () => {
    fechar();
    abrir({
      ...base,
      pacote_id: a.pacote_id ?? undefined,
      inicio: paraLocal(inicio),
      observacoes: a.observacoes,
      edicao: {
        id: a.id,
        pacote: sessaoDoPacote
          ? `${a.procedimento?.nome} · ${sessaoDoPacote.toLowerCase()}`
          : undefined,
      },
    });
  };

  const proximaSessao = () => {
    fechar();
    // Mesmo dia da semana e horário, uma semana depois: o ponto de partida mais comum.
    abrir({
      ...base,
      pacote_id: a.pacote_id ?? undefined,
      inicio: paraLocal(new Date(inicio.getTime() + 7 * 86_400_000)),
    });
  };

  return (
    <Modal
      aberto={aberto}
      aoFechar={fechar}
      largura="max-w-2xl"
      titulo={paciente.nome}
      descricao={`${a.procedimento?.nome ?? "—"} · ${diaLongo.format(inicio)} · ${hora.format(inicio)}–${hora.format(fim)}`}
    >
      <div className="space-y-6">
        {/* Situação e atalhos do paciente */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13.5px] font-medium"
            style={{ background: `color-mix(in oklab, ${cor} 14%, var(--superficie))` }}
          >
            <span aria-hidden className="size-2 rounded-full" style={{ background: cor }} />
            {ROTULO_STATUS[a.status]}
          </span>
          {!naFicha && paciente.id && (
            <Link
              href={`/pacientes/${paciente.id}`}
              className="rounded-full border border-[var(--traco)] px-3 py-1.5 text-[13.5px] text-[var(--tinta-1)] transition-colors hover:bg-[var(--superficie-2)]"
            >
              Abrir ficha do paciente
            </Link>
          )}
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-[var(--traco)] px-3 py-1.5 text-[13.5px] text-[var(--tinta-1)] transition-colors hover:bg-[var(--superficie-2)]"
            >
              Confirmar pelo WhatsApp
            </a>
          )}
          {resumo?.telefone && (
            <span className="text-[13.5px] tabular-nums text-[var(--tinta-2)]">
              {resumo.telefone}
            </span>
          )}
        </div>

        {/* Alertas antes de tudo: é o que não pode passar despercebido. */}
        {resumo && (resumo.observacoes || resumo.emAtraso > 0 || !resumo.consentimento_lgpd) && (
          <div className="space-y-2">
            {resumo.observacoes && (
              <Aviso>
                <span className="font-medium">Observações do paciente:</span> {resumo.observacoes}
              </Aviso>
            )}
            {resumo.emAtraso > 0 && (
              <Aviso tom="critico">
                Pagamento em atraso de {brl.format(resumo.emAtraso)}. Confira na ficha antes de
                atender.
              </Aviso>
            )}
            {!resumo.consentimento_lgpd && (
              <Aviso tom="neutro">
                Consentimento LGPD pendente: colha a assinatura na recepção.
              </Aviso>
            )}
          </div>
        )}

        <dl className="grid gap-x-6 gap-y-4 rounded-[var(--r-lg)] border border-[var(--traco)] p-4 sm:grid-cols-2">
          <Item rotulo="Procedimento">
            {a.procedimento?.nome ?? "—"}
            <span className="text-[var(--tinta-3)]"> · {minutos} min</span>
          </Item>
          <Item rotulo="Cobrança">
            {sessaoDoPacote ??
              (a.valor_avulso ? `Avulsa · ${brl.format(a.valor_avulso)}` : "Avulsa · sem valor")}
          </Item>
          <Item rotulo="Sala">{a.sala ? `Sala ${a.sala.numero} — ${a.sala.nome}` : "—"}</Item>
          <Item rotulo={a.profissionais.length > 1 ? "Profissionais" : "Profissional"}>
            {a.profissionais.length ? a.profissionais.map((p) => p.nome).join(", ") : "Nenhum"}
          </Item>
          <Item rotulo="Equipamentos">
            {a.equipamentos.length ? a.equipamentos.map((e) => e.nome).join(", ") : "Nenhum"}
          </Item>
          <Item rotulo="Horário">
            {hora.format(inicio)}–{hora.format(fim)}
            {buffer > 0 && (
              <span className="text-[var(--tinta-3)]"> · inclui {buffer} min de preparo</span>
            )}
          </Item>
          {editandoObs ? (
            <div className="space-y-2 sm:col-span-2">
              <Campo label="Observações do atendimento">
                <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} autoFocus />
              </Campo>
              {erroObs && (
                <p role="alert" className="text-[13px]" style={{ color: "var(--status-critico)" }}>
                  {erroObs}
                </p>
              )}
              <div className="flex gap-2">
                <Botao
                  type="button"
                  disabled={salvandoObs}
                  onClick={() =>
                    salvarObs(async () => {
                      const r = await salvarObservacoes(a.id, obs);
                      setErroObs(r.erro ?? null);
                      if (r.ok) setEditandoObs(false);
                    })
                  }
                >
                  {salvandoObs ? "Salvando…" : "Salvar observações"}
                </Botao>
                <Botao type="button" variante="fantasma" onClick={() => setEditandoObs(false)}>
                  Cancelar
                </Botao>
              </div>
            </div>
          ) : (
            a.observacoes && (
              <div className="sm:col-span-2">
                <Item rotulo="Observações do atendimento">{a.observacoes}</Item>
              </div>
            )
          )}
          {a.status === "cancelado" && a.motivo_cancelamento && (
            <div className="sm:col-span-2">
              <Item rotulo="Motivo do cancelamento">{a.motivo_cancelamento}</Item>
            </div>
          )}
        </dl>

        {/* RF-50 a RF-52 · o caminho do atendimento, clicável em qualquer etapa. */}
        <form action={acaoStatus} className="space-y-3">
          <input type="hidden" name="id" value={a.id} />
          <h3 className="text-[13px] font-medium text-[var(--tinta-2)]">Status do atendimento</h3>
          {!cancelando && (
            <>
              <div className="grid grid-cols-2 gap-1 rounded-[var(--r-lg)] bg-[var(--superficie-2)] p-1 sm:grid-cols-4">
                {ETAPAS.map((s, i) => {
                  const atual = a.status === s;
                  const passou = ETAPAS.indexOf(a.status) > i;
                  return (
                    <button
                      key={s}
                      type="submit"
                      name="status"
                      value={s}
                      disabled={atual || enviando}
                      aria-current={atual ? "step" : undefined}
                      className={`flex items-center justify-center gap-1.5 rounded-[var(--r-md)] px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
                        atual
                          ? "bg-[var(--superficie-inversa)] text-[var(--tinta-inversa)]"
                          : "text-[var(--tinta-2)] hover:bg-[var(--superficie)] hover:text-[var(--tinta-1)]"
                      }`}
                    >
                      {passou && <span aria-hidden>✓</span>}
                      {s === "agendado" ? "A confirmar" : ROTULO_STATUS[s]}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {a.status !== "falta" && (
                  <Botao
                    type="submit"
                    name="status"
                    value="falta"
                    variante="secundario"
                    disabled={enviando}
                  >
                    Falta
                  </Botao>
                )}
                {a.status !== "cancelado" && (
                  <Botao type="button" variante="perigo" onClick={() => setCancelando(true)}>
                    Cancelar atendimento
                  </Botao>
                )}
                {a.status !== "realizado" && (
                  <p className="text-[12.5px] text-[var(--tinta-3)]">
                    {a.pacote_id
                      ? "Realizado ou falta baixa a sessão do pacote."
                      : a.valor_avulso
                        ? `Realizado lança a cobrança de ${brl.format(a.valor_avulso)}.`
                        : null}
                  </p>
                )}
              </div>
            </>
          )}

          {cancelando && (
            <div className="space-y-2">
              <Campo label="Motivo do cancelamento">
                <Textarea name="motivo_cancelamento" rows={2} required autoFocus />
              </Campo>
              <div className="flex gap-2">
                <Botao type="submit" name="status" value="cancelado" variante="perigo">
                  Confirmar cancelamento
                </Botao>
                <Botao type="button" variante="fantasma" onClick={() => setCancelando(false)}>
                  Voltar
                </Botao>
              </div>
            </div>
          )}
          {estado.erro && (
            <p role="alert" className="text-[13px]" style={{ color: "var(--status-critico)" }}>
              {estado.erro}
            </p>
          )}
        </form>

        {/* Histórico curto: frequência e o que vem antes e depois deste atendimento. */}
        {resumo && (
          <div className="grid gap-3 border-t border-[var(--traco)] pt-5 text-[13.5px] sm:grid-cols-3">
            <div>
              <p className="text-[12.5px] text-[var(--tinta-3)]">Frequência</p>
              <p className="mt-0.5">
                {resumo.realizados} realizado(s)
                {resumo.faltas > 0 && (
                  <span style={{ color: "var(--status-critico)" }}>
                    {" "}
                    · {resumo.faltas} falta(s)
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-[12.5px] text-[var(--tinta-3)]">Atendimento anterior</p>
              <p className="mt-0.5">
                {resumo.ultimo
                  ? `${diaCurto.format(new Date(resumo.ultimo.inicio))} · ${resumo.ultimo.procedimento} (${ROTULO_STATUS[resumo.ultimo.status as StatusAgendamento]?.toLowerCase() ?? resumo.ultimo.status})`
                  : "Primeiro atendimento"}
              </p>
            </div>
            <div>
              <p className="text-[12.5px] text-[var(--tinta-3)]">Próximo agendado</p>
              <p className="mt-0.5">
                {resumo.proximo
                  ? `${diaCurto.format(new Date(resumo.proximo.inicio))} às ${hora.format(new Date(resumo.proximo.inicio))} · ${resumo.proximo.procedimento}`
                  : "Nenhum"}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--traco)] pt-4">
          {finalizado && (
            <p className="mr-auto text-[12.5px] text-[var(--tinta-3)]">
              Atendimento encerrado: só as observações mudam. Para o resto, volte o status.
            </p>
          )}
          <Botao type="button" variante="secundario" onClick={proximaSessao}>
            Agendar próxima sessão
          </Botao>
          {finalizado ? (
            <Botao
              type="button"
              onClick={() => {
                setObs(a.observacoes ?? "");
                setEditandoObs(true);
              }}
              disabled={editandoObs}
            >
              Editar observações
            </Botao>
          ) : (
            <Botao type="button" onClick={editar}>
              Editar atendimento
            </Botao>
          )}
        </div>
      </div>
    </Modal>
  );
}
