import { expect, test, type Page } from "@playwright/test";
import {
  DIA,
  agendamentosDoPaciente,
  recusasDoProcedimento,
  auditoriaDoUsuario,
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
    // Erro do servidor não apaga o que foi digitado.
    await expect(page.locator("#email")).toHaveValue(m.email);

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

  /** A faixa de 15 min de uma coluna, rolada para a vista: o alvo de clique e arraste. */
  async function faixa(page: Page, coluna: string, hora: string) {
    const slot = page.locator(`[data-coluna="${coluna}"] [data-slot="${hora}"]`);
    await slot.scrollIntoViewIfNeeded();
    return slot;
  }

  test("clicar no horário vazio abre o agendamento já preenchido", async ({ page }) => {
    await entrarComo(page);
    await page.goto(`/agenda?dia=${DIA}`);
    await (await faixa(page, `sala-${m.salaId}`, "10:00")).click();

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
    // Uma hora na grade = distância entre a faixa das 10:00 e a das 11:00,
    // medidas sem rolar entre uma e outra.
    const slot = (h: string) =>
      page.locator(`[data-coluna="sala-${m.salaId}"] [data-slot="${h}"]`).boundingBox();
    const umaHora = (await slot("11:00"))!.y - (await slot("10:00"))!.y;
    // Rola até o bloco e só então mede onde ele está.
    await bloco.scrollIntoViewIfNeeded();
    const caixa = (await bloco.boundingBox())!;
    const x = caixa.x + caixa.width / 2;
    const y = caixa.y + 8;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + umaHora / 2, { steps: 4 });
    await page.mouse.move(x, y + umaHora, { steps: 4 });
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
    await (await faixa(page, `profissional-${a.id}`, "14:00")).click();
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

  test("semana e mês de um profissional só mostram apenas a agenda dele", async ({ page }) => {
    const [a, b] = m.profissionais;
    await entrarComo(page);
    await page.goto(`/agenda?dia=${DIA}&por=profissional`);

    // Período e recurso são escolhas independentes do tipo.
    await page
      .getByRole("navigation", { name: "Período" })
      .getByRole("link", { name: "Semana" })
      .click();
    await page.getByLabel("Escolher profissional").selectOption({ label: b.nome });
    await expect(page).toHaveURL(new RegExp(`periodo=semana.*recurso=profissional%3A${b.id}`));
    const atendimentoDeB = page
      .getByRole("button", { name: /14:00/ })
      .filter({ hasText: m.paciente });
    await expect(atendimentoDeB).toBeVisible();

    await page.getByLabel("Escolher profissional").selectOption({ label: a.nome });
    await expect(page).toHaveURL(new RegExp(`recurso=profissional%3A${a.id}`));
    await expect(atendimentoDeB).toHaveCount(0);

    // No mês o recurso continua escolhido; o dia conta só os atendimentos de B.
    await page.getByLabel("Escolher profissional").selectOption({ label: b.nome });
    await expect(page).toHaveURL(new RegExp(`recurso=profissional%3A${b.id}`));
    await page
      .getByRole("navigation", { name: "Período" })
      .getByRole("link", { name: "Mês" })
      .click();
    await expect(page).toHaveURL(new RegExp(`periodo=mes.*recurso=profissional%3A${b.id}`));
    await expect(page.getByRole("link", { name: `${DIA}: 1 atendimento(s)` })).toBeVisible();
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
    // Uma rolagem só; depois as duas medições, para uma não deslocar a outra.
    await faixa(page, `sala-${m.salaId}`, "13:00");
    const meio = async (h: string) => {
      const c = (await coluna.locator(`[data-slot="${h}"]`).boundingBox())!;
      return { x: c.x + c.width / 2, y: c.y + c.height / 2 };
    };
    const de = await meio("13:00");
    const ate = await meio("14:15");
    await page.mouse.move(de.x, de.y);
    await page.mouse.down();
    await page.mouse.move(ate.x, ate.y, { steps: 6 });
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

  test("painel do atendimento: editar, abrir a ficha e agendar a próxima sessão", async ({
    page,
  }) => {
    await entrarComo(page);
    await page.goto("/agenda?dia=2030-01-09&por=sala");
    await page.getByRole("button", { name: new RegExp(m.pacienteNovo) }).click();
    let painel = page.getByRole("dialog");
    await expect(painel.getByRole("link", { name: "Abrir ficha do paciente" })).toBeVisible();

    // Editar: mesmo formulário do agendamento, já preenchido.
    await painel.getByRole("button", { name: "Editar atendimento" }).click();
    const form = page.getByRole("dialog");
    await expect(form.getByRole("heading", { name: "Editar atendimento" })).toBeVisible();
    await expect(form.locator('input[name="inicio"]')).toHaveValue("2030-01-09T16:00");
    await form.locator('input[name="inicio"]').fill("2030-01-09T10:30");
    await form.locator('textarea[name="observacoes"]').fill("Editado pelo E2E");
    await form.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(form).toBeHidden();
    await expect.poll(() => inicioDoPaciente(m.pacienteNovo)).toBe("2030-01-09 10:30");

    // O painel mostra a observação e leva à ficha.
    await page.getByRole("button", { name: new RegExp(m.pacienteNovo) }).click();
    painel = page.getByRole("dialog");
    await expect(painel).toContainText("Editado pelo E2E");
    await painel.getByRole("link", { name: "Abrir ficha do paciente" }).click();
    await expect(page.getByRole("heading", { level: 1, name: m.pacienteNovo })).toBeVisible();

    // Na ficha, o próximo atendimento abre o mesmo painel, sem o link para a própria ficha.
    await page
      .getByRole("button", { name: new RegExp(m.procedimento) })
      .first()
      .click();
    painel = page.getByRole("dialog");
    await expect(painel.getByRole("link", { name: "Abrir ficha do paciente" })).toHaveCount(0);
    await painel.getByRole("button", { name: "Agendar próxima sessão" }).click();
    const proxima = page.getByRole("dialog");
    await expect(proxima.locator('input[name="inicio"]')).toHaveValue("2030-01-16T10:30");
    await proxima.getByRole("button", { name: "Agendar" }).click();
    await expect(proxima).toBeHidden();
    await expect.poll(() => agendamentosDoPaciente(m.pacienteNovo)).toBe(2);
  });

  test("confirmações da véspera e observação em atendimento já realizado", async ({ page }) => {
    await entrarComo(page);
    await page.goto("/agenda/confirmacoes?dia=2030-01-09");
    const linha = page.getByRole("listitem").filter({ hasText: m.pacienteNovo });
    await linha.getByRole("button", { name: "Confirmado" }).click();
    await expect(linha.getByRole("button", { name: "Desfazer" })).toBeVisible();
    await linha.getByRole("button", { name: "Desfazer" }).click();
    await expect(linha.getByRole("button", { name: "Confirmado" })).toBeVisible();

    // Realizado não se edita por inteiro, mas a observação da sessão sim.
    await page.goto(`/agenda?dia=${DIA}&por=sala`);
    await page.getByRole("button", { name: /09:00/ }).filter({ hasText: m.paciente }).click();
    const painel = page.getByRole("dialog");
    await expect(painel.getByRole("button", { name: "Editar atendimento" })).toHaveCount(0);
    await painel.getByRole("button", { name: "Editar observações" }).click();
    await painel.getByRole("textbox").fill("Sessão sem intercorrências");
    await painel.getByRole("button", { name: "Salvar observações" }).click();
    await expect(painel).toContainText("Sessão sem intercorrências");
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

    // Lista: telefone gravado formatado é achado digitando só os números.
    await page.goto("/pacientes?q=977776666");
    await expect(page.getByRole("link", { name: new RegExp(m.paciente) })).toBeVisible();

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

    // CPF recusado pelo servidor: o formulário mantém o que foi digitado.
    await page.getByRole("button", { name: "Novo paciente" }).click();
    dialogo = page.getByRole("dialog");
    await dialogo.locator('input[name="nome"]').fill("Paciente Que Não Deve Ser Salvo");
    await dialogo.locator('input[name="telefone"]').fill("(11) 91234-5678");
    await dialogo.locator('input[name="cpf"]').fill("111.111.111-11");
    await dialogo.getByRole("button", { name: "Salvar paciente" }).click();
    await expect(dialogo.getByText(/CPF inválido/)).toBeVisible();
    await expect(dialogo.locator('input[name="nome"]')).toHaveValue("Paciente Que Não Deve Ser Salvo");
    await expect(dialogo.locator('input[name="telefone"]')).toHaveValue("(11) 91234-5678");
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

    // Capturas para revisão visual (test-results fica fora do git).
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const tema of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: tema });
      await page.goto(`/agenda?dia=${DIA}&por=sala`);
      await page.screenshot({ path: `test-results/agenda-dia-${tema}.png` });
      await page.goto(`/agenda?dia=${DIA}&por=semana&recurso=sala:${m.salaId}`);
      await page.screenshot({ path: `test-results/agenda-semana-${tema}.png` });
      await page.goto(`/agenda?dia=${DIA}&por=mes`);
      await page.screenshot({ path: `test-results/agenda-mes-${tema}.png` });
    }
  });

  test("exportação CSV e XLSX, auditoria registrada e sessão expirada", async ({
    page,
    playwright,
  }) => {
    await entrar(page, m.financeiro.email, m.financeiro.senha);

    // RF-102 · CSV em português e XLSX de verdade, com a sessão de quem pede.
    const csv = await page.request.get("/api/exportar/cobrancas?ver=pagas&formato=csv");
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    expect(await csv.text()).toContain("Paciente;Cobrança;Vencimento;Valor");

    const xlsx = await page.request.get(
      "/api/exportar/ocupacao?por=sala&de=2030-01-01&ate=2030-01-14&formato=xlsx",
    );
    expect(xlsx.status()).toBe(200);
    expect(xlsx.headers()["content-disposition"]).toContain(".xlsx");
    // XLSX é um zip: começa com "PK".
    expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");

    const anonimo = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
    // Sem sessão, o proxy manda para o login antes de chegar à exportação.
    const semLogin = await anonimo.get("/api/exportar/cobrancas?formato=csv", { maxRedirects: 0 });
    expect(semLogin.status()).toBe(307);
    expect(semLogin.headers()["location"]).toContain("/login");
    await anonimo.dispose();

    // RF-78 · o conflito e o bloqueio dos testes anteriores viraram recusas registradas.
    expect(await recusasDoProcedimento(m.procedimentoId)).toBeGreaterThan(0);

    // RF-06 · o que a recepção fez pela tela ficou registrado.
    expect(await auditoriaDoUsuario(m.usuarioId)).toBeGreaterThan(0);

    // RF-05 · 9 h sem atividade: a sessão cai e o login avisa o porquê.
    await page.context().addCookies([
      {
        name: "hd_ultima_atividade",
        value: String(Date.now() - 9 * 60 * 60 * 1000),
        domain: "localhost",
        path: "/",
      },
    ]);
    await page.goto("/agenda");
    await expect(page).toHaveURL(/\/login\?.*expirada=1/);
    await expect(page.getByText("depois de 8 horas sem uso")).toBeVisible();
  });
});
