"use server";

import { buscarPacientes, pacotesAgendaveis } from "@/lib/consultas/pacientes";
import { carenciaViolada, horariosLivres } from "@/lib/consultas/agenda";
import { horarioDaClinica } from "@/lib/schemas/agenda";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Busca incremental de paciente para a agenda. Passa pelo RLS como qualquer leitura. */
export async function buscarPacientesAction(
  termo: string,
): Promise<{ id: string; nome: string }[]> {
  const pacientes = await buscarPacientes(termo);
  return pacientes
    .filter((p) => p.ativo)
    .slice(0, 20)
    .map((p) => ({ id: p.id, nome: p.nome }));
}

/**
 * RF-63 · só pacotes que a agenda pode consumir: ativos, com saldo e dentro
 * da validade. Oferecer um pacote sem saldo só para o banco recusar depois
 * é fazer a recepção descobrir o problema na frente do paciente.
 */
export async function pacotesDoPacienteAction(
  pacienteId: string,
): Promise<{ id: string; rotulo: string }[]> {
  const pacotes = await pacotesAgendaveis(pacienteId);
  return pacotes.map((p) => {
    const liquido = Number(p.valor_total) - Number(p.desconto);
    return {
      id: p.id,
      rotulo: `${p.procedimento?.nome ?? "—"} · sessão ${p.usadas + 1} de ${p.quantidade_sessoes} · ${brl.format(liquido / p.quantidade_sessoes)}/sessão`,
    };
  });
}

/**
 * RF-48 · próximos horários em que todos os recursos escolhidos estão livres,
 * a partir do dia do formulário, por 7 dias.
 */
export async function horariosLivresAction(params: {
  procedimentoId: string;
  dia: string;
  salaId?: string;
  equipamentos: string[];
  profissionais: string[];
  duracaoMin?: number | null;
}): Promise<string[]> {
  const de = new Date(horarioDaClinica(`${params.dia}T00:00`));
  const ate = new Date(de.getTime() + 7 * 86_400_000);
  const livres = await horariosLivres({
    procedimentoId: params.procedimentoId,
    de,
    ate,
    salaId: params.salaId || null,
    equipamentos: params.equipamentos,
    profissionais: params.profissionais,
    passoMin: 30,
    duracaoMin: params.duracaoMin,
  });
  return livres.slice(0, 60).map((l) => l.inicio);
}

/** RF-53 · alerta (sem bloquear) de sessão antes da carência mínima. */
export async function carenciaAction(pacienteId: string, procedimentoId: string, inicioLocal: string) {
  return carenciaViolada(pacienteId, procedimentoId, horarioDaClinica(inicioLocal));
}
