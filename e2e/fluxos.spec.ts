import { expect, test, type Page } from "@playwright/test";
import {
  DIA,
  agendamentosDoPaciente,
  statusDasComissoes,
  cobrancasDePacote,
  inicioDoPaciente,
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

  test("arrastar no horário vazio escolhe o intervalo, como no Google Calendar", async ({
    page,
  }) => {
    await entrarComo(page);
    await page.goto(`/agenda?dia=${DIA}`);
    const coluna = page.locator(`[data-coluna="sala-${m.salaId}"]`);
    await coluna.scrollIntoViewIfNeeded();
    const caixa = (await coluna.boundingBox())!;
    const x = caixa.x + caixa.width / 2;
    await page.mouse.move(x, caixa.y + 5 * PX_HORA + 5); // 13:00
    await page.mouse.down();
    await page.mouse.move(x, caixa.y + 6 * PX_HORA + 20, { steps: 6 }); // faixa das 14:15
    await expect(coluna).toContainText("13:00 – 14:30");
    await page.mouse.up();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo.locator('input[name="inicio"]')).toHaveValue(`${DIA}T13:00`);
    await expect(dialogo).toContainText("Marcado na agenda: 13:00–14:30");
    await expect(dialogo.locator('select[name="sala_id"]')).toHaveValue(m.salaId);
  });

  test("na semana, arrastar para outro dia reagenda; dia bloqueado recusa", async ({ page }) => {
    await entrarComo(page);
    await page.goto(`/agenda?dia=${DIA}&por=semana&recurso=sala:${m.salaId}`);
    const bloco = page.getByRole("button", { name: /16:00/ }).filter({ hasText: m.pacienteNovo });
    await bloco.scrollIntoViewIfNeeded();

    const larguraDia =
      (await page.locator('[data-coluna="2030-01-08"]').boundingBox())!.x -
      (await page.locator(`[data-coluna="${DIA}"]`).boundingBox())!.x;

    const arrastarDias = async (n: number) => {
      const c = (await bloco.boundingBox())!;
      const x = c.x + c.width / 2;
      const y = c.y + 8;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + (larguraDia * n) / 2, y, { steps: 4 });
      await page.mouse.move(x + larguraDia * n, y, { steps: 4 });
      await page.mouse.up();
    };

    // Terça está bloqueada pelo teste de configurações: volta e explica.
    await arrastarDias(1);
    // Filtra pelo texto: o Next tem o próprio role=alert (anunciador de rota).
    await expect(page.getByRole("alert").filter({ hasText: "bloqueado" })).toBeVisible();
    expect(await inicioDoPaciente(m.pacienteNovo)).toBe(`${DIA} 16:00`);

    // Quarta está livre.
    await arrastarDias(2);
    await expect.poll(() => inicioDoPaciente(m.pacienteNovo)).toBe("2030-01-09 16:00");
  });

  test("caixa: vender pacote em 3 parcelas e receber parte de uma", async ({ page }) => {
    await entrarComo(page);
    await page.goto(`/pacientes/${m.pacienteId}`);
    await page.getByRole("button", { name: "Vender pacote" }).click();
    const venda = page.getByRole("dialog");
    await venda.locator('select[name="procedimento_id"]').selectOption(m.procedimentoId);
    await venda.locator('input[name="quantidade_sessoes"]').fill("3");
    await venda.locator('input[name="valor_total"]').fill("900");
    await venda.locator('input[name="parcelas"]').fill("3");
    await expect(venda).toContainText("3× de R$");
    await venda.getByRole("button", { name: "Vender pacote" }).click();
    await expect(venda).toBeHidden();
    expect(await cobrancasDePacote(m)).toEqual([
      "300.00 pago",
      "300.00 pendente",
      "300.00 pendente",
    ]);

    // Na tela de Recebimentos, recebe R$ 100 da 2ª parcela.
    await page.goto("/recebimentos?ver=abertas");
    const linha = page.getByRole("row", { name: new RegExp(`${m.paciente}.*2/3`) });
    await linha.getByRole("button", { name: "Receber" }).click();
    const receber = page.getByRole("dialog");
    await receber.locator('input[name="valor"]').fill("100");
    await expect(receber).toContainText("continuam em aberto");
    await receber.getByRole("button", { name: "Registrar recebimento" }).click();
    await expect(receber).toBeHidden();
    await expect
      .poll(() => cobrancasDePacote(m))
      .toEqual(["300.00 pago", "100.00 pago", "200.00 pendente", "300.00 pendente"]);
  });

  test("formulário aplica as regras: aparelho, sala travada, habilitação e horário livre", async ({
    page,
  }) => {
    const [a, b] = m.profissionais;
    await entrarComo(page);
    await page.goto(`/agenda?dia=${DIA}`);
    await page.getByRole("button", { name: "Novo agendamento" }).click();
    const dialogo = page.getByRole("dialog");

    await dialogo.locator('select[name="procedimento_id"]').selectOption(m.procedimentoFixoId);

    // RF-44: o aparelho exigido vem marcado. RF-45: ele é fixo, então a sala trava.
    await expect(dialogo.locator(`input[name="equipamentos"][value="${m.equipamentoFixoId}"]`)).toBeChecked();
    await expect(dialogo.locator('select[name="sala_id"]')).toBeDisabled();
    await expect(dialogo.locator('select[name="sala_id"]')).toHaveValue(m.salaId);
    await expect(dialogo).toContainText("fixo nesta sala");

    // RF-23a: só a A é habilitada neste procedimento.
    await expect(dialogo.getByText(a.nome)).toBeVisible();
    await expect(dialogo.getByText(b.nome)).toHaveCount(0);

    // RF-48: buscar horário livre e escolher o primeiro.
    await dialogo.getByRole("button", { name: "Buscar horário livre" }).click();
    const primeiro = dialogo.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first();
    await expect(primeiro).toBeVisible();
    const hora = (await primeiro.textContent())!.trim();
    await primeiro.click();
    await expect(dialogo.locator('input[name="inicio"]')).toHaveValue(new RegExp(`T${hora}$`));
  });

  test("ficha: editar, consentimento LGPD, homônimo, inativar e reativar", async ({ page }) => {
    await entrarComo(page);
    await page.goto(`/pacientes/${m.pacienteId}`);
    await expect(page.getByText("Consentimento LGPD pendente")).toBeVisible();

    // RF-14 · edição da ficha com consentimento posterior.
    await page.getByRole("button", { name: "Editar dados" }).click();
    let dialogo = page.getByRole("dialog");
    await dialogo.locator('input[name="telefone"]').fill("11 97777-6666");
    await dialogo.locator('input[name="data_nascimento"]').fill("1990-05-10");
    await dialogo.locator('input[name="consentimento_lgpd"]').check();
    await dialogo.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.getByText("11 97777-6666")).toBeVisible();
    await expect(page.getByText("Consentimento LGPD pendente")).toHaveCount(0);

    // RF-11 · mesmo nome e nascimento: avisa antes de duplicar.
    await page.goto("/pacientes");
    await page.getByRole("button", { name: "Novo paciente" }).click();
    dialogo = page.getByRole("dialog");
    await dialogo.locator('input[name="nome"]').fill(m.paciente);
    await dialogo.locator('input[name="data_nascimento"]').fill("1990-05-10");
    await dialogo.getByRole("button", { name: "Salvar paciente" }).click();
    await expect(dialogo).toContainText("com esta data de nascimento");
    await expect(dialogo.getByRole("link", { name: m.paciente })).toBeVisible();
    await dialogo.getByRole("button", { name: "Cancelar" }).click();

    // RF-15 · inativar e reativar.
    await page.goto(`/pacientes/${m.pacienteId}`);
    await page.getByRole("button", { name: "Inativar" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Inativar paciente" }).click();
    await expect(page.getByText("Inativo", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Reativar" }).click();
    await expect(page.getByText("Inativo", { exact: true })).toHaveCount(0);
  });

  test("comissões: realizar, fechar a competência e pagar", async ({ page }) => {
    const [, b] = m.profissionais;
    await entrarComo(page);
    // O atendimento das 14:00 ficou com a profissional B (teste de arrastar).
    await page.goto(`/agenda?dia=${DIA}&por=profissional`);
    const bloco = page
      .locator(`[data-coluna="profissional-${b.id}"]`)
      .getByRole("button", { name: /14:00/ });
    await bloco.scrollIntoViewIfNeeded();
    await bloco.click();
    await page.getByRole("dialog").getByRole("button", { name: "Realizado" }).click();
    await expect.poll(() => statusDasComissoes(m)).toContain("prevista 35.00");

    await page.context().clearCookies();
    await entrar(page, m.financeiro.email, m.financeiro.senha);
    await page.goto("/comissoes?competencia=2030-01");
    await expect(page.getByText(b.nome)).toBeVisible();
    await page.getByRole("button", { name: "Fechar competência" }).click();
    await expect.poll(() => statusDasComissoes(m)).toContain("apurada 35.00");
    await page.getByRole("button", { name: "Registrar pagamento" }).click();
    await expect.poll(() => statusDasComissoes(m)).toContain("paga 35.00");
  });

  test("despesa recorrente é lançada no mês seguinte com um clique", async ({ page }) => {
    await entrar(page, m.financeiro.email, m.financeiro.senha);
    await page.goto("/configuracoes/despesas?competencia=2030-01");
    await page.getByRole("button", { name: "Nova despesa" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.locator('input[name="descricao"]').fill("TESTE E2E aluguel");
    await dialogo.locator('input[name="valor"]').fill("1000");
    await dialogo.locator('input[name="recorrente"]').check();
    await dialogo.getByRole("button", { name: /Lançar|Salvar/ }).click();
    await expect(dialogo).toBeHidden();

    await page.goto("/configuracoes/despesas?competencia=2030-02");
    await page.getByRole("button", { name: "Lançar 1 recorrente(s)" }).click();
    await expect(page.getByRole("cell", { name: "TESTE E2E aluguel" })).toBeVisible();
  });

  test("painel: série por dia, números clicáveis, atalhos e visão mês", async ({ page }) => {
    await entrarComo(page);
    await page.goto("/?por=sala&de=2030-01-01&ate=2030-01-14");
    await expect(page.getByText("Ocupação efetiva por dia")).toBeVisible();
    await page.screenshot({ path: "test-results/painel-serie.png", fullPage: true });

    // RF-77 · o cartão leva à lista que o compõe.
    await page.getByRole("link", { name: /Ocupação efetiva/ }).first().click();
    await expect(page).toHaveURL(/\/relatorios\/atendimentos\?.*status=realizado/);
    await expect(page.getByRole("link", { name: m.paciente }).first()).toBeVisible();

    // RF-72 · atalho de período.
    await page.goto("/relatorios/ocupacao");
    await page.getByRole("link", { name: "Este mês" }).click();
    await expect(page).toHaveURL(/de=\d{4}-\d{2}-01/);
    await expect(page.getByText("Faltas e cancelamentos")).toBeVisible();

    // RF-40 · visão mês: o dia com atendimentos leva à visão do dia.
    await page.goto(`/agenda?dia=${DIA}&por=mes`);
    const celula = page.getByRole("link", { name: new RegExp(`^${DIA}: [1-9]`) });
    await expect(celula).toContainText("atendimento(s)");
    await celula.click();
    await expect(page).toHaveURL(new RegExp(`dia=${DIA}&por=sala`));
  });
});
