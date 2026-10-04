import { expect, test } from "@playwright/test";
import { lerMassa } from "./massa";
import { entrar } from "./acoes";

test.describe.serial("central de gestão", () => {
  const m = lerMassa();

  test("gestão abre a central pelo menu, filtra por canal e exporta", async ({ page }) => {
    await entrar(page, m.gestao.email, m.gestao.senha);
    await page.getByRole("link", { name: "Central 360" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Central de gestão" })).toBeVisible();
    for (const secao of [
      "Vendas por canal",
      "Vendas por dia",
      "Avaliação inicial",
      "Quem vendeu",
      "Ocupação das salas",
      "Ocupação das profissionais",
      "Relatório de vendas",
    ]) {
      await expect(page.getByRole("heading", { name: secao })).toBeVisible();
    }
    await expect(page.getByText("Conversão da avaliação")).toBeVisible();

    await page.getByRole("link", { name: "Comercial (SDR e closer)" }).last().click();
    await expect(page).toHaveURL(/canal=comercial/);
    await expect(
      page
        .getByRole("navigation", { name: "Filtrar por canal" })
        .getByRole("link", { name: "Comercial (SDR e closer)" }),
    ).toHaveAttribute("aria-current", "page");

    const resposta = await page.request.get(
      `/api/exportar/vendas?de=2026-10-01&ate=2026-10-31&formato=csv`,
    );
    expect(resposta.ok()).toBe(true);
    expect(await resposta.text()).toContain("Vendido por");
  });

  test("recepção não vê o menu nem a central", async ({ page }) => {
    await entrar(page, m.email, m.senha);
    await expect(page.getByRole("link", { name: "Central 360" })).toHaveCount(0);
    await page.goto("/gestao");
    await expect(page.getByText("Só administração e gestão acessam a central.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Quem vendeu" })).toHaveCount(0);
  });
});
