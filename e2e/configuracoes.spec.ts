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

  test("horário com duas faixas no dia (pausa de almoço)", async ({ page }) => {
    await entrar(page, m.gestao.email, m.gestao.senha);
    await page.goto("/configuracoes/horarios");
    await page.getByRole("button", { name: `Editar horário de ${m.sala}` }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Fim Qui", { exact: true }).fill("12:00");
    // "+ faixa" de quinta: Seg, Ter, Qua e Qui estão abertos, então é o 4º.
    await dialogo.getByRole("button", { name: "+ faixa" }).nth(3).click();
    await dialogo.getByLabel("Início Qui faixa 2").fill("13:00");
    await dialogo.getByLabel("Fim Qui faixa 2").fill("18:00");
    await dialogo.getByRole("button", { name: "Salvar horário" }).click();
    await expect(dialogo).toBeHidden();
    // .first(): a sala também aparece na tabela de bloqueios, mais abaixo.
    await expect(page.getByRole("row", { name: new RegExp(m.sala) }).first()).toContainText(
      "Qui 08:00–12:00, 13:00–18:00",
    );
  });

  test("duplicar sala copia o horário", async ({ page }) => {
    await entrar(page, m.gestao.email, m.gestao.senha);
    await page.goto("/configuracoes/salas");
    await page.getByRole("button", { name: "Duplicar" }).last().click();
    // A sala de teste é a de número mais alto: a cópia vira a última linha.
    await expect(page.getByText(`${m.procedimento} (cópia)`)).toBeVisible();
    await page.goto("/configuracoes/horarios");
    await expect(
      page.getByRole("row", { name: new RegExp(`${m.procedimento} \\(cópia\\)`) }).first(),
    ).toContainText("Qui 08:00–12:00, 13:00–18:00");
  });

  test("procedimento: editar valor, inativar e reativar", async ({ page }) => {
    await entrar(page, m.gestao.email, m.gestao.senha);
    await page.goto(`/configuracoes/procedimentos/${m.procedimentoId}`);
    await page.getByRole("button", { name: "Editar" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.locator('input[name="valor_sessao"]').fill("350");
    await dialogo.getByRole("button", { name: "Salvar procedimento" }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.getByText("R$ 350,00 por sessão")).toBeVisible();

    await page.getByRole("button", { name: "Inativar" }).click();
    await expect(page.getByText("Inativo", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Reativar" }).click();
    await expect(page.getByText("Ativo", { exact: true })).toBeVisible();
  });
});
