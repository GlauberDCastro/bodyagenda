#!/usr/bin/env node
/**
 * Aplica supabase/migrations/*.sql em ordem, e opcionalmente o seed.
 *
 * As chaves do .env.local NÃO servem para isto: PostgREST expõe tabelas e
 * funções que já existem, mas não executa DDL. É preciso uma destas:
 *
 *   DATABASE_URL           string de conexão do Postgres
 *                          (Supabase → Project Settings → Database → URI)
 *                          Porta 5432 (session mode). A 6543 recusa DDL.
 *
 *   SUPABASE_ACCESS_TOKEN  Personal Access Token (sbp_…), via Management API.
 *                          Não precisa da senha do banco.
 *
 * Uso:
 *   npm run db:migrate    migrações
 *   npm run db:reset      migrações + seed
 *   npm run db:check      só relata o que já foi aplicado
 *
 * Idempotente: registra o aplicado em `_migracao_aplicada` e pula o resto.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR_MIGRACOES = join(RAIZ, "supabase", "migrations");

function carregarEnvLocal() {
  const arquivo = join(RAIZ, ".env.local");
  if (!existsSync(arquivo)) return;
  for (const linha of readFileSync(arquivo, "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
carregarEnvLocal();

const args = process.argv.slice(2);
const comSeed = args.includes("--seed");
const apenasVerificar = args.includes("--verificar");

function listarMigracoes() {
  return readdirSync(DIR_MIGRACOES)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((nome) => ({
      nome,
      sql: readFileSync(join(DIR_MIGRACOES, nome), "utf8"),
    }));
}

const SQL_CONTROLE = [
  "create table if not exists _migracao_aplicada (",
  "  nome text primary key,",
  "  aplicada_em timestamptz not null default now()",
  ")",
].join("\n");

/**
 * Prova o motor de reserva contra este Postgres. São exatamente os dois riscos
 * abertos no plano de implementação: btree_gist sobre enum e multirange.
 */
const CHECAGENS = [
  {
    rotulo: "btree_gist instalada",
    sql: "select count(*)::int as c from pg_extension where extname = 'btree_gist'",
    ok: (c) => c > 0,
  },
  {
    rotulo: "constraint reserva_sem_conflito presente",
    sql: "select count(*)::int as c from pg_constraint where conname = 'reserva_sem_conflito'",
    ok: (c) => c > 0,
  },
  {
    rotulo: "multirange suportado (PG 14+)",
    sql: "select count(*)::int as c from pg_type where typname = 'tstzmultirange'",
    ok: (c) => c > 0,
  },
  {
    rotulo: "funcao capacidade_recurso criada",
    sql: "select count(*)::int as c from pg_proc where proname = 'capacidade_recurso'",
    ok: (c) => c > 0,
  },
  {
    rotulo: "tabelas publicas SEM rls (deve ser 0)",
    sql: "select count(*)::int as c from pg_tables where schemaname = 'public' and not rowsecurity",
    ok: (c) => c === 0,
    detalhe: (c) => (c > 0 ? `${c} tabela(s) sem RLS` : ""),
  },
  {
    // `create or replace` com assinatura nova cria uma SEGUNDA função; o
    // PostgREST então recusa a chamada com PGRST203 (foi o caso da 0012).
    rotulo: "funcoes publicas sobrecarregadas (deve ser 0)",
    sql: `select count(*)::int as c from (
            select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where nspname = 'public' group by proname having count(*) > 1) x`,
    ok: (c) => c === 0,
    detalhe: (c) => (c > 0 ? `${c} funcao(oes) com mais de uma assinatura` : ""),
  },
];

// ── Caminho 1: conexão direta ao Postgres ────────────────────────────────────

async function viaPostgres(url) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  const { rows: v } = await client.query("select version()");
  console.log(v[0].version.split(",")[0]);
  console.log("");

  await client.query(SQL_CONTROLE);
  const { rows } = await client.query("select nome from _migracao_aplicada");
  const aplicadas = new Set(rows.map((r) => r.nome));

  if (apenasVerificar) {
    for (const { nome } of listarMigracoes()) {
      console.log(`${aplicadas.has(nome) ? "[ok]  " : "[   ] "} ${nome}`);
    }
    await rodarChecagens(client);
    await client.end();
    return;
  }

  for (const { nome, sql } of listarMigracoes()) {
    if (aplicadas.has(nome)) {
      console.log(`[pula] ${nome}`);
      continue;
    }
    process.stdout.write(`[roda] ${nome} ... `);
    try {
      // Uma transação por migração: falha não deixa schema pela metade.
      await client.query("begin");
      await client.query(sql);
      await client.query(
        "insert into _migracao_aplicada (nome) values ($1)",
        [nome],
      );
      await client.query("commit");
      console.log("ok");
    } catch (erro) {
      await client.query("rollback").catch(() => {});
      console.log("FALHOU");
      console.error(`\n  ${erro.message}`);
      if (erro.hint) console.error(`  dica: ${erro.hint}`);
      if (erro.position) console.error(`  posicao: ${erro.position}`);
      await client.end();
      process.exit(1);
    }
  }

  if (comSeed) {
    process.stdout.write("[seed] seed.sql ... ");
    try {
      await client.query(readFileSync(join(RAIZ, "supabase", "seed.sql"), "utf8"));
      console.log("ok");
    } catch (erro) {
      console.log("FALHOU");
      console.error(`\n  ${erro.message}`);
      await client.end();
      process.exit(1);
    }
  }

  // Sem isto o PostgREST segue servindo o schema antigo até reiniciar.
  await client.query("notify pgrst, 'reload schema'");

  await rodarChecagens(client);
  await client.end();
}

async function rodarChecagens(client) {
  console.log("\n-- verificacao do motor de reserva --");
  let falhas = 0;
  for (const c of CHECAGENS) {
    try {
      const { rows } = await client.query(c.sql);
      const valor = rows[0]?.c ?? 0;
      const passou = c.ok(valor);
      if (!passou) falhas++;
      const extra = c.detalhe ? c.detalhe(valor) : "";
      console.log(
        `  ${passou ? "PASSOU" : "FALHOU"}  ${c.rotulo}${extra ? ` — ${extra}` : ""}`,
      );
    } catch (erro) {
      falhas++;
      console.log(`  ERRO    ${c.rotulo}: ${erro.message}`);
    }
  }
  if (falhas > 0) {
    console.log(`\n${falhas} verificacao(oes) falharam.`);
    process.exitCode = 1;
  }
}

// ── Caminho 2: Management API ────────────────────────────────────────────────

async function viaManagementApi(token, ref) {
  const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`;

  const executar = async (sql) => {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });
    const corpo = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${corpo}`);
    try {
      return JSON.parse(corpo);
    } catch {
      return null;
    }
  };

  await executar(SQL_CONTROLE);
  const linhas = (await executar("select nome from _migracao_aplicada")) ?? [];
  const aplicadas = new Set(linhas.map((r) => r.nome));

  if (apenasVerificar) {
    for (const { nome } of listarMigracoes()) {
      console.log(`${aplicadas.has(nome) ? "[ok]  " : "[   ] "} ${nome}`);
    }
    return;
  }

  for (const { nome, sql } of listarMigracoes()) {
    if (aplicadas.has(nome)) {
      console.log(`[pula] ${nome}`);
      continue;
    }
    process.stdout.write(`[roda] ${nome} ... `);
    try {
      await executar(sql);
      await executar(
        `insert into _migracao_aplicada (nome) values ('${nome}')`,
      );
      console.log("ok");
    } catch (erro) {
      console.log("FALHOU");
      console.error(`\n  ${erro.message}`);
      process.exit(1);
    }
  }

  if (comSeed) {
    process.stdout.write("[seed] seed.sql ... ");
    await executar(readFileSync(join(RAIZ, "supabase", "seed.sql"), "utf8"));
    console.log("ok");
  }

  console.log("\n-- verificacao do motor de reserva --");
  for (const c of CHECAGENS) {
    try {
      const r = (await executar(c.sql)) ?? [];
      const valor = Number(r[0]?.c ?? 0);
      console.log(`  ${c.ok(valor) ? "PASSOU" : "FALHOU"}  ${c.rotulo}`);
    } catch (erro) {
      console.log(`  ERRO    ${c.rotulo}: ${erro.message}`);
    }
  }
}

// ── Entrada ──────────────────────────────────────────────────────────────────

const urlBanco = process.env.DATABASE_URL;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref =
  process.env.SUPABASE_PROJECT_REF ??
  process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\./)?.[1];

if (urlBanco) {
  await viaPostgres(urlBanco);
} else if (token && ref) {
  await viaManagementApi(token, ref);
} else {
  console.error(
    [
      "",
      "Falta a credencial para executar SQL.",
      "",
      "As chaves do .env.local nao servem: PostgREST expoe tabelas e funcoes",
      "que ja existem, mas nao executa DDL (create table, create function).",
      "",
      "Escolha UM caminho e acrescente ao .env.local:",
      "",
      "  DATABASE_URL=postgresql://postgres." +
        (ref ?? "<ref>") +
        ":<SENHA>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres",
      "      Supabase -> Project Settings -> Database -> Connection string -> URI",
      "      Porta 5432 (session mode). A 6543 e transaction mode e recusa DDL.",
      "",
      "  SUPABASE_ACCESS_TOKEN=sbp_...",
      "      Supabase -> Account -> Access Tokens -> Generate new token",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
