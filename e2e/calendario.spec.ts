import { expect, test } from "@playwright/test";
import { DIA, lerMassa } from "./massa";
import { entrar } from "./acoes";

/** DIA = segunda, 07/01/2030. */
test.describe("mini-calendário da agenda", () => {
  const m = lerMassa();

  test("clicar na data abre o mês e um clique leva ao dia", async ({ page }) => {
    await entrar(page, m.email, m.senha);
    await page.goto(`/agenda?dia=${DIA}&por=sala`);
    await page.getByRole("button", { name: /Escolher data/ }).click();
    const cal = page.getByRole("dialog", { name: "Escolher dia" });
    await expect(cal).toContainText("janeiro 2030");
    await cal.getByRole("button", { name: /quarta-feira, 9 de janeiro de 2030/ }).click();
    await expect(page).toHaveURL(/dia=2030-01-09/);
    await expect(cal).toBeHidden();

    // Outro mês pelas setas do calendário.
    await page.getByRole("button", { name: /Escolher data/ }).click();
    await cal.getByRole("button", { name: "Próximo mês" }).click();
    await expect(cal).toContainText("fevereiro 2030");
    await cal.getByRole("button", { name: /segunda-feira, 4 de fevereiro de 2030/ }).click();
    await expect(page).toHaveURL(/dia=2030-02-04/);
  });

  test("teclado: setas andam, Enter escolhe, Esc fecha", async ({ page }) => {
    await entrar(page, m.email, m.senha);
    await page.goto(`/agenda?dia=${DIA}&por=sala`);
    const gatilho = page.getByRole("button", { name: /Escolher data/ });
    await gatilho.click();
    await page.keyboard.press("ArrowDown"); // +7 dias
    await page.keyboard.press("ArrowRight"); // +1 dia
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/dia=2030-01-15/);

    await gatilho.click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Escolher dia" })).toBeHidden();
    await expect(gatilho).toBeFocused();
  });

  test("na visão mês escolhe-se o mês do ano", async ({ page }) => {
    await entrar(page, m.email, m.senha);
    await page.goto(`/agenda?dia=${DIA}&por=sala&periodo=mes`);
    await page.getByRole("button", { name: /Escolher data/ }).click();
    const cal = page.getByRole("dialog", { name: "Escolher mês" });
    await cal.getByRole("button", { name: "mar", exact: true }).click();
    await expect(page).toHaveURL(/dia=2030-03-01/);
    await expect(page).toHaveURL(/periodo=mes/);
  });
});
