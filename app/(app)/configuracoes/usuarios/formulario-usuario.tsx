"use client";

import { useActionState, useState } from "react";
import { Formulario, useEnvioFormulario } from "@/components/ui/formulario";
import { salvarUsuario, alternarAcesso } from "@/lib/actions/usuarios";
import type { Resultado } from "@/lib/actions/recursos";
import { Campo, Input, Select, Botao, Etiqueta } from "@/components/ui/primitivos";
import { GatilhoModal, AcoesModal, Modal } from "@/components/ui/modal";
import { PERFIS } from "@/lib/perfis";

export interface UsuarioLinha {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  ativo: boolean;
}

export interface ProfissionalOpcao {
  id: string;
  nome: string;
  usuario_id: string | null;
}

function Salvar({ rotulo }: { rotulo: string }) {
  const { pending } = useEnvioFormulario();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Salvando…" : rotulo}
    </Botao>
  );
}

function CamposUsuario({
  inicial,
  profissionais,
  aoConcluir,
}: {
  inicial?: UsuarioLinha;
  profissionais: ProfissionalOpcao[];
  aoConcluir: () => void;
}) {
  const [perfil, setPerfil] = useState(inicial?.perfil ?? "recepcao");

  const [estado, acao, enviando] = useActionState<Resultado, FormData>(
    async (anterior, formData) => {
      const r = await salvarUsuario(inicial?.id ?? null, anterior, formData);
      if (r.ok) aoConcluir();
      return r;
    },
    {},
  );

  const descricao = PERFIS.find((p) => p.valor === perfil)?.descricao;

  // Um profissional só pode estar ligado a um login. Os já vinculados a OUTRO
  // usuário saem da lista — senão dois logins veriam a mesma agenda como
  // "sua", e a bonificação apareceria para os dois.
  const disponiveis = profissionais.filter(
    (p) => !p.usuario_id || p.usuario_id === inicial?.id,
  );
  const vinculado = profissionais.find((p) => p.usuario_id === inicial?.id);

  return (
    <Formulario acao={acao} enviando={enviando} estado={estado} className="space-y-4">
      <input type="hidden" name="ativo" value={String(inicial?.ativo ?? true)} />

      <Campo label="Nome" erro={estado.campos?.nome}>
        <Input name="nome" required autoFocus defaultValue={inicial?.nome} />
      </Campo>

      <Campo label="E-mail" erro={estado.campos?.email} dica="É o login.">
        <Input
          name="email"
          type="email"
          required
          defaultValue={inicial?.email}
          readOnly={!!inicial}
        />
      </Campo>

      <Campo
        label={inicial ? "Nova senha" : "Senha inicial"}
        erro={estado.campos?.senha}
        dica={
          inicial
            ? "Deixe em branco para manter a senha atual."
            : "Mínimo de 8 caracteres. Peça para trocar no primeiro acesso."
        }
      >
        <Input
          name="senha"
          type="password"
          autoComplete="new-password"
          required={!inicial}
        />
      </Campo>

      <Campo label="Perfil" dica={descricao}>
        <Select name="perfil" value={perfil} onChange={(e) => setPerfil(e.target.value)}>
          {PERFIS.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.rotulo}
            </option>
          ))}
        </Select>
      </Campo>

      {perfil === "profissional" && (
        <Campo
          label="Vincular ao profissional"
          erro={estado.campos?.profissional_id}
          dica="É o vínculo que faz este login ver a própria agenda e a própria bonificação."
        >
          <Select name="profissional_id" defaultValue={vinculado?.id ?? ""}>
            <option value="">Sem vínculo</option>
            {disponiveis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
        </Campo>
      )}

      {estado.erro && !estado.campos && (
        <p role="alert" className="text-[13px] text-[color:var(--status-critico)]">
          {estado.erro}
        </p>
      )}

      <AcoesModal aoCancelar={aoConcluir}>
        <Salvar rotulo={inicial ? "Salvar alterações" : "Criar acesso"} />
      </AcoesModal>
    </Formulario>
  );
}

export function FormularioUsuario({
  profissionais,
}: {
  profissionais: ProfissionalOpcao[];
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <GatilhoModal
      rotulo="Novo acesso"
      titulo="Novo acesso"
      descricao="Cria a conta no sistema e define o que essa pessoa pode ver."
      aberto={aberto}
      aoMudar={setAberto}
    >
      <CamposUsuario profissionais={profissionais} aoConcluir={() => setAberto(false)} />
    </GatilhoModal>
  );
}

export function AcoesUsuario({
  usuario,
  profissionais,
  ehVoceMesmo,
}: {
  usuario: UsuarioLinha;
  profissionais: ProfissionalOpcao[];
  ehVoceMesmo: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [pendente, setPendente] = useState(false);

  const botao =
    "grid size-7 place-items-center rounded-full text-[var(--tinta-3)] transition-colors hover:bg-[var(--superficie-2)] hover:text-[var(--tinta-1)] disabled:opacity-40";

  return (
    <div className="flex items-center justify-end gap-0.5">
      <button
        type="button"
        onClick={() => setEditando(true)}
        aria-label={`Editar ${usuario.nome}`}
        title={`Editar ${usuario.nome}`}
        className={botao}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z" />
        </svg>
      </button>

      {/* Desativar a si mesmo tranca o próprio administrador para fora. */}
      <button
        type="button"
        disabled={ehVoceMesmo || pendente}
        title={
          ehVoceMesmo
            ? "Você não pode desativar o próprio acesso"
            : usuario.ativo
              ? `Desativar ${usuario.nome}`
              : `Reativar ${usuario.nome}`
        }
        aria-label={usuario.ativo ? "Desativar acesso" : "Reativar acesso"}
        onClick={async () => {
          setPendente(true);
          await alternarAcesso(usuario.id, !usuario.ativo);
          setPendente(false);
        }}
        className={botao}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
          {usuario.ativo ? <path d="M9 6v12M15 6v12" /> : <path d="M5 12h14M13 6l6 6-6 6" />}
        </svg>
      </button>

      <Modal
        aberto={editando}
        aoFechar={() => setEditando(false)}
        titulo={`Editar ${usuario.nome}`}
        descricao="Deixe a senha em branco para mantê-la."
      >
        <CamposUsuario
          inicial={usuario}
          profissionais={profissionais}
          aoConcluir={() => setEditando(false)}
        />
      </Modal>
    </div>
  );
}

export function EtiquetaPerfil({ perfil }: { perfil: string }) {
  const tom = perfil === "admin" ? "marca" : "neutro";
  return (
    <Etiqueta tom={tom}>
      {PERFIS.find((p) => p.valor === perfil)?.rotulo ?? perfil}
    </Etiqueta>
  );
}
