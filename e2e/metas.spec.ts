import { expect, test } from "@playwright/test";
import { apagarMetasDoMes, lerMassa, metasNoBanco } from "./massa";
import { entrar } from "./acoes";

/** Mês de teste longe do real: as metas da clínica não são tocadas. */
const MES = "2030-01";

test.describe.serial("metas", () => {
  const m = lerMassa();
  test.afterAll(() => apagarMetasDoMes(MES));

  test("gestão define ocupação e cria, edita e exclui meta de venda", async ({ page }) => {
    await entrar(page, m.gestao.email, m.gestao.senha);
    await page.goto(`/configuracoes/metas?mes=${MES}`);
    await expect(page.getByRole("link", { name: "Metas", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await page.getByLabel("Meta de ocupação (%)").fill("20");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("Meta salva.")).toBeVisible();

    await page.getByRole("button", { name: "Nova meta" }).click();
    const modal = page.getByRole("dialog", { name: "Nova meta de venda" });
    await modal.getByLabel("Nome da meta").fill("Meta E2E");
    await modal.getByLabel("Procedimento").selectOption({ label: m.procedimento });
    await modal.getByLabel("Mínimo por dia").fill("0,5");
    await modal.getByRole("button", { name: "Criar meta" }).click();
    await expect(modal).toBeHidden();
    await expect(page.getByRole("cell", { name: "1 a cada 2 dias" })).toBeVisible();

    // Faixa inválida: o formulário mantém o que foi digitado e aponta o campo.
    await page.getByRole("button", { name: "Editar" }).click();
    const edicao = page.getByRole("dialog", { name: "Editar “Meta E2E”" });
    await edicao.getByLabel("Mínimo por dia").fill("4");
    await edicao.getByLabel("Máximo por dia").fill("3");
    await edicao.getByRole("button", { name: "Salvar meta" }).click();
    await expect(edicao.getByText("O máximo não pode ser menor que o mínimo")).toBeVisible();
    await expect(edicao.getByLabel("Mínimo por dia")).toHaveValue("4");

    await edicao.getByLabel("Máximo por dia").fill("5");
    await edicao.getByLabel("O que conta").selectOption("pacote");
    await edicao.getByRole("button", { name: "Salvar meta" }).click();
    await expect(edicao).toBeHidden();
    await expect(page.getByRole("cell", { name: "4 a 5 por dia" })).toBeVisible();
    expect(await metasNoBanco(MES)).toEqual(["Meta E2E pacote 4-5"]);

    await page.getByRole("button", { name: "Excluir" }).click();
    await page.getByRole("button", { name: "Confirmar exclusão" }).click();
    await expect(page.getByText("Nenhuma meta de venda neste mês.")).toBeVisible();
    expect(await metasNoBanco(MES)).toEqual([]);
  });

  test("recepção vê as metas no painel e não edita", async ({ page }) => {
    await entrar(page, m.email, m.senha);
    await expect(page.getByRole("heading", { name: /^Metas de / })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ajustar metas" })).toHaveCount(0);

    await page.goto(`/configuracoes/metas?mes=${MES}`);
    await expect(page.getByLabel("Meta de ocupação (%)")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Nova meta" })).toHaveCount(0);
  });

  test("a central mostra as metas com o atalho de ajuste", async ({ page }) => {
    await entrar(page, m.gestao.email, m.gestao.senha);
    await page.goto("/gestao");
    await expect(page.getByRole("heading", { name: /^Metas de / })).toBeVisible();
    await page.getByRole("link", { name: "Ajustar metas" }).click();
    await expect(page).toHaveURL(/\/configuracoes\/metas\?mes=\d{4}-\d{2}/);
  });
});
