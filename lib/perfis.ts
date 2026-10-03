/**
 * Perfis de acesso.
 *
 * Gestão e financeiro existem separados de propósito: quem analisa ocupação
 * não precisa ver inadimplência de paciente, e quem fecha o caixa não precisa
 * remarcar agendamento. Um perfil só obrigaria a conceder mais acesso do que
 * o trabalho exige.
 */
export const PERFIS = [
  {
    valor: "admin",
    rotulo: "Administrador",
    descricao: "Acesso total, inclusive gerenciar usuários.",
  },
  {
    valor: "gestao",
    rotulo: "Gestão",
    descricao: "Configura a clínica e lê todos os relatórios. Não gerencia usuários.",
  },
  {
    valor: "financeiro",
    rotulo: "Financeiro",
    descricao: "Recebimentos, bonificações, despesas e relatórios. Não opera a agenda.",
  },
  {
    valor: "recepcao",
    rotulo: "Recepção",
    descricao: "Agenda, pacientes e recebimentos. Não vê custo nem margem.",
  },
  {
    valor: "profissional",
    rotulo: "Profissional",
    descricao: "Própria agenda e própria bonificação.",
  },
] as const;

export type PerfilValor = (typeof PERFIS)[number]["valor"];

export const ROTULO_PERFIL: Record<string, string> = Object.fromEntries(
  PERFIS.map((p) => [p.valor, p.rotulo]),
);
