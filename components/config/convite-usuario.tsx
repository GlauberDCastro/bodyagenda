"use client";

import { useState, useTransition } from "react";
import { criarConviteUsuario, revogarConviteUsuario } from "@/lib/actions/convites";
import { PERFIS, ROTULO_PERFIL } from "@/lib/perfis";
import { Modal } from "@/components/ui/modal";
import { Botao, Campo, Input, Select } from "@/components/ui/primitivos";

const dataCurta = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** Perfis que se convida por aqui; profissional vai pela aba Profissionais. */
const PERFIS_CONVITE = PERFIS.filter((p) => p.valor !== "profissional");

/**
 * Convite por link para a equipe (recepção, SDR, closer…). A pessoa abre,
 * cria e-mail e senha e entra com o perfil escolhido. O link aparece uma vez:
 * o banco guarda só o hash.
 */
export function ConvidarUsuario({ nomeClinica }: { nomeClinica: string }) {
  const [aberto, setAberto] = useState(false);
  const [perfil, setPerfil] = useState<string>("recepcao");
  const [nome, setNome] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [expira, setExpira] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pendente, iniciar] = useTransition();

  const gerar = () =>
    iniciar(async () => {
      const r = await criarConviteUsuario(perfil, nome);
      setErro(r.erro ?? null);
      setLink(r.link ?? null);
      setExpira(r.expira_em ?? null);
      setCopiado(false);
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

  const mensagem = link
    ? `Olá${nome ? `, ${nome.split(" ")[0]}` : ""}! Este é seu convite para criar o acesso ao sistema da ${nomeClinica} como ${ROTULO_PERFIL[perfil] ?? perfil}: ${link}`
    : "";
  // Sem telefone cadastrado: o WhatsApp abre para escolher o contato.
  const whatsapp = link ? `https://wa.me/?text=${encodeURIComponent(mensagem)}` : null;

  const descricao = PERFIS.find((p) => p.valor === perfil)?.descricao;

  return (
    <>
      <Botao
        type="button"
        variante="secundario"
        onClick={() => {
          setAberto(true);
          setLink(null);
          setErro(null);
          setNome("");
        }}
      >
        Convidar por link
      </Botao>
      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Convidar por link"
        descricao="A pessoa abre o link, cria e-mail e senha e entra com o perfil escolhido. Vale 7 dias e uma vez só."
      >
        <div className="space-y-4">
          {link ? (
            <>
              <Campo
                label="Link do convite"
                dica={`Vale até ${expira ? dataCurta.format(new Date(expira)) : "—"}. Este link não aparece de novo: copie ou envie agora.`}
              >
                <Input
                  readOnly
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-[12.5px]"
                />
              </Campo>
              <div className="flex flex-wrap gap-2">
                <Botao type="button" onClick={copiar}>
                  {copiado ? "Copiado" : "Copiar link"}
                </Botao>
                {whatsapp && (
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-full border border-[var(--traco)] px-4 py-2.5 text-[13.5px] font-medium hover:bg-[var(--superficie-2)]"
                  >
                    Enviar pelo WhatsApp
                  </a>
                )}
              </div>
            </>
          ) : (
            <>
              <Campo label="Perfil" dica={descricao}>
                <Select value={perfil} onChange={(e) => setPerfil(e.target.value)}>
                  {PERFIS_CONVITE.map((p) => (
                    <option key={p.valor} value={p.valor}>
                      {p.rotulo}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo
                label="Nome (opcional)"
                dica="Já vem preenchido para a pessoa; ela pode corrigir."
              >
                <Input value={nome} onChange={(e) => setNome(e.target.value)} />
              </Campo>
              <p className="text-[12.5px] text-[var(--tinta-3)]">
                Profissional que atende é convidado em Configurações › Profissionais, para o acesso
                já nascer ligado à agenda dele.
              </p>
            </>
          )}
          {erro && (
            <p role="alert" className="text-[13px]" style={{ color: "var(--status-critico)" }}>
              {erro}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-[var(--traco)] pt-4">
            {link ? (
              <Botao type="button" variante="secundario" onClick={() => setAberto(false)}>
                Concluir
              </Botao>
            ) : (
              <Botao type="button" onClick={gerar} disabled={pendente}>
                {pendente ? "Gerando…" : "Gerar link de convite"}
              </Botao>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Cancela um convite pendente: o link para de funcionar na hora. */
export function CancelarConvite({ id }: { id: string }) {
  const [pendente, iniciar] = useTransition();
  return (
    <Botao
      type="button"
      variante="fantasma"
      className="px-3 py-1.5 text-[12.5px]"
      disabled={pendente}
      onClick={() => iniciar(async () => void (await revogarConviteUsuario(id)))}
    >
      {pendente ? "Cancelando…" : "Cancelar convite"}
    </Botao>
  );
}
