"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { criarAgendamento, type ResultadoAgendamento } from "@/lib/actions/agenda";
import { buscarPacientesAction, pacotesDoPacienteAction } from "@/lib/actions/busca";
import { Campo, Input, Select, Textarea, Botao } from "@/components/ui/primitivos";
import type { Sala, Equipamento, Profissional, Procedimento } from "@/lib/types/database";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface PacoteOpcao {
  id: string;
  rotulo: string;
}

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Agendando…" : "Agendar"}
    </Botao>
  );
}

export function NovoAgendamento({
  salas,
  equipamentos,
  profissionais,
  procedimentos,
  diaPadrao,
}: {
  salas: Sala[];
  equipamentos: Equipamento[];
  profissionais: Profissional[];
  procedimentos: Procedimento[];
  diaPadrao: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [pacientes, setPacientes] = useState<{ id: string; nome: string }[]>([]);
  const [pacienteId, setPacienteId] = useState("");
  const [pacotes, setPacotes] = useState<PacoteOpcao[]>([]);
  const [pacoteId, setPacoteId] = useState("");
  const [procId, setProcId] = useState("");

  const procedimento = procedimentos.find((p) => p.id === procId);
  const sala = salas.find(
    (s) => s.tipo_alocacao === "dedicada" && s.procedimento_fixo_id === procId,
  );

  const [estado, acao] = useActionState<ResultadoAgendamento, FormData>(
    async (anterior, formData) => {
      const r = await criarAgendamento(anterior, formData);
      if (r.ok) setAberto(false);
      return r;
    },
    {},
  );

  // Busca de paciente com debounce — evita uma consulta por tecla.
  useEffect(() => {
    if (termo.trim().length < 2) return;
    const t = setTimeout(async () => {
      setPacientes(await buscarPacientesAction(termo));
    }, 250);
    return () => clearTimeout(t);
  }, [termo]);

  // RF-63 · só pacotes ativos, com saldo e dentro da validade.
  useEffect(() => {
    if (!pacienteId) return;
    pacotesDoPacienteAction(pacienteId).then(setPacotes);
  }, [pacienteId]);

  // Listas derivadas na renderização em vez de zeradas dentro do efeito:
  // o resultado obsoleto simplesmente não é exibido, e não há um instante em
  // que a tela mostre o paciente anterior enquanto a nova busca não voltou.
  const pacientesVisiveis = termo.trim().length < 2 ? [] : pacientes;
  const pacotesVisiveis = pacienteId ? pacotes : [];

  if (!aberto) {
    return (
      <Botao type="button" onClick={() => setAberto(true)}>
        Novo agendamento
      </Botao>
    );
  }

  return (
    <form
      action={acao}
      className="w-full max-w-lg space-y-4 rounded-lg border border-[var(--traco)] p-4 "
    >
      <Campo label="Paciente" erro={estado.campos?.paciente_id}>
        <Input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Digite o nome para buscar…"
          autoFocus
        />
        {pacientesVisiveis.length > 0 && (
          <Select
            name="paciente_id"
            value={pacienteId}
            onChange={(e) => {
              setPacienteId(e.target.value);
              setPacoteId("");
            }}
            required
            className="mt-2"
          >
            <option value="">Selecione…</option>
            {pacientesVisiveis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
        )}
        {pacienteId && <input type="hidden" name="paciente_id" value={pacienteId} />}
      </Campo>

      <Campo label="Procedimento" erro={estado.campos?.procedimento_id}>
        <Select
          name="procedimento_id"
          value={procId}
          onChange={(e) => setProcId(e.target.value)}
          required
        >
          <option value="">Selecione…</option>
          {procedimentos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome} — {p.duracao_min} min
              {p.buffer_min > 0 ? ` (+${p.buffer_min} preparo)` : ""}
            </option>
          ))}
        </Select>
      </Campo>

      {pacotesVisiveis.length > 0 && (
        <Campo label="Consumir de um pacote" dica="Deixe vazio para cobrar como sessão avulsa.">
          <Select name="pacote_id" value={pacoteId} onChange={(e) => setPacoteId(e.target.value)}>
            <option value="">Sessão avulsa</option>
            {pacotesVisiveis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.rotulo}
              </option>
            ))}
          </Select>
        </Campo>
      )}

      {!pacoteId && (
        <Campo
          label="Valor da sessão avulsa"
          erro={estado.campos?.valor_avulso}
          dica={
            procedimento ? `Tabela: ${brl.format(Number(procedimento.valor_sessao))}` : undefined
          }
        >
          <Input
            name="valor_avulso"
            type="number"
            step="0.01"
            min="0"
            defaultValue={procedimento ? Number(procedimento.valor_sessao) : ""}
          />
        </Campo>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Campo label="Início" erro={estado.campos?.inicio}>
          <Input name="inicio" type="datetime-local" defaultValue={`${diaPadrao}T09:00`} required />
        </Campo>
        <Campo
          label="Sala"
          erro={estado.campos?.sala_id}
          dica={sala ? "Definida pela sala dedicada ao procedimento." : undefined}
        >
          {/* RF-45 · sala dedicada é escolhida automaticamente e travada. */}
          <Select name="sala_id" required value={sala?.id} disabled={!!sala}>
            <option value="">Selecione…</option>
            {salas.map((s) => (
              <option key={s.id} value={s.id}>
                Sala {s.numero} — {s.nome}
              </option>
            ))}
          </Select>
          {sala && <input type="hidden" name="sala_id" value={sala.id} />}
        </Campo>
      </div>

      <Campo label="Equipamentos" dica="Marque quantos a sessão usar ao mesmo tempo.">
        <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-[var(--traco)] p-2 ">
          {equipamentos.map((e) => (
            <label key={e.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="equipamentos" value={e.id} />
              {e.nome}
              <span className="text-xs text-[var(--tinta-3)]">({e.modelo})</span>
            </label>
          ))}
        </div>
      </Campo>

      <Campo label="Profissionais">
        <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-[var(--traco)] p-2 ">
          {profissionais.length === 0 && (
            <p className="text-xs text-[var(--tinta-3)]">Nenhum profissional cadastrado.</p>
          )}
          {profissionais.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="profissionais" value={p.id} />
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ backgroundColor: p.cor_agenda }}
              />
              {p.nome}
            </label>
          ))}
        </div>
      </Campo>

      <Campo label="Observações">
        <Textarea name="observacoes" rows={2} />
      </Campo>

      {/* RF-46 · conflito traduzido: qual recurso, que horário, com quem. */}
      {estado.erro && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {estado.erro}
        </div>
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
