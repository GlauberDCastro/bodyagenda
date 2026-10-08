import { expect, test } from "@playwright/test";
import { apagarMarcasDoE2E, lerMassa, pacotesComMarca } from "./massa";
import { entrar } from "./acoes";

test.describe.serial("marca do produto", () => {
  const m = lerMassa();
  test.afterAll(() => apagarMarcasDoE2E(m));

  test("gestão cadastra a marca com preço próprio", async ({ page }) => {
    await entrar(page, m.gestao.email, m.gestao.senha);
    await page.goto(`/configuracoes/procedimentos/${m.procedimentoId}`);
    await page.getByRole("button", { name: "Adicionar marca" }).click();
    const modal = page.getByRole("dialog", { name: "Nova marca" });
    await modal.getByLabel("Marca").fill("Marca E2E");
    await modal.getByLabel("À vista por sessão").fill("500");
    await expect(modal.getByText("À vista ÷ 0,85 = R$ 588,24")).toBeVisible();
    await modal.getByLabel("Parcelado por sessão").fill("600");
    await modal.getByRole("button", { name: "Adicionar marca" }).click();
    await expect(modal).toBeHidden();
    await expect(
      page.getByRole("row", { name: /Marca E2E.*R\$ 500,00.*R\$ 600,00/ }),
    ).toBeVisible();
  });

  test("venda de pacote usa o preço da marca, à vista e parcelado", async ({ page }) => {
    await entrar(page, m.email, m.senha);
    await page.goto(`/pacientes/${m.pacienteId}`);
    await page.getByRole("button", { name: "Vender pacote" }).click();
    const venda = page.getByRole("dialog");
    await venda.locator('select[name="procedimento_id"]').selectOption(m.procedimentoId);
    await venda
      .getByLabel("Marca do produto")
      .selectOption({ label: "Marca E2E — R$ 500,00 à vista" });
    await venda.locator('input[name="quantidade_sessoes"]').fill("2");
    await expect(venda.locator('input[name="valor_total"]')).toHaveValue("1000");
    await venda.locator('input[name="parcelas"]').fill("2");
    await expect(venda.locator('input[name="valor_total"]')).toHaveValue("1200");
    await venda.getByRole("button", { name: "Vender pacote" }).click();
    await expect(venda).toBeHidden();
    expect(await pacotesComMarca(m)).toEqual(["Marca E2E 1200"]);
  });
});
