#!/usr/bin/env node
/**
 * Prova o RLS pelo caminho REAL da aplicação: PostgREST com o JWT do usuário.
 *
 * Os outros scripts usam conexão direta como `postgres`, que IGNORA RLS por ser
 * dono das tabelas — ótimos para provar as fórmulas, inúteis para provar
 * permissão. Aqui autenticamos de verdade e exercemos a mesma rota que as
 * Server Actions usam.
 *
 * Princípio P2 da spec: a autorização mora no RLS. Se este script passar com
 * a chave anônima escrevendo em algum lugar, a fronteira está furada.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
const ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let passaram = 0;
let falharam = 0;

function checar(rotulo, ok, detalhe = "") {
  if (ok) {
    passaram++;
    console.log(`  PASSOU  ${rotulo}`);
  } else {
    falharam++;
    console.log(`  FALHOU  ${rotulo}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

/** Lê as credenciais do admin geradas por scripts/criar-admin.mjs. */
function credenciaisAdmin() {
  const arquivo = join(RAIZ, "supabase", ".admin-inicial.txt");
  if (!existsSync(arquivo)) return null;
  const texto = readFileSync(arquivo, "utf8");
  return {
    email: texto.match(/^e-mail:\s*(.+)$/m)?.[1]?.trim(),
    senha: texto.match(/^senha:\s*(.+)$/m)?.[1]?.trim(),
  };
}

async function api(caminho, { token, metodo = "GET", corpo } = {}) {
  const r = await fetch(`${URL_SUPABASE}/rest/v1/${caminho}`, {
    method: metodo,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token ?? ANON}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  let dados = null;
  try {
    dados = await r.json();
  } catch {
    /* 204 sem corpo */
  }
  return { status: r.status, ok: r.ok, dados };
}

const cred = credenciaisAdmin();
if (!cred?.email || !cred?.senha) {
  console.error(
    "supabase/.admin-inicial.txt nao encontrado. Rode scripts/criar-admin.mjs primeiro.",
  );
  process.exit(1);
}

// ── Anônimo: nao pode nada ───────────────────────────────────────────────────
console.log("\n-- visitante sem sessao --");

const semSessao = await api("sala?select=id&limit=1");
checar(
  "anon NAO le salas",
  semSessao.dados?.length === 0 || !semSessao.ok,
  `status ${semSessao.status}, ${JSON.stringify(semSessao.dados)?.slice(0, 80)}`,
);

const anonEscreve = await api("paciente", {
  metodo: "POST",
  corpo: { nome: "Invasor" },
});
checar(
  "anon NAO cria paciente",
  !anonEscreve.ok,
  `status ${anonEscreve.status}`,
);

const anonCustos = await api("procedimento_custo?select=id&limit=1");
checar(
  "anon NAO le a tabela de custos",
  anonCustos.dados?.length === 0 || !anonCustos.ok,
  `status ${anonCustos.status}`,
);

// ── Admin autenticado ────────────────────────────────────────────────────────
console.log("\n-- admin autenticado --");

const login = await fetch(`${URL_SUPABASE}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: cred.email, password: cred.senha }),
});
const sessao = await login.json();
const token = sessao.access_token;

checar("login do admin funciona", !!token, `status ${login.status}`);
if (!token) {
  console.log(`\n${passaram} passaram, ${falharam} falharam`);
  process.exit(1);
}

const perfil = await api(`usuario?select=perfil&id=eq.${sessao.user.id}`, { token });
checar(
  "perfil admin gravado em public.usuario",
  perfil.dados?.[0]?.perfil === "admin",
  JSON.stringify(perfil.dados),
);

const salas = await api("sala?select=id,numero&order=numero", { token });
checar("admin le salas", (salas.dados?.length ?? 0) > 0, `${salas.dados?.length} sala(s)`);

const custos = await api("procedimento_custo?select=id&limit=1", { token });
checar("admin alcanca a tabela de custos", custos.ok, `status ${custos.status}`);

// Escrita pelo mesmo caminho da Server Action: insere, confere, remove.
const proc = await api("procedimento?select=id&nome=eq.Fotona", { token });
const procId = proc.dados?.[0]?.id;

const criado = await api("procedimento_custo", {
  token,
  metodo: "POST",
  corpo: {
    procedimento_id: procId,
    tipo: "insumo",
    descricao: "TESTE RLS — remover",
    valor_unitario: 1,
    quantidade: 1,
  },
});
checar("admin CRIA custo via PostgREST sob RLS", criado.ok, `status ${criado.status}`);

const idCriado = criado.dados?.[0]?.id;
if (idCriado) {
  const apagado = await api(`procedimento_custo?id=eq.${idCriado}`, {
    token,
    metodo: "DELETE",
  });
  checar("limpeza: custo de teste removido", apagado.ok, `status ${apagado.status}`);
}

const reserva = await api("reserva", {
  token,
  metodo: "POST",
  corpo: {
    agendamento_id: "00000000-0000-4000-8000-000000000000",
    recurso_tipo: "sala",
    recurso_id: "00000000-0000-4000-8000-000000000000",
    periodo: "[2026-10-01,2026-10-02)",
  },
});
// `reserva` e derivada: nem o admin escreve nela direto, so o trigger.
checar(
  "nem o admin escreve em `reserva` direto (tabela derivada)",
  !reserva.ok,
  `status ${reserva.status}`,
);

await fetch(`${URL_SUPABASE}/auth/v1/logout`, {
  method: "POST",
  headers: { apikey: ANON, Authorization: `Bearer ${token}` },
});

console.log(`\n${passaram} passaram, ${falharam} falharam`);
process.exit(falharam > 0 ? 1 : 0);
