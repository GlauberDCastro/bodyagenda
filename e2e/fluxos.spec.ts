import { expect, test, type Page } from "@playwright/test";
import {
  DIA,
  agendamentosDoPaciente,
  iniciosDosAgendamentos,
  lerMassa,
  profissionaisNoHorario,
  statusDoAgendamento,
} from "./massa";
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

  // Grade das 08:00 com 56 px por hora: 10:00 fica 112 px abaixo do topo.
  const PX_HORA = 56;

  test("clicar no horário vazio abre o agendamento já preenchido", async ({ page }) => {
    await entrarComo(page);
    await page.goto(`/agenda?dia=${DIA}`);
    const coluna = page.locator(`[data-coluna="sala-${m.salaId}"]`);
    await coluna.scrollIntoViewIfNeeded();
    await coluna.click({ position: { x: 80, y: 2 * PX_HORA + 5 } });

    const dialogo = page.getByRole("dialog");
    await expect(dialogo.locator('input[name="inicio"]')).toHaveValue(`${DIA}T10:00`);
    await expect(dialogo.locator('select[name="sala_id"]')).toHaveValue(m.salaId);

    await dialogo.getByPlaceholder("Digite o nome para buscar…").fill(m.paciente);
    await dialogo.locator('select[name="paciente_id"]').selectOption({ label: m.paciente });
    await dialogo
      .locator('select[name="procedimento_id"]')
      .selectOption({ label: `${m.procedimento} — 30 min` });
    await dialogo.getByRole("button", { name: "Agendar" }).click();
    await expect(dialogo).toBeHidden();
    expect(await iniciosDosAgendamentos(m)).toEqual(["09:00", "10:00"]);
  });

  test("arrastar o atendimento remarca para o novo horário", async ({ page }) => {
    await entrarComo(page);
    await page.goto(`/agenda?dia=${DIA}`);
    const bloco = page.getByRole("button", { name: /10:00/ }).filter({ hasText: m.paciente });
    await bloco.scrollIntoViewIfNeeded();
    const caixa = (await bloco.boundingBox())!;
    const x = caixa.x + caixa.width / 2;
    const y = caixa.y + 8;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + PX_HORA / 2, { steps: 4 });
    await page.mouse.move(x, y + PX_HORA, { steps: 4 });
    await page.mouse.up();

    await expect.poll(() => iniciosDosAgendamentos(m)).toEqual(["09:00", "11:00"]);
    await expect(
      page.getByRole("button", { name: /11:00/ }).filter({ hasText: m.paciente }),
    ).toBeVisible();
  });

  test("arrastar para outra coluna na visão por profissionais troca o profissional", async ({
    page,
  }) => {
    const [a, b] = m.profissionais;
    await entrarComo(page);
    await page.goto(`/agenda?dia=${DIA}&por=profissional`);

    // Clique na coluna do A às 14:00 já traz o A marcado.
    const colunaA = page.locator(`[data-coluna="profissional-${a.id}"]`);
    await colunaA.scrollIntoViewIfNeeded();
    await colunaA.click({ position: { x: 80, y: 6 * PX_HORA + 5 } });
    const dialogo = page.getByRole("dialog");
    await dialogo.getByPlaceholder("Digite o nome para buscar…").fill(m.paciente);
    await dialogo.locator('select[name="paciente_id"]').selectOption({ label: m.paciente });
    await dialogo
      .locator('select[name="procedimento_id"]')
      .selectOption({ label: `${m.procedimento} — 30 min` });
    await dialogo.locator('select[name="sala_id"]').selectOption({ label: m.sala });
    await dialogo.getByRole("button", { name: "Agendar" }).click();
    await expect(dialogo).toBeHidden();
    expect(await profissionaisNoHorario(m, "14:00")).toEqual([a.nome]);

    // Arrasta da coluna do A para a do B, mesmo horário.
    const bloco = colunaA.getByRole("button", { name: /14:00/ });
    const caixa = (await bloco.boundingBox())!;
    const colunaB = (await page.locator(`[data-coluna="profissional-${b.id}"]`).boundingBox())!;
    const dx = colunaB.x - (await colunaA.boundingBox())!.x;
    const x = caixa.x + caixa.width / 2;
    const y = caixa.y + 8;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y, { steps: 4 });
    await page.mouse.move(x + dx, y, { steps: 4 });
    await page.mouse.up();

    await expect.poll(() => profissionaisNoHorario(m, "14:00")).toEqual([b.nome]);
  });

  test("paciente que não existe é cadastrado sem sair do agendamento", async ({ page }) => {
    await entrarComo(page);
    await page.goto(`/agenda?dia=${DIA}`);
    await page.getByRole("button", { name: "Novo agendamento" }).click();
    const dialogo = page.getByRole("dialog");

    await dialogo.getByPlaceholder("Digite o nome para buscar…").fill(m.pacienteNovo);
    await dialogo.getByRole("button", { name: `+ Cadastrar “${m.pacienteNovo}”` }).click();
    await dialogo.getByPlaceholder("(11) 90000-0000").fill("11 98888-7777");
    await dialogo.getByRole("button", { name: "Cadastrar e usar" }).click();
    await expect(dialogo.locator('select[name="paciente_id"]')).toContainText(m.pacienteNovo);

    await dialogo
      .locator('select[name="procedimento_id"]')
      .selectOption({ label: `${m.procedimento} — 30 min` });
    await dialogo.locator('input[name="inicio"]').fill(`${DIA}T16:00`);
    await dialogo.locator('select[name="sala_id"]').selectOption({ label: m.sala });
    await dialogo.getByRole("button", { name: "Agendar" }).click();
    await expect(dialogo).toBeHidden();
    expect(await agendamentosDoPaciente(m.pacienteNovo)).toBe(1);
  });
});
