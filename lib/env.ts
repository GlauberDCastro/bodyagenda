/**
 * Leitura validada das variáveis de ambiente.
 *
 * Falhar aqui, na subida, é melhor do que falhar numa query com "invalid API
 * key" depois de três telas de navegação.
 */

function obrigatoria(nome: string, valor: string | undefined): string {
  if (!valor) {
    // A mensagem muda conforme onde o build está rodando: dizer "copie o
    // .env.example" no log da Vercel manda a pessoa para o lugar errado.
    const onde = process.env.VERCEL
      ? "Defina-a em Settings → Environment Variables do projeto na Vercel e refaça o deploy."
      : "Copie .env.example para .env.local e preencha.";
    throw new Error(`Variável de ambiente ausente: ${nome}. ${onde}`);
  }
  return valor;
}

export const env = {
  supabaseUrl: obrigatoria(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  /**
   * Chave pública. É segura no navegador PORQUE o RLS existe — nunca porque
   * a interface esconde alguma coisa (SPEC §5.3, princípio P2).
   *
   * Aceita o formato novo (sb_publishable_…) e o legado (JWT anon).
   */
  supabaseChavePublica: obrigatoria(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ou NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  tz: process.env.NEXT_PUBLIC_APP_TZ ?? "America/Sao_Paulo",
} as const;

/**
 * service_role IGNORA O RLS POR COMPLETO.
 *
 * Função separada, e não campo de `env`, de propósito: importar `env` num
 * componente cliente não pode arrastar a chave junto. Só chame no servidor,
 * e apenas na criação de usuário pelo admin (SPEC §5.3).
 */
export function chaveServiceRole(): string {
  if (typeof window !== "undefined") {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY foi acessada no navegador. " +
        "Essa chave ignora o RLS e jamais pode chegar ao cliente.",
    );
  }
  return obrigatoria(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
