import { redirect } from "next/navigation";

/** A entrada "Configurações" da barra lateral cai na primeira aba. */
export default function ConfiguracoesPage() {
  redirect("/configuracoes/salas");
}
