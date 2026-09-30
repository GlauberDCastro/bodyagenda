/**
 * Constantes compartilhadas entre servidor e cliente.
 *
 * Fica FORA de qualquer arquivo "use server": um módulo de Server Action só
 * pode exportar funções assíncronas, e uma constante exportada de lá é
 * transformada em referência de ação — quebrando em runtime, não na compilação.
 */

export const UNIDADES = [
  { valor: "sessao", rotulo: "Sessão" },
  { valor: "ui", rotulo: "UI (unidades)" },
  { valor: "ml", rotulo: "ml" },
  { valor: "seringa", rotulo: "Seringa" },
  { valor: "flash", rotulo: "Flash" },
  { valor: "aplicacao", rotulo: "Aplicação" },
] as const;

export const ROTULO_UNIDADE: Record<string, string> = {
  sessao: "sessão",
  ui: "UI",
  ml: "ml",
  seringa: "seringa(s)",
  flash: "flash",
  aplicacao: "aplicação(ões)",
};
