"use client";

import { useState, useTransition } from "react";
import { cancelarPacote } from "@/lib/actions/pacientes";
import { Modal, AcoesModal } from "@/components/ui/modal";
import { Aviso, Botao } from "@/components/ui/primitivos";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** RF-65 · cancela o pacote e mostra o acerto: estorno ou saldo a cobrar. */
export function CancelarPacote({
  pacoteId,
  pacienteId,
  nome,
}: {
  pacoteId: string;
  pacienteId: string;
  nome: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<{ saldo: number; pago: number; consumido: number } | null>(
    null,
  );
  const [erro, setErro] = useState<string | null>(null);

  const fechar = () => {
    setAberto(false);
    setResultado(null);
    setErro(null);
  };

  return (
    <>
      <Botao type="button" variante="fantasma" onClick={() => setAberto(true)}>
        Cancelar
      </Botao>
      <Modal
        aberto={aberto}
        aoFechar={fechar}
        titulo={resultado ? "Pacote cancelado" : `Cancelar o pacote de ${nome}?`}
        descricao={
          resultado
            ? undefined
            : "As parcelas em aberto são canceladas e o sistema compara o que foi pago com as sessões já consumidas. Atendimentos já marcados continuam na agenda."
        }
      >
        {resultado ? (
          <div className="space-y-4">
            <p className="text-[13.5px] text-[var(--tinta-2)]">
              Pago {brl.format(resultado.pago)} · consumido {brl.format(resultado.consumido)}
            </p>
            {resultado.saldo > 0 && (
              <Aviso>
                Estorno de <strong>{brl.format(resultado.saldo)}</strong> a devolver ao paciente,
                lançado como despesa a pagar.
              </Aviso>
            )}
            {resultado.saldo < 0 && (
              <Aviso>
                O paciente ainda deve <strong>{brl.format(-resultado.saldo)}</strong> pelas sessões
                consumidas. A cobrança está em Recebimentos.
              </Aviso>
            )}
            {resultado.saldo === 0 && <Aviso tom="neutro">Sem saldo a acertar.</Aviso>}
            <div className="flex justify-end">
              <Botao type="button" onClick={fechar}>
                Fechar
              </Botao>
            </div>
          </div>
        ) : (
          <>
            {erro && (
              <p role="alert" className="text-[13px]" style={{ color: "var(--status-critico)" }}>
                {erro}
              </p>
            )}
            <AcoesModal aoCancelar={fechar}>
              <Botao
                type="button"
                variante="perigo"
                disabled={pendente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await cancelarPacote(pacoteId, pacienteId);
                    if (r.erro) setErro(r.erro);
                    else setResultado({ saldo: r.saldo ?? 0, pago: r.pago ?? 0, consumido: r.consumido ?? 0 });
                  })
                }
              >
                {pendente ? "Cancelando…" : "Cancelar pacote"}
              </Botao>
            </AcoesModal>
          </>
        )}
      </Modal>
    </>
  );
}
