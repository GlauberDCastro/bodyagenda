"use client";

import { useState, useTransition, type ReactNode } from "react";
import { excluirRecurso, inativarRecurso, reativarRecurso } from "@/lib/actions/recursos";
import { Modal } from "@/components/ui/modal";
import { Botao, Aviso } from "@/components/ui/primitivos";
import type { TipoRecurso } from "@/lib/types/database";

function Icone({ children }: { children: ReactNode }) {
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
      {children}
    </svg>
  );
}

const IconeLapis = () => (
  <Icone>
    <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z" />
  </Icone>
);

const IconePausa = () => (
  <Icone>
    <path d="M9 6v12M15 6v12" />
  </Icone>
);

const IconeSeta = () => (
  <Icone>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icone>
);

const IconeLixeira = () => (
  <Icone>
    <path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13M10 11v6M14 11v6" />
  </Icone>
);

/**
 * Editar · Inativar · Excluir de um recurso.
 *
 * Excluir e inativar NÃO são a mesma coisa e a interface não finge que são:
 * excluir some com o cadastro e só funciona se ele nunca foi usado; inativar
 * mantém o histórico e apenas impede novos agendamentos. Quando a exclusão é
 * recusada, o motivo aparece e a inativação é oferecida ali mesmo.
 */
export function AcoesRecurso({
  tipo,
  id,
  nome,
  ativo,
  formularioEdicao,
}: {
  tipo: TipoRecurso;
  id: string;
  nome: string;
  ativo: boolean;
  /**
   * Formulário de edição. Recebe `fechar` porque quem controla o modal é este
   * componente — o formulário precisa poder encerrá-lo ao salvar.
   */
  formularioEdicao?: (fechar: () => void) => ReactNode;
}) {
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [emUso, setEmUso] = useState(false);
  const [pendente, iniciar] = useTransition();

  const rotuloTipo = { sala: "sala", equipamento: "equipamento", profissional: "profissional" }[
    tipo
  ];

  function excluir() {
    iniciar(async () => {
      const r = await excluirRecurso(tipo, id);
      if (r.erro) {
        setErro(r.erro);
        setEmUso(!!r.emUso);
        return;
      }
      setConfirmando(false);
    });
  }

  function alternarAtivo() {
    iniciar(async () => {
      const r = ativo ? await inativarRecurso(tipo, id, true) : await reativarRecurso(tipo, id);
      if (r.erro) setErro(r.erro);
      else {
        setConfirmando(false);
      }
    });
  }

  /**
   * Ações inline, não menu suspenso.
   *
   * A tabela vive dentro de um cartão com `overflow-hidden` e rolagem
   * horizontal, que recorta qualquer dropdown posicionado em absoluto. Em vez
   * de recorrer a posicionamento fixo com coordenadas calculadas, as três
   * ações ficam visíveis: menos código, nada a recortar, e o usuário vê o que
   * pode fazer sem precisar descobrir.
   */
  const botao =
    "grid size-7 place-items-center rounded-full text-[var(--tinta-3)] transition-colors " +
    "hover:bg-[var(--superficie-2)] hover:text-[var(--tinta-1)] disabled:opacity-40";

  return (
    <div className="flex items-center justify-end gap-0.5">
      {formularioEdicao && (
        <button
          type="button"
          onClick={() => setEditando(true)}
          title={`Editar ${nome}`}
          aria-label={`Editar ${nome}`}
          className={botao}
        >
          <IconeLapis />
        </button>
      )}

      <button
        type="button"
        onClick={alternarAtivo}
        disabled={pendente}
        title={ativo ? `Inativar ${nome}` : `Reativar ${nome}`}
        aria-label={ativo ? `Inativar ${nome}` : `Reativar ${nome}`}
        className={botao}
      >
        {ativo ? <IconePausa /> : <IconeSeta />}
      </button>

      <button
        type="button"
        onClick={() => {
          setErro(null);
          setEmUso(false);
          setConfirmando(true);
        }}
        title={`Excluir ${nome}`}
        aria-label={`Excluir ${nome}`}
        className={botao}
      >
        <IconeLixeira />
      </button>

      {formularioEdicao && (
        <Modal aberto={editando} aoFechar={() => setEditando(false)} titulo={`Editar ${nome}`}>
          {formularioEdicao(() => setEditando(false))}
        </Modal>
      )}

      <Modal
        aberto={confirmando}
        aoFechar={() => setConfirmando(false)}
        titulo={`Excluir ${nome}?`}
        descricao={`Só é possível excluir ${rotuloTipo} que nunca foi usado. Com histórico, o cadastro precisa ser inativado.`}
        largura="max-w-md"
      >
        <div className="space-y-4">
          {erro && (
            <Aviso tom={emUso ? "atencao" : "critico"}>
              {emUso ? (
                <>
                  <p className="font-semibold">Não dá para excluir</p>
                  <p className="mt-1">{erro}</p>
                  <p className="mt-2">
                    Inativar mantém o histórico de ocupação e financeiro intacto e só impede novos
                    agendamentos.
                  </p>
                </>
              ) : (
                erro
              )}
            </Aviso>
          )}

          {!erro && (
            <p className="text-[13.5px] leading-relaxed text-[var(--tinta-2)]">
              Esta ação não pode ser desfeita. Se {nome} já apareceu em algum agendamento, a
              exclusão será recusada automaticamente.
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-[var(--traco)] pt-4">
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="rounded-full px-4 py-2.5 text-[13.5px] font-medium text-[var(--tinta-2)] transition-colors hover:bg-[var(--superficie-2)]"
            >
              Cancelar
            </button>

            {emUso ? (
              <Botao type="button" onClick={alternarAtivo} disabled={pendente}>
                {pendente ? "Inativando…" : "Inativar"}
              </Botao>
            ) : (
              <Botao type="button" variante="perigo" onClick={excluir} disabled={pendente}>
                {pendente ? "Excluindo…" : "Excluir definitivamente"}
              </Botao>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
