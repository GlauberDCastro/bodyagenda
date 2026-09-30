"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { salvarSala, type Resultado } from "@/lib/actions/recursos";
import { Campo, Input, Select, Botao } from "@/components/ui/primitivos";
import type { Procedimento } from "@/lib/types/database";

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Salvar sala"}
    </Botao>
  );
}

export function FormularioSala({ procedimentos }: { procedimentos: Procedimento[] }) {
  const [aberto, setAberto] = useState(false);
  const [alocacao, setAlocacao] = useState<"dedicada" | "flexivel">("flexivel");

  const [estado, acao] = useActionState<Resultado, FormData>(
    async (anterior, formData) => {
      const r = await salvarSala(null, anterior, formData);
      if (r.ok) setAberto(false);
      return r;
    },
    {},
  );

  if (!aberto) {
    return (
      <Botao type="button" onClick={() => setAberto(true)}>
        Nova sala
      </Botao>
    );
  }

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <form
      action={acao}
      className="w-full max-w-md space-y-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800"
    >
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Número" erro={estado.campos?.numero}>
          <Input name="numero" type="number" min={1} required />
        </Campo>
        <Campo label="Nome" erro={estado.campos?.nome}>
          <Input name="nome" required placeholder="Sala 1" />
        </Campo>
      </div>

      <Campo
        label="Alocação"
        dica="Dedicada trava um procedimento fixo; flexível recebe qualquer um."
      >
        <Select
          name="tipo_alocacao"
          value={alocacao}
          onChange={(e) => setAlocacao(e.target.value as "dedicada" | "flexivel")}
        >
          <option value="flexivel">Flexível</option>
          <option value="dedicada">Dedicada</option>
        </Select>
      </Campo>

      {alocacao === "dedicada" && (
        <Campo
          label="Procedimento fixo"
          erro={estado.campos?.procedimento_fixo_id}
          dica="Escolher o procedimento na agenda passará a definir esta sala automaticamente."
        >
          <Select name="procedimento_fixo_id" required>
            <option value="">Selecione…</option>
            {procedimentos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
        </Campo>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Campo
          label="Vigência — início"
          erro={estado.campos?.vigencia_inicio}
          dica="A partir de quando conta na capacidade."
        >
          <Input name="vigencia_inicio" type="date" defaultValue={hoje} required />
        </Campo>
        <Campo label="Vigência — fim" erro={estado.campos?.vigencia_fim}>
          <Input name="vigencia_fim" type="date" />
        </Campo>
      </div>

      {estado.erro && !estado.campos && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {estado.erro}
        </p>
      )}

      <div className="flex gap-2">
        <Salvar />
        <Botao type="button" variante="secundario" onClick={() => setAberto(false)}>
          Cancelar
        </Botao>
      </div>
    </form>
  );
}
