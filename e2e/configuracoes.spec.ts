import { expect, test } from "@playwright/test";
import { horarioDaSala, lerMassa } from "./massa";
import { agendar, entrar } from "./acoes";

/** Terça seguinte ao DIA dos fluxos: o bloqueio não interfere neles. */
const DIA_BLOQUEADO = "2030-01-08";

test.describe.serial("configurações", () => {
  const m = lerMassa();

  test("uma entrada só na barra lateral, com todas as abas", async ({ page }) => {
    await entrar(page, m.gestao.email, m.gestao.senha);
    await page.getByRole("link", { name: "Configurações" }).click();
    await expect(page).toHaveURL(/\/configuracoes\/salas$/);
    await expect(page.getByRole("link", { name: "Salas", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    for (const aba of ["Horários e bloqueios", "Despesas fixas", "Usuários"]) {
      await expect(page.getByRole("link", { name: aba })).toBeVisible();
    }
  });

  test("endereço antigo das despesas leva à aba nova", async ({ page }) => {
    await entrar(page, m.gestao.email, m.gestao.senha);
    await page.goto("/financeiro/despesas");
    await expect(page).toHaveURL(/\/configuracoes\/despesas/);
  });

  test("horário próprio de um recurso: abre também no sábado", async ({ page }) => {
    await entrar(page, m.gestao.email, m.gestao.senha);
    await page.goto("/configuracoes/horarios");
    await page.getByRole("button", { name: `Editar horário de ${m.sala}` }).click();

    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Atende Sáb").check();
    await dialogo.getByLabel("Fim Sáb").fill("12:00");
    await dialogo.getByRole("button", { name: "Salvar horário" }).click();
    await expect(dialogo).toBeHidden();

    const linha = page.getByRole("row", { name: new RegExp(m.sala) });
    await expect(linha).toContainText("Seg–Sex 08:00–18:00 · Sáb 08:00–12:00");
    await expect(linha).toContainText("Próprio");
    expect(await horarioDaSala(m)).toContain("6 08:00:00-12:00:00");
  });

  test("bloqueio impede agendar no período", async ({ page }) => {
    await entrar(page, m.gestao.email, m.gestao.senha);
    await page.goto("/configuracoes/horarios");
    await page.getByRole("button", { name: "Novo bloqueio" }).click();

    const dialogo = page.getByRole("dialog");
    await dialogo.locator('select[name="recurso_tipo"]').selectOption("sala");
    await dialogo.locator('select[name="recurso_id"]').selectOption({ label: m.sala });
    await dialogo.locator('input[name="inicio"]').fill(`${DIA_BLOQUEADO}T08:00`);
    await dialogo.locator('input[name="fim"]').fill(`${DIA_BLOQUEADO}T18:00`);
    await dialogo.getByRole("button", { name: "Bloquear" }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.getByRole("row", { name: new RegExp(m.sala) }).last()).toContainText(
      "Manutenção",
    );

    // A recepção tenta marcar na sala bloqueada.
    await page.context().clearCookies();
    await entrar(page, m.email, m.senha);
    const agendamento = await agendar(page, m, DIA_BLOQUEADO);
    await expect(agendamento.getByRole("alert")).toContainText("bloqueado");
  });
});
