"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { salvarEquipamento, type Resultado } from "@/lib/actions/recursos";
import { Campo, Input, Select, Botao } from "@/components/ui/primitivos";
import type { Sala } from "@/lib/types/database";

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Salvar equipamento"}
    </Botao>
  );
}

export function FormularioEquipamento({ salas }: { salas: Sala[] }) {
  const [aberto, setAberto] = useState(false);
  const [alocacao, setAlocacao] = useState<"fixo" | "movel">("movel");

  const [estado, acao] = useActionState<Resultado, FormData>(async (anterior, formData) => {
    const r = await salvarEquipamento(null, anterior, formData);
    if (r.ok) setAberto(false);
    return r;
  }, {});

  if (!aberto) {
    return (
      <Botao type="button" onClick={() => setAberto(true)}>
        Novo equipamento
      </Botao>
    );
  }

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <form
      action={acao}
      className="w-full max-w-md space-y-4 rounded-lg border border-[var(--traco)] p-4 "
    >
      <Campo
        label="Modelo"
        erro={estado.campos?.modelo}
        dica="Agrupa as unidades. Os 4 Ultraformer compartilham o modelo 'Ultraformer'."
      >
        <Input name="modelo" required placeholder="Ultraformer" />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo label="Nome da unidade" erro={estado.campos?.nome}>
          <Input name="nome" required placeholder="Ultraformer #1" />
        </Campo>
        <Campo label="Nº de série" erro={estado.campos?.numero_serie}>
          <Input name="numero_serie" />
        </Campo>
      </div>

      <Campo label="Alocação" dica="Fixo mora numa sala e a define automaticamente; móvel circula.">
        <Select
          name="tipo_alocacao"
          value={alocacao}
          onChange={(e) => setAlocacao(e.target.value as "fixo" | "movel")}
        >
          <option value="movel">Móvel</option>
          <option value="fixo">Fixo em uma sala</option>
        </Select>
      </Campo>

      {alocacao === "fixo" && (
        <Campo label="Sala" erro={estado.campos?.sala_id}>
          <Select name="sala_id" required>
            <option value="">Selecione…</option>
            {salas.map((s) => (
              <option key={s.id} value={s.id}>
                Sala {s.numero} — {s.nome}
              </option>
            ))}
          </Select>
        </Campo>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Campo label="Custo de aquisição" erro={estado.campos?.custo_aquisicao}>
          <Input name="custo_aquisicao" type="number" step="0.01" min="0" />
        </Campo>
        <Campo
          label="Custo por hora"
          erro={estado.campos?.custo_hora}
          dica="Entra no custo direto da sessão."
        >
          <Input name="custo_hora" type="number" step="0.01" min="0" defaultValue="0" />
        </Campo>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Campo
          label="Vigência — início"
          erro={estado.campos?.vigencia_inicio}
          dica="Aparelho novo não altera a ocupação de meses passados."
        >
          <Input name="vigencia_inicio" type="date" defaultValue={hoje} required />
        </Campo>
        <Campo label="Vigência — fim" erro={estado.campos?.vigencia_fim}>
          <Input name="vigencia_fim" type="date" />
        </Campo>
      </div>

      {estado.erro && !estado.campos && (
        <p role="alert" className="text-sm text-[color:var(--status-critico)]">
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
