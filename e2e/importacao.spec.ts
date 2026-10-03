import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { lerMassa } from "./massa";
import { entrar } from "./acoes";

function gerarCpf(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const digito = (nums: number[]) => {
    const resto = (nums.reduce((t, n, i) => t + n * (nums.length + 1 - i), 0) * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = digito(base);
  return [...base, d1, digito([...base, d1])].join("");
}

test.describe.serial("importação de pacientes", () => {
  const m = lerMassa();
  const cpfA = gerarCpf();
  const linhas = [
    ["Paciente", "CPF", "Celular", "E-mail", "Dt. Nasc."],
    [`${m.paciente} Importado A`, cpfA, "11987650001", "a@exemplo.com", "14/03/1988"],
    [m.paciente, "", "", "", ""], // já existe no cadastro (só nome)
    [`${m.paciente} Importado A repetido`, cpfA, "", "", ""], // mesmo CPF da linha 2
    [`${m.paciente} CPF ruim`, "111.111.111-11", "", "", ""],
    [`${m.paciente} Importado B`, "", "(11) 3333-4444", "email-ruim", "31/02/1990"],
  ];

  async function enviar(page: Page, nome: string, conteudo: Buffer, tipo: string) {
    await page.goto("/pacientes/importar");
    await page
      .getByLabel("Planilha de pacientes")
      .setInputFiles({ name: nome, mimeType: tipo, buffer: conteudo });
    await expect(page.getByRole("heading", { name: "Qual coluna é cada dado?" })).toBeVisible();
    await page.screenshot({ path: `test-results/importar-colunas-${nome}.png`, fullPage: true });
    // Colunas reconhecidas pelo nome do cabeçalho.
    await expect(page.getByLabel("Coluna de Nome")).toHaveValue("0");
    await expect(page.getByLabel("Coluna de Telefone")).toHaveValue("2");
    await expect(page.getByLabel("Coluna de Nascimento")).toHaveValue("4");
    await page.getByRole("button", { name: "Revisar importação" }).click();
  }

  const contador = (page: Page, rotulo: string) =>
    page.locator(".cartao").filter({ hasText: rotulo }).locator("p").nth(1);

  test("CSV: revisa, pula o que não pode e importa o resto", async ({ page }) => {
    await entrar(page, m.email, m.senha);
    const csv = Buffer.from("﻿" + linhas.map((l) => l.join(";")).join("\r\n"), "utf8");
    await enviar(page, "pacientes.csv", csv, "text/csv");

    await expect(contador(page, "Prontos para importar")).toHaveText("2");
    await expect(contador(page, "Já cadastrados")).toHaveText("1");
    await expect(contador(page, "Repetidos na planilha")).toHaveText("1");
    await expect(contador(page, "Com erro")).toHaveText("1");
    await page.getByRole("button", { name: /Entram com ajuste/ }).click();
    await expect(page.getByText(/E-mail descartado/)).toBeVisible();
    await page.screenshot({ path: "test-results/importar-revisao.png", fullPage: true });

    await page.getByRole("button", { name: "Importar 2 paciente(s)" }).click();
    await expect(page.getByRole("heading", { name: "2 paciente(s) importado(s)" })).toBeVisible();

    await page.goto(`/pacientes?q=${encodeURIComponent(`${m.paciente} Importado A`)}`);
    await expect(page.getByText("(11) 98765-0001")).toBeVisible();
  });

  test("Excel com os mesmos dados: ninguém é importado de novo", async ({ page }) => {
    await entrar(page, m.email, m.senha);
    const livro = new ExcelJS.Workbook();
    livro.addWorksheet("Pacientes").addRows(linhas);
    const xlsx = Buffer.from(await livro.xlsx.writeBuffer());
    await enviar(
      page,
      "pacientes.xlsx",
      xlsx,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    await expect(contador(page, "Prontos para importar")).toHaveText("0");
    await expect(contador(page, "Já cadastrados")).toHaveText("3");
    await expect(page.getByRole("button", { name: "Importar 0 paciente(s)" })).toBeDisabled();
  });
});
