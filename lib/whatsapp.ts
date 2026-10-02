const TZ = "America/Sao_Paulo";
const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const dia = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ });

/** Telefone brasileiro → link do WhatsApp, com mensagem opcional. Null se o número não serve. */
export function linkWhatsApp(
  telefone: string | null | undefined,
  mensagem?: string,
): string | null {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (digitos.length < 10) return null;
  const numero = digitos.length <= 11 ? `55${digitos}` : digitos;
  return `https://wa.me/${numero}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ""}`;
}

/** A mensagem de confirmação que a recepção manda na véspera. */
export function mensagemConfirmacao(nome: string, procedimento: string, inicio: string): string {
  const d = new Date(inicio);
  return `Olá, ${nome.split(" ")[0]}! Confirmando seu atendimento de ${procedimento} em ${dia.format(d)} às ${hora.format(d)}. Podemos confirmar?`;
}
