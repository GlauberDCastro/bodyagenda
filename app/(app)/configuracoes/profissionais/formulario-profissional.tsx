"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { salvarProfissional, type Resultado } from "@/lib/actions/recursos";
import { Campo, Input, Select, Botao } from "@/components/ui/primitivos";
import type { Procedimento } from "@/lib/types/database";

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Salvar profissional"}
    </Botao>
  );
}

export function FormularioProfissional({
  procedimentos,
}: {
  procedimentos: Procedimento[];
}) {
  const [aberto, setAberto] = useState(false);
  const [comissao, setComissao] = useState<"percentual" | "valor_fixo" | "nenhuma">(
    "nenhuma",
  );

  const [estado, acao] = useActionState<Resultado, FormData>(
    async (anterior, formData) => {
      const r = await salvarProfissional(null, anterior, formData);
      if (r.ok) setAberto(false);
      return r;
    },
    {},
  );

  if (!aberto) {
    return (
      <Botao type="button" onClick={() => setAberto(true)}>
        Novo profissional
      </Botao>
    );
  }

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <form
      action={acao}
      className="w-full max-w-md space-y-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800"
    >
      <Campo label="Nome" erro={estado.campos?.nome}>
        <Input name="nome" required />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo label="CPF" erro={estado.campos?.cpf}>
          <Input name="cpf" />
        </Campo>
        <Campo label="Especialidade" erro={estado.campos?.especialidade}>
          <Input name="especialidade" />
        </Campo>
      </div>

      <Campo label="Cor na agenda" erro={estado.campos?.cor_agenda}>
        <Input name="cor_agenda" type="color" defaultValue="#64748b" className="h-10" />
      </Campo>

      <Campo
        label="Procedimentos habilitados"
        dica="A agenda só oferece profissionais habilitados para o procedimento escolhido."
      >
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-300 p-2 dark:border-slate-700">
          {procedimentos.length === 0 && (
            <p className="text-xs text-slate-500">Nenhum procedimento cadastrado.</p>
          )}
          {procedimentos.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="procedimentos" value={p.id} />
              {p.nome}
            </label>
          ))}
        </div>
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo label="Tipo de comissão">
          <Select
            name="comissao_tipo"
            value={comissao}
            onChange={(e) =>
              setComissao(e.target.value as "percentual" | "valor_fixo" | "nenhuma")
            }
          >
            <option value="nenhuma">Sem comissão</option>
            <option value="percentual">Percentual</option>
            <option value="valor_fixo">Valor fixo</option>
          </Select>
        </Campo>
        <Campo
          label={comissao === "percentual" ? "Percentual (%)" : "Valor (R$)"}
          erro={estado.campos?.comissao_valor}
        >
          <Input
            name="comissao_valor"
            type="number"
            step="0.01"
            min="0"
            defaultValue="0"
            disabled={comissao === "nenhuma"}
          />
        </Campo>
      </div>

      <Campo
        label="Custo por hora"
        erro={estado.campos?.custo_hora}
        dica="Opcional. Entra no custo direto da sessão, separado da comissão."
      >
        <Input name="custo_hora" type="number" step="0.01" min="0" defaultValue="0" />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo label="Admissão" erro={estado.campos?.vigencia_inicio}>
          <Input name="vigencia_inicio" type="date" defaultValue={hoje} required />
        </Campo>
        <Campo label="Desligamento" erro={estado.campos?.vigencia_fim}>
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
