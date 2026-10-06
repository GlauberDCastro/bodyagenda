import { expect, test } from "@playwright/test";
import { lerMassa } from "./massa";
import { entrar } from "./acoes";

test("marca de atividade antiga não derruba o login novo", async ({ page, context }) => {
  const m = lerMassa();
  // Navegador que ficou com a marca de uma sessão expirada há 9 h.
  await context.addCookies([
    {
      name: "hd_ultima_atividade",
      value: String(Date.now() - 9 * 3600_000),
      url: "http://localhost:3100",
    },
  ]);
  await entrar(page, m.email, m.senha);
  await page.goto("/agenda");
  await expect(page).toHaveURL(/\/agenda/);
  await expect(page.locator("#email")).toHaveCount(0);
});
