"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { criarAgendamento, type ResultadoAgendamento } from "@/lib/actions/agenda";
import { buscarPacientesAction, pacotesDoPacienteAction } from "@/lib/actions/busca";
import { cadastrarPacienteRapido } from "@/lib/actions/pacientes";
import { Campo, Input, Select, Textarea, Botao } from "@/components/ui/primitivos";
import { GatilhoModal, AcoesModal } from "@/components/ui/modal";
import { useAgendamento, type PresetAgendamento } from "@/components/agenda/contexto-agendamento";
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

interface Recursos {
  salas: Sala[];
  equipamentos: Equipamento[];
  profissionais: Profissional[];
  procedimentos: Procedimento[];
  diaPadrao: string;
}

/**
 * Aberto pelo botão do cabeçalho ou pelo clique num horário vazio da agenda,
 * que chega com dia, hora e recurso já preenchidos.
 */
export function NovoAgendamento(props: Recursos) {
  const { aberto, preset, versao, abrir, fechar } = useAgendamento();

  return (
    <GatilhoModal
      rotulo="Novo agendamento"
      titulo="Novo agendamento"
      descricao="Sala, equipamentos e profissionais são checados contra conflito."
      aberto={aberto}
      aoMudar={(v) => (v ? abrir() : fechar())}
    >
      <FormularioAgendamento key={versao} {...props} preset={preset} aoConcluir={fechar} />
    </GatilhoModal>
  );
}

function FormularioAgendamento({
  salas,
  equipamentos,
  profissionais,
  procedimentos,
  diaPadrao,
  preset,
  aoConcluir,
}: Recursos & { preset: PresetAgendamento; aoConcluir: () => void }) {
  const [termo, setTermo] = useState("");
  // autoFocus não vale dentro do <dialog>: o showModal() leva o foco para o
  // primeiro botão (o X). A recepção abre o formulário para digitar o nome.
  const campoPaciente = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => campoPaciente.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);
  const [pacientes, setPacientes] = useState<{ id: string; nome: string }[]>([]);
  /** Termo cuja busca já voltou: só então "nenhum encontrado" é verdade. */
  const [buscado, setBuscado] = useState("");
  const [cadastrando, setCadastrando] = useState(false);
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
      if (r.ok) aoConcluir();
      return r;
    },
    {},
  );

  // Busca de paciente com debounce — evita uma consulta por tecla.
  useEffect(() => {
    if (termo.trim().length < 2) return;
    const t = setTimeout(async () => {
      setPacientes(await buscarPacientesAction(termo));
      setBuscado(termo);
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

  return (
    <form action={acao} className="space-y-4">
      <Campo label="Paciente" erro={estado.campos?.paciente_id}>
        <Input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Digite o nome para buscar…"
          ref={campoPaciente}
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

        {cadastrando ? (
          <CadastroRapido
            nomeInicial={termo.trim()}
            aoCancelar={() => setCadastrando(false)}
            aoCriar={(novo) => {
              setCadastrando(false);
              setTermo(novo.nome);
              setBuscado(novo.nome);
              setPacientes([novo]);
              setPacienteId(novo.id);
              setPacoteId("");
            }}
          />
        ) : (
          termo.trim().length >= 2 &&
          buscado === termo &&
          (pacientesVisiveis.length === 0 ? (
            <p className="mt-2 text-[13px] text-[var(--tinta-3)]">
              Nenhum paciente com &ldquo;{termo.trim()}&rdquo;.{" "}
              <button
                type="button"
                onClick={() => setCadastrando(true)}
                className="font-medium text-[var(--marca)] underline-offset-4 hover:underline"
              >
                + Cadastrar &ldquo;{termo.trim()}&rdquo;
              </button>
            </p>
          ) : (
            // Homônimo: o nome existe, mas não é esta pessoa.
            <button
              type="button"
              onClick={() => setCadastrando(true)}
              className="mt-1.5 text-[12.5px] text-[var(--tinta-3)] underline-offset-4 hover:text-[var(--tinta-1)] hover:underline"
            >
              + Novo paciente
            </button>
          ))
        )}
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
        <Campo
          label="Início"
          erro={estado.campos?.inicio}
          // A duração vem do procedimento: reserva sala e aparelho pelo tempo certo.
          dica={
            preset.fim && preset.inicio
              ? `Marcado na agenda: ${preset.inicio.slice(11, 16)}–${preset.fim}. A duração final é a do procedimento.`
              : undefined
          }
        >
          <Input
            name="inicio"
            type="datetime-local"
            defaultValue={preset.inicio ?? `${diaPadrao}T09:00`}
            required
          />
        </Campo>
        <Campo
          label="Sala"
          erro={estado.campos?.sala_id}
          dica={sala ? "Definida pela sala dedicada ao procedimento." : undefined}
        >
          {/* RF-45 · sala dedicada é escolhida automaticamente e travada. */}
          <Select
            name="sala_id"
            required
            {...(sala ? { value: sala.id } : { defaultValue: preset.sala_id ?? "" })}
            disabled={!!sala}
          >
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
              <input
                type="checkbox"
                name="equipamentos"
                value={e.id}
                defaultChecked={preset.equipamentos?.includes(e.id)}
              />
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
              <input
                type="checkbox"
                name="profissionais"
                value={p.id}
                defaultChecked={preset.profissionais?.includes(p.id)}
              />
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

      <AcoesModal aoCancelar={aoConcluir}>
        <Salvar />
      </AcoesModal>
    </form>
  );
}

/**
 * Paciente novo sem sair do agendamento. Os campos não têm `name`: vivem
 * dentro do formulário de agendamento e não podem ir junto no envio dele.
 */
function CadastroRapido({
  nomeInicial,
  aoCriar,
  aoCancelar,
}: {
  nomeInicial: string;
  aoCriar: (paciente: { id: string; nome: string }) => void;
  aoCancelar: () => void;
}) {
  const [nome, setNome] = useState(nomeInicial);
  const [telefone, setTelefone] = useState("");
  const [cpf, setCpf] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    const r = await cadastrarPacienteRapido({ nome, telefone, cpf });
    setSalvando(false);
    setErros(r.campos ?? {});
    setErro(r.campos ? null : (r.erro ?? null));
    if (r.paciente) aoCriar(r.paciente);
  };

  // Enter num destes campos enviaria o agendamento inteiro.
  const enterSalva = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      salvar();
    }
  };

  return (
    <div className="mt-2 space-y-3 rounded-[var(--r-md)] border border-[var(--traco)] bg-[var(--superficie-2)] p-3">
      <p className="text-[13px] font-medium">Novo paciente</p>
      <Campo label="Nome completo" erro={erros.nome}>
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={enterSalva}
          autoFocus
        />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Telefone" erro={erros.telefone}>
          <Input
            type="tel"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            onKeyDown={enterSalva}
            placeholder="(11) 90000-0000"
          />
        </Campo>
        <Campo label="CPF" erro={erros.cpf} dica="Opcional agora.">
          <Input
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            onKeyDown={enterSalva}
            inputMode="numeric"
          />
        </Campo>
      </div>
      {erro && (
        <p role="alert" className="text-[12.5px]" style={{ color: "var(--status-critico)" }}>
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Botao type="button" variante="fantasma" onClick={aoCancelar}>
          Cancelar
        </Botao>
        <Botao type="button" variante="secundario" onClick={salvar} disabled={salvando}>
          {salvando ? "Cadastrando…" : "Cadastrar e usar"}
        </Botao>
      </div>
    </div>
  );
}
