import type { Page } from "@playwright/test";
import type { Massa } from "./massa";

export async function entrar(page: Page, email: string, senha: string, esperarEntrada = true) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  if (esperarEntrada) await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** Abre "Novo agendamento" e envia para a sala de teste às 09:00 do dia. */
export async function agendar(page: Page, m: Massa, dia: string, paciente = m.paciente) {
  await page.goto(`/agenda?dia=${dia}`);
  await page.getByRole("button", { name: "Novo agendamento" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByPlaceholder("Digite o nome para buscar…").fill(paciente);
  await dialogo.locator('select[name="paciente_id"]').selectOption({ label: paciente });
  await dialogo
    .locator('select[name="procedimento_id"]')
    .selectOption({ label: `${m.procedimento} — 30 min` });
  await dialogo.locator('input[name="inicio"]').fill(`${dia}T09:00`);
  await dialogo.locator('select[name="sala_id"]').selectOption({ label: m.sala });
  await dialogo.getByRole("button", { name: "Agendar" }).click();
  return dialogo;
}
