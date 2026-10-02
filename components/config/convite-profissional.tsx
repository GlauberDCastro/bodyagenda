"use client";

import { useState, useTransition } from "react";
import { criarConvite, revogarConvite } from "@/lib/actions/convites";
import { linkWhatsApp } from "@/lib/whatsapp";
import { Modal } from "@/components/ui/modal";
import { Botao, Etiqueta, Input } from "@/components/ui/primitivos";

const dataCurta = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/**
 * Situação de acesso do profissional e o convite para ele criar o próprio
 * login. O link só aparece uma vez, logo depois de gerado: o banco guarda o
 * hash, não o link. Perdeu? Gera outro (o anterior deixa de valer).
 */
export function ConviteProfissional({
  profissional,
  pendenteAte,
  podeConvidar,
}: {
  profissional: {
    id: string;
    nome: string;
    telefone: string | null;
    ativo: boolean;
    temAcesso: boolean;
  };
  /** Validade do convite pendente, se houver. */
  pendenteAte: string | null;
  /** Só o admin cria acesso. */
  podeConvidar: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [expira, setExpira] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pendente, iniciar] = useTransition();

  if (profissional.temAcesso) return <Etiqueta tom="bom">Com acesso</Etiqueta>;
  if (!podeConvidar || !profissional.ativo) {
    return <Etiqueta>{pendenteAte ? "Convite enviado" : "Sem login"}</Etiqueta>;
  }

  const gerar = () =>
    iniciar(async () => {
      const r = await criarConvite(profissional.id);
      setErro(r.erro ?? null);
      setLink(r.link ?? null);
      setExpira(r.expira_em ?? null);
      setCopiado(false);
    });

  const revogar = () =>
    iniciar(async () => {
      const r = await revogarConvite(profissional.id);
      setErro(r.erro ?? null);
      if (r.ok) {
        setLink(null);
        setAberto(false);
      }
    });

  const copiar = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
    } catch {
      setErro("Não consegui copiar. Selecione o link e copie manualmente.");
    }
  };

  const whatsapp =
    link &&
    linkWhatsApp(
      profissional.telefone,
      `Olá, ${profissional.nome.split(" ")[0]}! Este é seu convite para criar o acesso ao sistema da Body Prime, onde você acompanha sua agenda e suas comissões: ${link}`,
    );

  return (
    <>
      <span className="flex flex-wrap items-center gap-2">
        {pendenteAte ? (
          <Etiqueta tom="marca">Convite até {dataCurta.format(new Date(pendenteAte))}</Etiqueta>
        ) : (
          <Etiqueta>Sem login</Etiqueta>
        )}
        <Botao
          type="button"
          variante="secundario"
          className="px-3 py-1.5 text-[12.5px]"
          onClick={() => {
            setAberto(true);
            setLink(null);
            setErro(null);
          }}
        >
          {pendenteAte ? "Reenviar convite" : "Convidar"}
        </Botao>
      </span>

      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={`Convidar ${profissional.nome}`}
        descricao="O profissional recebe um link, cria a senha e completa os próprios dados. Comissão, habilitações e horários continuam com você."
      >
        <div className="space-y-4">
          {link ? (
            <>
              <div className="space-y-1.5">
                <label htmlFor="link-convite" className="block text-[13px] font-medium">
                  Link do convite
                </label>
                <Input
                  id="link-convite"
                  readOnly
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-[12.5px]"
                />
                <p className="text-[12.5px] text-[var(--tinta-3)]">
                  Vale até {expira ? dataCurta.format(new Date(expira)) : "—"} e serve uma vez só.
                  Este link não aparece de novo: copie ou envie agora.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Botao type="button" onClick={copiar}>
                  {copiado ? "Copiado" : "Copiar link"}
                </Botao>
                {whatsapp ? (
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-full border border-[var(--traco)] px-4 py-2.5 text-[13.5px] font-medium hover:bg-[var(--superficie-2)]"
                  >
                    Enviar pelo WhatsApp
                  </a>
                ) : (
                  <p className="self-center text-[12.5px] text-[var(--tinta-3)]">
                    Cadastre o telefone do profissional para enviar pelo WhatsApp.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-[14px] text-[var(--tinta-2)]">
              {pendenteAte
                ? "Já existe um convite pendente. Gerar um novo link faz o anterior parar de funcionar."
                : "O link vale por 7 dias e serve uma vez só."}
            </p>
          )}

          {erro && (
            <p role="alert" className="text-[13px]" style={{ color: "var(--status-critico)" }}>
              {erro}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--traco)] pt-4">
            {pendenteAte && !link && (
              <Botao type="button" variante="perigo" onClick={revogar} disabled={pendente}>
                Cancelar convite
              </Botao>
            )}
            {!link && (
              <Botao type="button" onClick={gerar} disabled={pendente}>
                {pendente ? "Gerando…" : pendenteAte ? "Gerar novo link" : "Gerar link de convite"}
              </Botao>
            )}
            {link && (
              <Botao type="button" variante="secundario" onClick={() => setAberto(false)}>
                Concluir
              </Botao>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
