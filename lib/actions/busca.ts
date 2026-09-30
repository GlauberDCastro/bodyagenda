"use server";

import { buscarPacientes, pacotesAgendaveis } from "@/lib/consultas/pacientes";

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
