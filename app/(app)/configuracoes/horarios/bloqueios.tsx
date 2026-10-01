"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { adicionarBloqueio, removerBloqueio, type ResultadoBloqueio } from "@/lib/actions/recursos";
import { LABEL_TIPO_RECURSO, MOTIVOS_BLOQUEIO, type TipoRecurso } from "@/lib/types/database";
import { GatilhoModal, AcoesModal } from "@/components/ui/modal";
import { Aviso, Botao, Campo, Input, Select, Textarea } from "@/components/ui/primitivos";

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Bloqueando…" : "Bloquear"}
    </Botao>
  );
}

/** RF-25 · férias, folga, manutenção: o recurso some da agenda no período. */
export function NovoBloqueio({
  recursos,
}: {
  recursos: { tipo: TipoRecurso; id: string; nome: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<TipoRecurso>("equipamento");
  // Remontar o formulário zera o estado da action ao reabrir.
  const [chave, setChave] = useState(0);

  const abrirOuFechar = (v: boolean) => {
    if (v) setChave((c) => c + 1);
    setAberto(v);
  };

  return (
    <GatilhoModal
      rotulo="Novo bloqueio"
      titulo="Novo bloqueio"
      descricao="O recurso deixa de aceitar agendamento no período. Quem já está marcado não é desmarcado."
      aberto={aberto}
      aoMudar={abrirOuFechar}
    >
      <FormularioBloqueio
        key={chave}
        recursos={recursos}
        tipo={tipo}
        aoMudarTipo={setTipo}
        aoConcluir={() => setAberto(false)}
      />
    </GatilhoModal>
  );
}

function FormularioBloqueio({
  recursos,
  tipo,
  aoMudarTipo,
  aoConcluir,
}: {
  recursos: { tipo: TipoRecurso; id: string; nome: string }[];
  tipo: TipoRecurso;
  aoMudarTipo: (t: TipoRecurso) => void;
  aoConcluir: () => void;
}) {
  const [estado, acao] = useActionState<ResultadoBloqueio, FormData>(async (anterior, formData) => {
    const r = await adicionarBloqueio(anterior, formData);
    // Com atendimento afetado, fica aberto para a recepção ler o aviso.
    if (r.ok && !r.afetados) aoConcluir();
    return r;
  }, {});

  if (estado.ok && estado.afetados) {
    return (
      <div className="space-y-4">
        <Aviso>
          Bloqueio criado. {estado.afetados} atendimento(s) já marcado(s) neste período continuam na
          agenda e precisam ser remarcados.
        </Aviso>
        <div className="flex justify-end">
          <Botao type="button" onClick={aoConcluir}>
            Entendi
          </Botao>
        </div>
      </div>
    );
  }

  const opcoes = recursos.filter((r) => r.tipo === tipo);

  return (
    <form action={acao} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Tipo">
          <Select
            name="recurso_tipo"
            value={tipo}
            onChange={(e) => aoMudarTipo(e.target.value as TipoRecurso)}
          >
            {Object.entries(LABEL_TIPO_RECURSO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo label="Recurso" erro={estado.campos?.recurso_id}>
          <Select name="recurso_id" required defaultValue="">
            <option value="">Selecione…</option>
            {opcoes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </Select>
        </Campo>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Campo label="Início" erro={estado.campos?.inicio}>
          <Input name="inicio" type="datetime-local" required />
        </Campo>
        <Campo label="Fim" erro={estado.campos?.fim}>
          <Input name="fim" type="datetime-local" required />
        </Campo>
      </div>

      <Campo label="Motivo">
        <Select name="motivo" defaultValue="manutencao">
          {Object.entries(MOTIVOS_BLOQUEIO).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </Select>
      </Campo>

      <Campo label="Observação">
        <Textarea name="observacao" rows={2} />
      </Campo>

      {estado.erro && !estado.campos && (
        <p role="alert" className="text-[13px]" style={{ color: "var(--status-critico)" }}>
          {estado.erro}
        </p>
      )}

      <AcoesModal aoCancelar={aoConcluir}>
        <Salvar />
      </AcoesModal>
    </form>
  );
}

export function RemoverBloqueio({ id, descricao }: { id: string; descricao: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      {erro && (
        <span role="alert" className="text-[12px]" style={{ color: "var(--status-critico)" }}>
          {erro}
        </span>
      )}
      <Botao
        type="button"
        variante="fantasma"
        disabled={pendente}
        aria-label={`Remover bloqueio: ${descricao}`}
        onClick={() =>
          iniciar(async () => {
            const r = await removerBloqueio(id);
            setErro(r.erro ?? null);
          })
        }
      >
        {pendente ? "Removendo…" : "Remover"}
      </Botao>
    </span>
  );
}
