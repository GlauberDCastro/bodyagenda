import { expect, test, type Page } from "@playwright/test";
import { DIA, lerMassa, statusDoAgendamento } from "./massa";

/** SPEC §8 · os fluxos que não podem quebrar no dia a dia da recepção. */
test.describe.serial("fluxos críticos", () => {
  const m = lerMassa();

  async function entrar(page: Page, senha = m.senha) {
    await page.goto("/login");
    await page.locator("#email").fill(m.email);
    await page.locator("#senha").fill(senha);
    await page.getByRole("button", { name: "Entrar" }).click();
    if (senha === m.senha) await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  }

  async function agendar(page: Page) {
    await page.goto(`/agenda?dia=${DIA}`);
    await page.getByRole("button", { name: "Novo agendamento" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByPlaceholder("Digite o nome para buscar…").fill(m.paciente);
    await dialogo.locator('select[name="paciente_id"]').selectOption({ label: m.paciente });
    await dialogo
      .locator('select[name="procedimento_id"]')
      .selectOption({ label: `${m.procedimento} — 30 min` });
    await dialogo.locator('input[name="inicio"]').fill(`${DIA}T09:00`);
    await dialogo.locator('select[name="sala_id"]').selectOption({ label: m.sala });
    await dialogo.getByRole("button", { name: "Agendar" }).click();
    return dialogo;
  }

  test("login recusa senha errada e aceita a certa", async ({ page }) => {
    await entrar(page, "senha-errada");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await entrar(page);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Recepção");
  });

  test("agenda às 09:00 no horário da clínica", async ({ page }) => {
    await entrar(page);
    const dialogo = await agendar(page);
    await expect(dialogo).toBeHidden();

    // O bloco precisa aparecer às 09:00 — não às 06:00 (fuso UTC do banco).
    const bloco = page.getByRole("button", { name: new RegExp(m.paciente) });
    await expect(bloco).toBeVisible();
    await expect(bloco).toContainText("09:00");
    expect(await statusDoAgendamento(m)).toEqual(["agendado"]);
  });

  test("conflito na mesma sala e horário é bloqueado com explicação", async ({ page }) => {
    await entrar(page);
    const dialogo = await agendar(page);
    await expect(dialogo.getByRole("alert")).toContainText("já está reservado");
    expect(await statusDoAgendamento(m)).toEqual(["agendado"]);
  });

  test("marca o atendimento como realizado", async ({ page }) => {
    await entrar(page);
    await page.goto(`/agenda?dia=${DIA}`);
    await page.getByRole("button", { name: new RegExp(m.paciente) }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Realizado" }).click();

    await expect.poll(() => statusDoAgendamento(m)).toEqual(["realizado"]);
    await expect(page.getByRole("button", { name: new RegExp(m.paciente) })).toHaveAttribute(
      "title",
      /Realizado/,
    );
  });

  test("painel mostra a sala com o atendimento realizado", async ({ page }) => {
    await entrar(page);
    await page.goto(`/?por=sala&de=${DIA}&ate=${DIA}`);
    await expect(page.getByText(m.sala).first()).toBeVisible();
  });
});
