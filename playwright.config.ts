import { defineConfig } from "@playwright/test";

/**
 * E2E dos fluxos críticos (SPEC §8): login, agendar com conflito bloqueado,
 * marcar realizado e painel.
 *
 * Roda contra o Supabase do .env.local com massa própria, criada no
 * globalSetup e apagada no globalTeardown.
 */
const PORTA = 3100;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // Os fluxos encadeiam: o conflito depende do agendamento criado antes.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  // O next dev compila cada rota e ação na primeira visita: uma gravação
  // ocasionalmente passa dos 5 s padrão (visto 2x em 04/10/2026, com a suíte
  // verde ao rodar de novo). 10 s absorve isso sem esconder travamento real.
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORTA}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next dev --port ${PORTA}`,
    url: `http://localhost:${PORTA}/login`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
