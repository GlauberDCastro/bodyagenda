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
import { Formulario } from "@/components/ui/formulario";
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
      <dt className="text-[12px] font-medium text-[var(--tinta-2)]">{rotulo}</dt>
      <dd className="mt-0.5 text-[14px] font-medium leading-snug text-[var(--tinta-1)]">
        {children}
      </dd>
    </div>
  );
}

const ICONES = {
  ficha: "M16 19v-2a4 4 0 0 0-8 0v2M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  whatsapp:
    "M4 20l1.3-3.9A8 8 0 1 1 8 19.2L4 20Z M9 10c.5 2 2 3.5 4 4l1.2-1.1 2 .9c-.3 1-1.2 1.7-2.2 1.6-3.3-.4-6-3.1-6.4-6.4 0-1 .6-1.9 1.6-2.2l.9 2Z",
} as const;

function Icone({ d }: { d: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
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

  /**
   * Upsell: a profissional vendeu outro procedimento durante o atendimento.
   * "Agora" começa no fim deste (mesma sala, mesma profissional); "outro dia"
   * sugere a semana seguinte. O formulário escolhe aparelhos e confere conflito.
   */
  const upsell = (agora: boolean) => {
    fechar();
    abrir({
      paciente,
      sala_id: a.sala_id,
      profissionais: a.profissionais.map((p) => p.id),
      inicio: paraLocal(agora ? fim : new Date(inicio.getTime() + 7 * 86_400_000)),
      upsell: {
        origemId: a.id,
        descricao: `${a.procedimento?.nome ?? "o atendimento"} de ${diaCurto.format(inicio)}, ${hora.format(inicio)}`,
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

  /** O próximo passo natural do atendimento: um botão com cor, à vista. */
  const proximo: {
    status: StatusAgendamento;
    rotulo: string;
    variante: "marca" | "sucesso";
  } | null =
    a.status === "agendado"
      ? { status: "confirmado", rotulo: "Confirmar presença", variante: "marca" }
      : a.status === "confirmado"
        ? { status: "em_atendimento", rotulo: "Iniciar atendimento", variante: "marca" }
        : a.status === "em_atendimento"
          ? { status: "realizado", rotulo: "Concluir atendimento", variante: "sucesso" }
          : null;

  const efeito =
    a.status === "realizado"
      ? null
      : a.pacote_id
        ? "Realizado ou falta baixa a sessão do pacote."
        : a.valor_avulso
          ? `Realizado lança a cobrança de ${brl.format(a.valor_avulso)}.`
          : null;

  const pilulaAtalho =
    "inline-flex items-center gap-1.5 rounded-full border border-[var(--traco-forte)] bg-[var(--superficie)] px-3 py-1.5 text-[13px] font-medium text-[var(--tinta-1)] transition-colors hover:bg-[var(--superficie-2)]";

  return (
    <Modal
      aberto={aberto}
      aoFechar={fechar}
      largura="max-w-2xl"
      titulo={paciente.nome}
      descricao={`${a.procedimento?.nome ?? "—"} · ${diaLongo.format(inicio)} · ${hora.format(inicio)}–${hora.format(fim)}`}
      topo={
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold"
            style={{
              background: `color-mix(in oklab, ${cor} 16%, var(--superficie))`,
              color: `color-mix(in oklab, ${cor} 70%, var(--tinta-1))`,
            }}
          >
            <span aria-hidden className="size-2 rounded-full" style={{ background: cor }} />
            {ROTULO_STATUS[a.status]}
          </span>
          {!naFicha && paciente.id && (
            <Link href={`/pacientes/${paciente.id}`} className={pilulaAtalho}>
              <Icone d={ICONES.ficha} />
              Abrir ficha do paciente
            </Link>
          )}
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noreferrer" className={pilulaAtalho}>
              <Icone d={ICONES.whatsapp} />
              Confirmar pelo WhatsApp
            </a>
          )}
          {resumo?.telefone && (
            <span className="text-[13px] tabular-nums text-[var(--tinta-2)]">
              {resumo.telefone}
            </span>
          )}
        </div>
      }
      rodape={
        <>
          {finalizado && (
            <p className="mr-auto text-[12.5px] text-[var(--tinta-2)]">
              Encerrado: só as observações mudam. Para o resto, volte o status.
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
        </>
      }
    >
      <div className="space-y-4">
        {/* Alertas antes de tudo: é o que não pode passar despercebido. */}
        {(a.sem_avaliacao ||
          (resumo &&
            (resumo.observacoes || resumo.emAtraso > 0 || !resumo.consentimento_lgpd))) && (
          <div className="space-y-2">
            {resumo?.observacoes && (
              <Aviso>
                <span className="font-semibold">Observações do paciente:</span> {resumo.observacoes}
              </Aviso>
            )}
            {a.sem_avaliacao && (
              <Aviso>
                <span className="font-semibold">Primeira vez, sem avaliação inicial.</span>{" "}
                {a.origem === "comercial"
                  ? `Vendido pelo comercial${a.vendedor ? ` (${a.vendedor.nome})` : ""} direto para o procedimento.`
                  : "Ainda não passou por avaliação na clínica."}{" "}
                Confirme a indicação antes de começar.
              </Aviso>
            )}
            {resumo && resumo.emAtraso > 0 && (
              <Aviso tom="critico">
                <span className="font-semibold">
                  Pagamento em atraso de {brl.format(resumo.emAtraso)}.
                </span>{" "}
                Confira na ficha antes de atender.
              </Aviso>
            )}
            {resumo && !resumo.consentimento_lgpd && (
              <Aviso tom="neutro">
                Consentimento LGPD pendente: colha a assinatura na recepção.
              </Aviso>
            )}
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-5 gap-y-3.5 rounded-[var(--r-lg)] bg-[var(--superficie-2)] p-4 sm:grid-cols-3">
          <Item rotulo="Procedimento">
            {a.procedimento?.nome ?? "—"}
            {a.regioes.length > 0 && ` · ${a.regioes.join(", ")}`}
            <span className="text-[var(--tinta-2)]"> · {minutos} min</span>
          </Item>
          <Item rotulo="Horário">
            {hora.format(inicio)}–{hora.format(fim)}
            {buffer > 0 && (
              <span className="text-[var(--tinta-2)]"> · {buffer} min de preparo</span>
            )}
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
          <Item rotulo="Origem">
            {a.origem === "upsell"
              ? `Upsell${a.vendedor ? ` · vendido por ${a.vendedor.nome}` : ""}`
              : a.origem === "comercial"
                ? `Comercial${a.vendedor ? ` · vendido por ${a.vendedor.nome}` : ""}`
                : a.procedimento?.avaliacao
                  ? "Avaliação inicial"
                  : "Agenda da clínica"}
          </Item>
          {editandoObs ? (
            <div className="col-span-2 space-y-2 sm:col-span-3">
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
                  tamanho="sm"
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
                <Botao
                  type="button"
                  tamanho="sm"
                  variante="fantasma"
                  onClick={() => setEditandoObs(false)}
                >
                  Cancelar
                </Botao>
              </div>
            </div>
          ) : (
            a.observacoes && (
              <div className="col-span-2 sm:col-span-3">
                <Item rotulo="Observações do atendimento">{a.observacoes}</Item>
              </div>
            )
          )}
          {a.status === "cancelado" && a.motivo_cancelamento && (
            <div className="col-span-2 sm:col-span-3">
              <Item rotulo="Motivo do cancelamento">{a.motivo_cancelamento}</Item>
            </div>
          )}
        </dl>

        {/* RF-50 a RF-52 · o caminho do atendimento: etapas com cor e o próximo passo em destaque. */}
        <Formulario
          acao={acaoStatus}
          enviando={enviando}
          estado={estado}
          className="space-y-3 rounded-[var(--r-lg)] border border-[var(--traco)] p-4"
        >
          <input type="hidden" name="id" value={a.id} />
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[14px] font-semibold">Status do atendimento</h3>
            {efeito && <p className="text-[12.5px] text-[var(--tinta-2)]">{efeito}</p>}
          </div>

          {!cancelando && (
            <>
              <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {ETAPAS.map((s, i) => {
                  const atual = a.status === s;
                  const passou = ETAPAS.indexOf(a.status) > i;
                  const c = COR_STATUS[s] ?? "var(--tinta-3)";
                  return (
                    <li key={s}>
                      <button
                        type="submit"
                        name="status"
                        value={s}
                        disabled={atual || enviando}
                        aria-current={atual ? "step" : undefined}
                        className="flex w-full items-center gap-1.5 whitespace-nowrap rounded-[var(--r-md)] border px-2.5 py-2.5 text-left text-[13px] font-medium transition-colors hover:bg-[var(--superficie-2)] disabled:hover:bg-transparent"
                        style={
                          atual
                            ? {
                                borderColor: c,
                                background: `color-mix(in oklab, ${c} 14%, var(--superficie))`,
                                color: `color-mix(in oklab, ${c} 65%, var(--tinta-1))`,
                                fontWeight: 600,
                              }
                            : {
                                borderColor: "var(--traco)",
                                color: passou ? "var(--tinta-1)" : "var(--tinta-2)",
                              }
                        }
                      >
                        <span
                          aria-hidden
                          className="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                          style={{
                            background: atual || passou ? c : "transparent",
                            border: atual || passou ? "none" : "1.5px solid var(--traco-forte)",
                          }}
                        >
                          {passou ? "✓" : ""}
                        </span>
                        {s === "agendado" ? "A confirmar" : ROTULO_STATUS[s]}
                      </button>
                    </li>
                  );
                })}
              </ol>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {proximo && (
                  <Botao
                    type="submit"
                    name="status"
                    value={proximo.status}
                    variante={proximo.variante}
                    disabled={enviando}
                  >
                    {proximo.rotulo}
                  </Botao>
                )}
                <span className="ml-auto flex flex-wrap gap-2">
                  {a.status !== "falta" && (
                    <Botao
                      type="submit"
                      name="status"
                      value="falta"
                      variante="secundario"
                      tamanho="sm"
                      disabled={enviando}
                    >
                      Falta
                    </Botao>
                  )}
                  {a.status !== "cancelado" && (
                    <Botao
                      type="button"
                      variante="perigo"
                      tamanho="sm"
                      onClick={() => setCancelando(true)}
                    >
                      Cancelar atendimento
                    </Botao>
                  )}
                </span>
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
        </Formulario>

        {a.status !== "cancelado" && a.status !== "falta" && (
          <div
            className="flex flex-wrap items-center gap-2 rounded-[var(--r-lg)] border px-4 py-3"
            style={{
              borderColor: "color-mix(in oklab, var(--marca) 25%, var(--traco))",
              background: "color-mix(in oklab, var(--marca) 6%, var(--superficie))",
            }}
          >
            <p className="mr-auto text-[13.5px]">
              <span className="font-semibold">Vendeu outro procedimento?</span>{" "}
              <span className="text-[var(--tinta-2)]">
                Registre o upsell e agende, ou venda um pacote.
              </span>
            </p>
            <Botao type="button" variante="marca" tamanho="sm" onClick={() => upsell(true)}>
              Upsell: fazer agora
            </Botao>
            <Botao type="button" variante="secundario" tamanho="sm" onClick={() => upsell(false)}>
              Upsell: outro dia
            </Botao>
            {paciente.id && (
              <Link
                href={`/pacientes/${paciente.id}?vender=1`}
                className="inline-flex items-center rounded-full border border-[var(--traco-forte)] bg-[var(--superficie)] px-3.5 py-2 text-[13px] font-medium text-[var(--tinta-1)] shadow-[var(--sombra-1)] hover:bg-[var(--superficie-2)]"
              >
                Vender pacote
              </Link>
            )}
          </div>
        )}

        {/* Histórico curto: frequência e o que vem antes e depois deste atendimento. */}
        {resumo && (
          <dl className="grid divide-y divide-[var(--traco)] text-[13px] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="py-2 sm:pr-4">
              <dt className="text-[12px] font-medium text-[var(--tinta-2)]">Frequência</dt>
              <dd className="mt-0.5">
                {resumo.realizados} realizado(s)
                {resumo.faltas > 0 && (
                  <span className="font-medium" style={{ color: "var(--status-critico)" }}>
                    {" "}
                    · {resumo.faltas} falta(s)
                  </span>
                )}
              </dd>
            </div>
            <div className="py-2 sm:px-4">
              <dt className="text-[12px] font-medium text-[var(--tinta-2)]">
                Atendimento anterior
              </dt>
              <dd className="mt-0.5">
                {resumo.ultimo
                  ? `${diaCurto.format(new Date(resumo.ultimo.inicio))} · ${resumo.ultimo.procedimento} (${ROTULO_STATUS[resumo.ultimo.status as StatusAgendamento]?.toLowerCase() ?? resumo.ultimo.status})`
                  : "Primeiro atendimento"}
              </dd>
            </div>
            <div className="py-2 sm:pl-4">
              <dt className="text-[12px] font-medium text-[var(--tinta-2)]">Próximo agendado</dt>
              <dd className="mt-0.5">
                {resumo.proximo
                  ? `${diaCurto.format(new Date(resumo.proximo.inicio))} às ${hora.format(new Date(resumo.proximo.inicio))} · ${resumo.proximo.procedimento}`
                  : "Nenhum"}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </Modal>
  );
}
