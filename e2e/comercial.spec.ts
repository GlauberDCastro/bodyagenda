import { expect, test } from "@playwright/test";
import { apagarAtendimentosDe, lerMassa, origensNoDia } from "./massa";
import { agendar, entrar } from "./acoes";

/** Segunda livre, longe dos dias usados pelos outros testes. */
const DIA = "2030-01-14";

test.describe.serial("comercial, avaliação inicial e upsell", () => {
  const m = lerMassa();
  // Usa o mesmo procedimento de teste dos fluxos: limpa ao sair para não
  // somar atendimentos nas contagens deles.
  test.afterAll(() => apagarAtendimentosDe(m.pacienteComercial));
  const bloco09 = (page: import("@playwright/test").Page) =>
    page.getByRole("button", { name: /09:00/ }).filter({ hasText: m.pacienteComercial });

  test("SDR agenda direto: atendimento sai como comercial e marcado 1ª vez", async ({ page }) => {
    await entrar(page, m.sdr.email, m.sdr.senha);
    const dialogo = await agendar(page, m, DIA, m.pacienteComercial);
    await expect(dialogo).toBeHidden();
    await expect
      .poll(() => origensNoDia(m.pacienteComercial, DIA))
      .toEqual(["09:00 comercial sdr"]);

    await expect(bloco09(page)).toContainText("Comercial");
    await expect(bloco09(page)).toContainText("1ª vez");
    await bloco09(page).click();
    await expect(page.getByRole("dialog")).toContainText("Primeira vez, sem avaliação inicial");
    await expect(page.getByRole("dialog")).toContainText("vendido por SDR E2E");
    await page.screenshot({ path: "test-results/comercial-painel.png", fullPage: true });
  });

  test("upsell para fazer agora: atendimento colado, ligado à origem", async ({ page }) => {
    await entrar(page, m.email, m.senha);
    await page.goto(`/agenda?dia=${DIA}&por=sala`);
    await bloco09(page).click();
    await page.getByRole("dialog").getByRole("button", { name: "Upsell: fazer agora" }).click();

    const form = page.getByRole("dialog");
    await expect(form.getByRole("heading", { name: "Registrar upsell" })).toBeVisible();
    await expect(form.locator('input[name="inicio"]')).toHaveValue(`${DIA}T09:30`);
    await page.screenshot({ path: "test-results/comercial-upsell.png" });
    await form
      .locator('select[name="procedimento_id"]')
      .selectOption({ label: `${m.procedimento} — 30 min` });
    await form.getByRole("button", { name: "Agendar upsell" }).click();
    await expect(form).toBeHidden();
    await expect
      .poll(() => origensNoDia(m.pacienteComercial, DIA))
      .toEqual(["09:00 comercial sdr", "09:30 upsell recepcao com-origem"]);
  });

  test("avaliação inicial é gratuita e, feita, tira a marca de 1ª vez", async ({ page }) => {
    await entrar(page, m.email, m.senha);
    await page.goto(`/agenda?dia=${DIA}&por=sala`);
    await page.getByRole("button", { name: "Novo agendamento" }).click();
    const form = page.getByRole("dialog");
    await form.getByPlaceholder("Digite o nome para buscar…").fill(m.pacienteComercial);
    await form.locator('select[name="paciente_id"]').selectOption({ label: m.pacienteComercial });
    await form
      .locator('select[name="procedimento_id"]')
      .selectOption({ label: "Avaliação inicial — 30 min" });
    await expect(form.getByText("Avaliação inicial: sem cobrança.")).toBeVisible();
    await form.locator('input[name="valor_avulso"]').fill("0");
    await form.locator('input[name="inicio"]').fill(`${DIA}T11:00`);
    await form.locator('select[name="sala_id"]').selectOption({ label: m.sala });
    await form.getByRole("button", { name: "Agendar" }).click();
    await expect(form).toBeHidden();

    await page
      .getByRole("button", { name: /11:00/ })
      .filter({ hasText: m.pacienteComercial })
      .click();
    await page.getByRole("dialog").getByRole("button", { name: "Realizado" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.reload();
    await expect(bloco09(page)).toContainText("Comercial");
    await expect(bloco09(page)).not.toContainText("1ª vez");
  });
});
