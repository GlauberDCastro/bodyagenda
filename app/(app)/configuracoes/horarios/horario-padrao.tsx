"use client";

import { useState, useTransition } from "react";
import { definirHorarios } from "@/lib/actions/recursos";
import { semanaDasJanelas, validarSemana, type Janela } from "@/lib/horarios";
import type { TipoRecurso } from "@/lib/types/database";
import { Modal, AcoesModal } from "@/components/ui/modal";
import { Aviso, Botao, Cartao } from "@/components/ui/primitivos";
import { EditorSemana } from "./editor-semana";

/**
 * Horário da clínica aplicado de uma vez a todos os recursos ativos.
 *
 * Substitui também as exceções, e a confirmação diz isso com todas as letras:
 * é a única ação da tela que mexe em dezenas de recursos num clique.
 */
export function HorarioPadrao({
  padrao,
  recursos,
  excecoes,
}: {
  padrao: Janela[];
  recursos: { tipo: TipoRecurso; id: string }[];
  excecoes: number;
}) {
  const [semana, setSemana] = useState(() => semanaDasJanelas(padrao));
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aplicado, setAplicado] = useState(false);
  const [pendente, iniciar] = useTransition();

  const aplicar = () =>
    iniciar(async () => {
      const r = await definirHorarios(recursos, semana);
      setConfirmando(false);
      setErro(r.erro ?? null);
      setAplicado(!!r.ok);
    });

  return (
    <Cartao className="max-w-2xl space-y-4">
      <EditorSemana
        semana={semana}
        aoMudar={(s) => {
          setSemana(s);
          setAplicado(false);
        }}
      />

      {erro && (
        <p role="alert" className="text-[13px]" style={{ color: "var(--status-critico)" }}>
          {erro}
        </p>
      )}
      {aplicado && <Aviso tom="neutro">Horário aplicado a {recursos.length} recursos.</Aviso>}

      <div className="flex justify-end">
        <Botao
          type="button"
          onClick={() => {
            const problema = validarSemana(semana);
            setErro(problema);
            if (!problema) setConfirmando(true);
          }}
        >
          Aplicar a todos os recursos
        </Botao>
      </div>

      <Modal
        aberto={confirmando}
        aoFechar={() => setConfirmando(false)}
        titulo="Aplicar a todos os recursos?"
        descricao={`O horário de ${recursos.length} salas, aparelhos e profissionais ativos será substituído por este.`}
      >
        {excecoes > 0 && (
          <Aviso>
            {excecoes} recurso(s) têm horário próprio hoje e também serão substituídos. Ajuste-os de
            novo em &ldquo;Horário por recurso&rdquo; depois, se precisar.
          </Aviso>
        )}
        <AcoesModal aoCancelar={() => setConfirmando(false)}>
          <Botao type="button" onClick={aplicar} disabled={pendente}>
            {pendente ? "Aplicando…" : "Aplicar"}
          </Botao>
        </AcoesModal>
      </Modal>
    </Cartao>
  );
}
