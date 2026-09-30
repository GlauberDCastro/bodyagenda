#!/usr/bin/env node
/**
 * Cria o usuário administrador inicial.
 *
 * Usa a service_role porque criar usuário no Auth exige privilégio que o RLS
 * nega a todo mundo — é o único uso legítimo dessa chave (SPEC §5.3).
 *
 * A senha é gerada aleatoriamente e gravada em supabase/.admin-inicial.txt,
 * que está no .gitignore. Ela não é impressa no terminal para não acabar em
 * histórico de shell ou log de CI.
 *
 * Uso:
 *   node scripts/criar-admin.mjs [email]
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

function carregarEnvLocal() {
  const arquivo = join(RAIZ, ".env.local");
  if (!existsSync(arquivo)) return;
  for (const linha of readFileSync(arquivo, "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
carregarEnvLocal();

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2] ?? process.env.ADMIN_EMAIL;

if (!URL_SUPABASE || !SERVICE_ROLE) {
  console.error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.");
  process.exit(1);
}
if (!email) {
  console.error("Informe o e-mail: node scripts/criar-admin.mjs voce@exemplo.com");
  process.exit(1);
}

/** Senha forte sem caracteres ambíguos, para poder ser digitada sem erro. */
function gerarSenha(tamanho = 20) {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%&*";
  const bytes = randomBytes(tamanho);
  return [...bytes].map((b) => alfabeto[b % alfabeto.length]).join("");
}

const senha = gerarSenha();

const criar = await fetch(`${URL_SUPABASE}/auth/v1/admin/users`, {
  method: "POST",
  headers: {
    apikey: SERVICE_ROLE,
    Authorization: `Bearer ${SERVICE_ROLE}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email,
    password: senha,
    email_confirm: true,
  }),
});

const corpo = await criar.json();

if (!criar.ok) {
  // Usuário já existente não é falha: seguimos para garantir a linha em `usuario`.
  if (corpo?.error_code !== "email_exists" && !/already/i.test(corpo?.msg ?? "")) {
    console.error(`Falha ao criar usuario: HTTP ${criar.status}`);
    console.error(JSON.stringify(corpo, null, 2));
    process.exit(1);
  }
  console.log("Usuario ja existe no Auth; apenas garantindo o perfil.");
}

// Descobre o id, seja recém-criado ou pré-existente.
let idUsuario = corpo?.id;
if (!idUsuario) {
  const busca = await fetch(
    `${URL_SUPABASE}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
    { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } },
  );
  const lista = await busca.json();
  idUsuario = lista?.users?.find((u) => u.email === email)?.id;
}

if (!idUsuario) {
  console.error("Nao consegui determinar o id do usuario.");
  process.exit(1);
}

// A linha em `public.usuario` é o que define o perfil. Sem ela, o login
// funciona mas perfil_atual() devolve null e o RLS nega tudo.
const upsert = await fetch(`${URL_SUPABASE}/rest/v1/usuario?on_conflict=id`, {
  method: "POST",
  headers: {
    apikey: SERVICE_ROLE,
    Authorization: `Bearer ${SERVICE_ROLE}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation",
  },
  body: JSON.stringify({
    id: idUsuario,
    nome: email.split("@")[0],
    email,
    perfil: "admin",
    ativo: true,
  }),
});

if (!upsert.ok) {
  console.error(`Falha ao gravar o perfil: HTTP ${upsert.status}`);
  console.error(await upsert.text());
  process.exit(1);
}

const destino = join(RAIZ, "supabase", ".admin-inicial.txt");
writeFileSync(
  destino,
  [
    "Credenciais do administrador inicial — Body Prime",
    "",
    `e-mail: ${email}`,
    `senha:  ${senha}`,
    "",
    "Troque esta senha no primeiro acesso.",
    "Este arquivo esta no .gitignore e nao deve ser versionado nem compartilhado.",
    "",
  ].join("\n"),
  "utf8",
);

console.log(`Perfil admin gravado para ${email}.`);
console.log(`Senha gerada em: supabase/.admin-inicial.txt`);
