import { expect, test } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { lerMassa } from "./massa";
import { entrar } from "./acoes";

/** CPF com dígitos verificadores válidos, diferente a cada execução. */
function gerarCpf(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const digito = (nums: number[]) => {
    const soma = nums.reduce((t, n, i) => t + n * (nums.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = digito(base);
  const d2 = digito([...base, d1]);
  return [...base, d1, d2].join("");
}

test.describe.serial("convite de profissional", () => {
  const m = lerMassa();
  let link = "";

  test("admin gera o link; só o admin vê o botão", async ({ page }) => {
    // Gestão edita profissionais, mas não cria acesso.
    await entrar(page, m.gestao.email, m.gestao.senha);
    await page.goto("/configuracoes/profissionais");
    const linhaGestao = page.getByRole("row").filter({ hasText: m.profissionalConvite.nome });
    await expect(linhaGestao.getByText("Sem login")).toBeVisible();
    await expect(linhaGestao.getByRole("button", { name: "Convidar" })).toHaveCount(0);

    await page.context().clearCookies();
    await entrar(page, m.admin.email, m.admin.senha);
    await page.goto("/configuracoes/profissionais");
    const linha = page.getByRole("row").filter({ hasText: m.profissionalConvite.nome });
    await linha.getByRole("button", { name: "Convidar" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: "Gerar link de convite" }).click();
    const campo = dialogo.getByLabel("Link do convite");
    await expect(campo).toHaveValue(/\/convite\/[A-Za-z0-9_-]{43}$/);
    link = await campo.inputValue();
    await dialogo.getByRole("button", { name: "Concluir" }).click();
    await expect(linha.getByText(/Convite até/)).toBeVisible();
  });

  test("profissional cria o acesso pelo link e já entra", async ({ browser }) => {
    // Visitante sem sessão nenhuma: contexto novo, sem cookies.
    const contexto = await browser.newContext();
    const page = await contexto.newPage();
    await page.goto(link);
    await expect(page.getByRole("heading", { name: /Bem-vindo/ })).toBeVisible();
    await expect(page.locator('input[name="nome"]')).toHaveValue(m.profissionalConvite.nome);
    // Captura para revisão visual (test-results fica fora do git).
    await page.screenshot({ path: "test-results/convite-formulario.png", fullPage: true });

    const email = `teste-e2e-convite-${randomBytes(3).toString("hex")}@exemplo.invalid`;
    const senha = randomBytes(12).toString("base64url");
    await page.locator('input[name="cpf"]').fill(gerarCpf());
    await page.locator('input[name="telefone"]').fill("(11) 95555-4444");
    await page.locator('input[name="especialidade"]').fill("Biomedicina estética");
    await page.locator('input[name="registro_conselho"]').fill("CRBM 99999");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="senha"]').fill(senha);
    await page.locator('input[name="confirmacao"]').fill(`${senha}x`);
    await page.getByRole("button", { name: "Criar meu acesso" }).click();
    await expect(page.getByText("As senhas não conferem")).toBeVisible();

    await page.locator('input[name="confirmacao"]').fill(senha);
    await page.getByRole("button", { name: "Criar meu acesso" }).click();
    await page.waitForURL((u) => u.pathname === "/");
    await expect(page.getByText("Profissional", { exact: true })).toBeVisible();

    // O mesmo link não serve duas vezes.
    await page.goto(link);
    await expect(page.getByText(/já foi usado|já tem acesso/)).toBeVisible();
    await contexto.close();
  });

  test("admin vê o profissional com acesso e os dados que ele preencheu", async ({ page }) => {
    await entrar(page, m.admin.email, m.admin.senha);
    await page.goto("/configuracoes/profissionais");
    const linha = page.getByRole("row").filter({ hasText: m.profissionalConvite.nome });
    await expect(linha.getByText("Com acesso")).toBeVisible();
    await expect(linha).toContainText("Biomedicina estética");
  });

  test("link inválido explica e leva ao login", async ({ page }) => {
    await page.goto(`/convite/${"x".repeat(43)}`);
    await expect(page.getByText("não é válido")).toBeVisible();
    await expect(page.getByRole("link", { name: "Ir para o login" })).toBeVisible();
  });
});
