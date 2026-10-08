import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { apagarVendasImportadasDoE2E, lerMassa, vendasImportadasDoE2E } from "./massa";
import { entrar } from "./acoes";

const RELATORIO = join(__dirname, "arquivos", "relatorio-de-planos.xls");

test.describe.serial("importar vendas do sistema anterior", () => {
  const m = lerMassa();
  test.beforeAll(() => apagarVendasImportadasDoE2E());
  test.afterAll(() => apagarVendasImportadasDoE2E());

  test("gestão revisa e importa o relatório de planos; reimportar não duplica", async ({
    page,
  }) => {
    await entrar(page, m.gestao.email, m.gestao.senha);
    await page.goto("/pacientes");
    await page.getByRole("link", { name: "Importar vendas" }).click();
    await page.getByLabel("Arquivo do relatório").setInputFiles(RELATORIO);

    await expect(page.getByText("2 de 3 planos prontos para importar")).toBeVisible();
    await expect(page.getByText("Status “Cancelado” no sistema anterior")).toBeVisible();
    // Ligações sugeridas a partir do nome no sistema anterior.
    await expect(
      page.getByLabel("Procedimento de Ultraformer MPT - Terço Inferior Face (1 sessao) à vista"),
    ).toHaveValue(/.+/);
    await expect(
      page.getByLabel("Região de Ultraformer MPT - Terço Inferior Face (1 sessao) à vista"),
    ).toContainText("Terço inferior");
    await page
      .getByLabel("Usuário de Vendedora Ficticia E2E")
      .selectOption({ label: "Gestão E2E · gestao" });
    await expect(page.getByText("1 sessão(ões) destes planos já estão agendadas")).toBeVisible();

    await page.getByRole("button", { name: "Importar 2 planos" }).click();
    await expect(page.getByText("3 venda(s) importada(s)")).toBeVisible();
    expect(await vendasImportadasDoE2E()).toEqual([
      "Ultraformer MPT Terço inferior 1390 pago",
      "Retorno de toxina - 0 sem-lancamento",
      "Toxina Botulínica 50 UI - 1175.3 pago",
    ]);

    // O mesmo arquivo de novo: tudo aparece como já importado.
    await page.getByRole("button", { name: "Trocar arquivo" }).click();
    await page.getByLabel("Arquivo do relatório").setInputFiles(RELATORIO);
    await expect(page.getByText("0 de 3 planos prontos para importar")).toBeVisible();
    await expect(page.getByText("Já importado")).toHaveCount(2);
  });

  test("recepção não importa vendas", async ({ page }) => {
    await entrar(page, m.email, m.senha);
    await page.goto("/pacientes");
    await expect(page.getByRole("link", { name: "Importar vendas" })).toHaveCount(0);
    await page.goto("/pacientes/importar-vendas");
    await expect(page.getByText("Só administração e gestão importam vendas.")).toBeVisible();
  });
});
