"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { criarAgendamento, type ResultadoAgendamento } from "@/lib/actions/agenda";
import {
  buscarPacientesAction,
  carenciaAction,
  horariosLivresAction,
  pacotesDoPacienteAction,
} from "@/lib/actions/busca";
import { cadastrarPacienteRapido } from "@/lib/actions/pacientes";
import { Aviso, Campo, Input, Select, Textarea, Botao } from "@/components/ui/primitivos";
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
  /** Habilitações (RF-23a) e aparelhos exigidos (RF-44) de cada procedimento. */
  regras: {
    habilitacoes: { profissional_id: string; procedimento_id: string }[];
    requisitos: { procedimento_id: string; modelo: string | null; quantidade: number }[];
  };
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
  regras,
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

  // Recursos controlados: o formulário aplica as regras do catálogo sozinho.
  const [salaSel, setSalaSel] = useState(preset.sala_id ?? "");
  const [equipSel, setEquipSel] = useState<string[]>(preset.equipamentos ?? []);
  const [profSel, setProfSel] = useState<string[]>(preset.profissionais ?? []);
  const [inicio, setInicio] = useState(preset.inicio ?? `${diaPadrao}T09:00`);
  const [duracao, setDuracao] = useState("");
  const [livres, setLivres] = useState<string[] | null>(null);
  const [buscandoLivres, setBuscandoLivres] = useState(false);
  const [carencia, setCarencia] = useState<{ ultima: string; dias: number; minimo: number } | null>(
    null,
  );

  const procedimento = procedimentos.find((p) => p.id === procId);
  const salaDedicadaDe = (id: string) =>
    salas.find((s) => s.tipo_alocacao === "dedicada" && s.procedimento_fixo_id === id);
  const salaDedicada = salaDedicadaDe(procId);
  // RF-45 · aparelho fixo leva a sala junto.
  const equipFixo = equipamentos.find(
    (e) => equipSel.includes(e.id) && e.tipo_alocacao === "fixo" && e.sala_id,
  );
  const salaTravada = salaDedicada?.id ?? equipFixo?.sala_id ?? null;
  const salaEfetiva = salaTravada ?? salaSel;

  // RF-23a · só quem é habilitado no procedimento.
  const habilitados = new Set(
    regras.habilitacoes.filter((h) => h.procedimento_id === procId).map((h) => h.profissional_id),
  );
  const profissionaisVisiveis = procId
    ? profissionais.filter((p) => habilitados.has(p.id))
    : profissionais;

  /** RF-44 / RF-20b · ao escolher o procedimento, marca os aparelhos que ele exige. */
  function escolherProcedimento(id: string) {
    setProcId(id);
    setDuracao("");
    setLivres(null);
    const salaBase = salaDedicadaDe(id)?.id ?? salaSel;
    const exigidos: string[] = [];
    for (const r of regras.requisitos.filter((x) => x.procedimento_id === id && x.modelo)) {
      const candidatos = equipamentos
        .filter((e) => e.modelo === r.modelo && !exigidos.includes(e.id))
        // Prefere o que já estava marcado e o que mora na sala escolhida.
        .sort(
          (a, b) =>
            Number(equipSel.includes(b.id)) - Number(equipSel.includes(a.id)) ||
            Number(b.sala_id === salaBase) - Number(a.sala_id === salaBase),
        );
      exigidos.push(...candidatos.slice(0, r.quantidade).map((e) => e.id));
    }
    if (exigidos.length > 0) setEquipSel(exigidos);
    const hab = new Set(
      regras.habilitacoes.filter((h) => h.procedimento_id === id).map((h) => h.profissional_id),
    );
    setProfSel((atual) => atual.filter((p) => hab.has(p)));
  }

  const alternar = (lista: string[], id: string) =>
    lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];

  async function buscarLivres() {
    setBuscandoLivres(true);
    setLivres(
      await horariosLivresAction({
        procedimentoId: procId,
        dia: inicio.slice(0, 10),
        salaId: salaEfetiva,
        equipamentos: equipSel,
        profissionais: profSel,
        duracaoMin: duracao ? Number(duracao) : null,
      }),
    );
    setBuscandoLivres(false);
  }

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

  // RF-53 · carência: avisa, não bloqueia.
  useEffect(() => {
    if (!pacienteId || !procId || inicio.length < 16) return;
    const t = setTimeout(async () => {
      setCarencia(await carenciaAction(pacienteId, procId, inicio));
    }, 300);
    return () => clearTimeout(t);
  }, [pacienteId, procId, inicio]);

  // Listas derivadas na renderização em vez de zeradas dentro do efeito:
  // o resultado obsoleto simplesmente não é exibido, e não há um instante em
  // que a tela mostre o paciente anterior enquanto a nova busca não voltou.
  const pacientesVisiveis = termo.trim().length < 2 ? [] : pacientes;
  const pacotesVisiveis = pacienteId ? pacotes : [];
  const carenciaVisivel = pacienteId && procId ? carencia : null;

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

      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <Campo label="Procedimento" erro={estado.campos?.procedimento_id}>
          <Select
            name="procedimento_id"
            value={procId}
            onChange={(e) => escolherProcedimento(e.target.value)}
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
        {/* RF-43 · vazio = a duração do procedimento. */}
        <Campo label="Duração (min)" erro={estado.campos?.duracao_min}>
          <Input
            name="duracao_min"
            type="number"
            min={5}
            step={5}
            value={duracao}
            placeholder={procedimento ? String(procedimento.duracao_min) : ""}
            onChange={(e) => setDuracao(e.target.value)}
          />
        </Campo>
      </div>

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
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            required
          />
        </Campo>
        <Campo
          label="Sala"
          erro={estado.campos?.sala_id}
          dica={
            salaDedicada
              ? "Definida pela sala dedicada ao procedimento."
              : equipFixo
                ? `Definida pelo aparelho ${equipFixo.nome}, fixo nesta sala.`
                : undefined
          }
        >
          <Select
            name="sala_id"
            required
            value={salaEfetiva}
            onChange={(e) => setSalaSel(e.target.value)}
            disabled={!!salaTravada}
          >
            <option value="">Selecione…</option>
            {salas.map((s) => (
              <option key={s.id} value={s.id}>
                Sala {s.numero} — {s.nome}
              </option>
            ))}
          </Select>
          {salaTravada && <input type="hidden" name="sala_id" value={salaTravada} />}
        </Campo>
      </div>

      {/* RF-48 · horários em que todos os recursos escolhidos estão livres. */}
      <div className="space-y-2">
        <Botao
          type="button"
          variante="secundario"
          onClick={buscarLivres}
          disabled={!procId || !salaEfetiva || buscandoLivres}
        >
          {buscandoLivres ? "Buscando…" : "Buscar horário livre"}
        </Botao>
        {!procId && (
          <span className="ml-2 text-[12.5px] text-[var(--tinta-3)]">
            Escolha o procedimento e a sala primeiro.
          </span>
        )}
        {livres && (
          <HorariosLivres
            livres={livres}
            aoEscolher={(v) => {
              setInicio(v);
              setLivres(null);
            }}
          />
        )}
      </div>

      {carenciaVisivel && (
        <Aviso>
          A última sessão de {procedimento?.nome} deste paciente foi há {carenciaVisivel.dias}{" "}
          dia(s); o intervalo mínimo é de {carenciaVisivel.minimo} dias. Dá para agendar mesmo
          assim.
        </Aviso>
      )}

      <Campo label="Equipamentos" dica="Marque quantos a sessão usar ao mesmo tempo.">
        <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-[var(--traco)] p-2 ">
          {equipamentos.map((e) => (
            <label key={e.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="equipamentos"
                value={e.id}
                checked={equipSel.includes(e.id)}
                onChange={() => setEquipSel((l) => alternar(l, e.id))}
              />
              {e.nome}
              <span className="text-xs text-[var(--tinta-3)]">({e.modelo})</span>
            </label>
          ))}
        </div>
      </Campo>

      <Campo
        label="Profissionais"
        dica={procedimento ? `Só quem é habilitado em ${procedimento.nome}.` : undefined}
      >
        <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-[var(--traco)] p-2 ">
          {profissionaisVisiveis.length === 0 && (
            <p className="text-xs text-[var(--tinta-3)]">
              {procId
                ? "Nenhum profissional habilitado neste procedimento. Ajuste em Configurações › Profissionais."
                : "Nenhum profissional cadastrado."}
            </p>
          )}
          {profissionaisVisiveis.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="profissionais"
                value={p.id}
                checked={profSel.includes(p.id)}
                onChange={() => setProfSel((l) => alternar(l, p.id))}
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

const diaHora = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});
const soHora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});
/** "2026-10-06T09:00" no horário da clínica, para o datetime-local. */
const paraLocal = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  })
    .format(new Date(iso))
    .replace(" ", "T");

/** Horários livres agrupados por dia; clicar preenche o início. */
function HorariosLivres({
  livres,
  aoEscolher,
}: {
  livres: string[];
  aoEscolher: (local: string) => void;
}) {
  if (livres.length === 0) {
    return (
      <p className="text-[13px] text-[var(--tinta-3)]">
        Nenhum horário livre nos próximos 7 dias com estes recursos.
      </p>
    );
  }
  const porDia = new Map<string, string[]>();
  for (const iso of livres) {
    const dia = diaHora.format(new Date(iso));
    porDia.set(dia, [...(porDia.get(dia) ?? []), iso]);
  }
  return (
    <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-[var(--traco)] p-2">
      {[...porDia.entries()].map(([dia, horas]) => (
        <div key={dia} className="flex flex-wrap items-center gap-1.5">
          <span className="w-20 text-[12px] font-medium text-[var(--tinta-2)]">{dia}</span>
          {horas.map((iso) => (
            <button
              key={iso}
              type="button"
              onClick={() => aoEscolher(paraLocal(iso))}
              className="rounded-full border border-[var(--traco)] px-2.5 py-0.5 text-[12px] tabular-nums hover:border-[var(--marca)] hover:text-[var(--marca)]"
            >
              {soHora.format(new Date(iso))}
            </button>
          ))}
        </div>
      ))}
    </div>
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
