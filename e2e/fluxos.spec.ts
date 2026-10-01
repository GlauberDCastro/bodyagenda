import { expect, test, type Page } from "@playwright/test";
import { DIA, lerMassa, statusDoAgendamento } from "./massa";
import { agendar, entrar } from "./acoes";

/** SPEC §8 · os fluxos que não podem quebrar no dia a dia da recepção. */
test.describe.serial("fluxos críticos", () => {
  const m = lerMassa();

  const entrarComo = (page: Page, senha = m.senha) =>
    entrar(page, m.email, senha, senha === m.senha);

  test("login recusa senha errada e aceita a certa", async ({ page }) => {
    await entrarComo(page, "senha-errada");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await entrarComo(page);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Recepção");
  });

  test("agenda às 09:00 no horário da clínica", async ({ page }) => {
    await entrarComo(page);
    const dialogo = await agendar(page, m, DIA);
    await expect(dialogo).toBeHidden();

    // O bloco precisa aparecer às 09:00 — não às 06:00 (fuso UTC do banco).
    const bloco = page.getByRole("button", { name: new RegExp(m.paciente) });
    await expect(bloco).toBeVisible();
    await expect(bloco).toContainText("09:00");
    expect(await statusDoAgendamento(m)).toEqual(["agendado"]);
  });

  test("conflito na mesma sala e horário é bloqueado com explicação", async ({ page }) => {
    await entrarComo(page);
    const dialogo = await agendar(page, m, DIA);
    await expect(dialogo.getByRole("alert")).toContainText("já está reservado");
    expect(await statusDoAgendamento(m)).toEqual(["agendado"]);
  });

  test("marca o atendimento como realizado", async ({ page }) => {
    await entrarComo(page);
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
    await entrarComo(page);
    await page.goto(`/?por=sala&de=${DIA}&ate=${DIA}`);
    await expect(page.getByText(m.sala).first()).toBeVisible();
  });
});
