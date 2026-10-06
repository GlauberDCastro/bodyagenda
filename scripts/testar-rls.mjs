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
 * um perfil enxergando ou escrevendo fora da matriz da 0020, a fronteira está
 * furada.
 *
 * Cria um usuário temporário por perfil (service_role) e uma massa própria
 * (conexão direta), e apaga tudo no fim — inclusive se algo falhar no meio.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import pg from "pg";

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
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_SUPABASE || !ANON || !SERVICE_ROLE || !process.env.DATABASE_URL) {
  console.error(
    "Faltam variaveis: NEXT_PUBLIC_SUPABASE_URL, chave anon/publishable, " +
      "SUPABASE_SERVICE_ROLE_KEY e DATABASE_URL.",
  );
  process.exit(1);
}

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

/** Quantas linhas o perfil enxerga. Erro conta como zero. */
async function linhas(caminho, token) {
  const r = await api(caminho, { token });
  return r.ok && Array.isArray(r.dados) ? r.dados.length : 0;
}

/** Escrita só "passou" se a API aceitou E devolveu a linha afetada. */
const escreveu = (r) => r.ok && Array.isArray(r.dados) && r.dados.length > 0;

async function authAdmin(caminho, metodo = "GET", corpo) {
  const r = await fetch(`${URL_SUPABASE}/auth/v1/admin/${caminho}`, {
    method: metodo,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { ok: r.ok, status: r.status, dados: await r.json().catch(() => null) };
}

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await db.connect();

const PERFIS = ["admin", "gestao", "financeiro", "recepcao", "profissional"];
const sufixo = randomBytes(4).toString("hex");
const usuarios = {};
const m = {}; // massa

async function criarUsuario(perfil) {
  const email = `teste-rls-${perfil}-${sufixo}@exemplo.invalid`;
  const senha = randomBytes(18).toString("base64url");
  const criado = await authAdmin("users", "POST", { email, password: senha, email_confirm: true });
  if (!criado.ok) throw new Error(`criar usuario ${perfil}: HTTP ${criado.status}`);
  const id = criado.dados.id;
  usuarios[perfil] = { id };
  await db.query(
    `insert into usuario (id, nome, email, perfil, ativo) values ($1, $2, $3, $4, true)`,
    [id, `TESTE RLS ${perfil}`, email, perfil],
  );
  const login = await fetch(`${URL_SUPABASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });
  usuarios[perfil].token = (await login.json()).access_token;
}

async function criarMassa() {
  const q = async (sql, params) => (await db.query(sql, params)).rows[0];
  m.sala = await q(
    `insert into sala (numero, nome)
     values ((select coalesce(max(numero), 0) + 900 from sala), 'TESTE RLS') returning id`,
  );
  m.proc = await q(
    `insert into procedimento (nome, duracao_min, valor_sessao)
     values ('TESTE RLS', 30, 100) returning id`,
  );
  await db.query(
    `insert into procedimento_custo (procedimento_id, tipo, descricao, valor_unitario, quantidade)
     values ($1, 'insumo', 'TESTE RLS', 10, 1)`,
    [m.proc.id],
  );
  // Profissional "meu" (ligado ao usuário de perfil profissional) e "outro".
  m.profMeu = await q(
    `insert into profissional (nome, usuario_id) values ('TESTE RLS meu', $1) returning id`,
    [usuarios.profissional.id],
  );
  m.profOutro = await q(`insert into profissional (nome) values ('TESTE RLS outro') returning id`);
  for (const p of [m.profMeu, m.profOutro]) {
    await db.query(
      `insert into profissional_remuneracao (profissional_id, custo_hora, comissao_tipo, comissao_valor)
       values ($1, 0, 'percentual', 10)`,
      [p.id],
    );
    // RF-23a (0029): só atende quem é habilitado no procedimento.
    await db.query(
      `insert into profissional_habilitacao (profissional_id, procedimento_id) values ($1, $2)`,
      [p.id, m.proc.id],
    );
  }
  for (const [tipo, id] of [["sala", m.sala.id], ["profissional", m.profMeu.id], ["profissional", m.profOutro.id]]) {
    await db.query(
      `insert into recurso_disponibilidade (recurso_tipo, recurso_id, dia_semana, hora_inicio, hora_fim)
       select $1::tipo_recurso, $2, d, '08:00', '18:00' from generate_series(1, 5) d`,
      [tipo, id],
    );
  }
  m.pacMeu = await q(`insert into paciente (nome) values ('TESTE RLS paciente meu') returning id`);
  m.pacOutro = await q(`insert into paciente (nome) values ('TESTE RLS paciente outro') returning id`);

  // Segunda-feira 2030-01-07, um atendimento de cada profissional.
  const agendar = async (paciente, prof, hora) => {
    const ag = await q(
      `insert into agendamento (paciente_id, procedimento_id, sala_id, inicio, fim)
       values ($1, $2, $3, $4::timestamptz, $4::timestamptz + interval '30 min') returning id`,
      [paciente.id, m.proc.id, m.sala.id, `2030-01-07T${hora}:00-03:00`],
    );
    await db.query(
      `insert into agendamento_profissional (agendamento_id, profissional_id) values ($1, $2)`,
      [ag.id, prof.id],
    );
    return ag;
  };
  m.agMeu = await agendar(m.pacMeu, m.profMeu, "09");
  m.agOutro = await agendar(m.pacOutro, m.profOutro, "10");
  // Realizar gera a comissão de cada um pelo trigger.
  await db.query(`update agendamento set status = 'realizado' where id = any($1::uuid[])`, [
    [m.agMeu.id, m.agOutro.id],
  ]);
  m.agPendente = await agendar(m.pacMeu, m.profMeu, "11");

  m.receita = await q(
    `insert into lancamento (tipo, origem_tipo, descricao, valor, vencimento)
     values ('receita', 'outro', 'TESTE RLS', 100, '2030-01-07') returning id`,
  );
  m.despesa = await q(
    `insert into lancamento (tipo, origem_tipo, descricao, valor, vencimento)
     values ('despesa', 'outro', 'TESTE RLS', 50, '2030-01-07') returning id`,
  );
}

async function apagarTudo() {
  const ids = Object.values(usuarios).map((u) => u.id);
  const del = (sql, p) => db.query(sql, p).catch((e) => console.log(`    (limpeza: ${e.message})`));
  await del(`delete from lancamento where descricao = 'TESTE RLS'`);
  await del(`delete from meta_venda where rotulo = 'TESTE RLS'`);
  await del(`delete from meta_mes where mes = '2031-02'`);
  if (m.proc) {
    await del(
      `delete from lancamento where origem_tipo = 'pacote'
          and origem_id in (select id from pacote where procedimento_id = $1)`,
      [m.proc.id],
    );
    await del(`delete from pacote where procedimento_id = $1`, [m.proc.id]);
  }
  if (m.proc) await del(`delete from agendamento where procedimento_id = $1`, [m.proc.id]);
  await del(`delete from paciente where nome like 'TESTE RLS%'`);
  await del(
    `delete from recurso_disponibilidade
      where recurso_id in (select id from profissional where nome like 'TESTE RLS%')`,
  );
  await del(`delete from profissional where nome like 'TESTE RLS%'`);
  await del(`delete from recurso_disponibilidade where recurso_id = $1`, [m.sala?.id]);
  await del(`delete from procedimento where nome = 'TESTE RLS'`);
  await del(`delete from sala where nome like 'TESTE RLS%'`);
  await del(`delete from despesa_fixa where descricao = 'TESTE RLS'`);
  // A auditoria referencia o usuário: as linhas geradas pelo teste saem junto.
  await del(`delete from auditoria where usuario_id = any($1::uuid[])`, [ids]);
  await del(`delete from usuario where id = any($1::uuid[])`, [ids]);
  for (const id of ids) await authAdmin(`users/${id}`, "DELETE");
}

try {
  for (const p of PERFIS) await criarUsuario(p);
  await criarUsuario("sdr"); // time comercial (0041): opera como a recepção
  await criarMassa();
  const t = Object.fromEntries(PERFIS.map((p) => [p, usuarios[p].token]));

  console.log("\n-- login de cada perfil --");
  for (const p of PERFIS) checar(`login ${p}`, !!t[p]);

  // ── Visitante sem sessão ──────────────────────────────────────────────────
  console.log("\n-- visitante sem sessao --");
  checar("anon NAO le salas", (await linhas("sala?select=id", null)) === 0);
  checar("anon NAO le pacientes", (await linhas("paciente?select=id", null)) === 0);
  checar("anon NAO le custos", (await linhas("procedimento_custo?select=id", null)) === 0);
  checar(
    "anon NAO cria paciente",
    !escreveu(await api("paciente", { metodo: "POST", corpo: { nome: "TESTE RLS invasor" } })),
  );
  const anonComissao = await api("rpc/gerar_comissoes", {
    metodo: "POST",
    corpo: { p_agendamento: m.agPendente.id },
  });
  checar("anon NAO executa gerar_comissoes", !anonComissao.ok, `status ${anonComissao.status}`);

  // ── Leitura: quem vê o quê ────────────────────────────────────────────────
  // true = enxerga a massa; false = não enxerga nada da massa.
  console.log("\n-- leitura por perfil --");
  const filtroProc = `procedimento_id=eq.${m.proc.id}`;
  const LEITURA = [
    ["custo de procedimento", `procedimento_custo?select=id&${filtroProc}`,
      { admin: true, gestao: true, financeiro: true, recepcao: false, profissional: false }],
    ["remuneracao de OUTRO profissional", `profissional_remuneracao?select=profissional_id&profissional_id=eq.${m.profOutro.id}`,
      { admin: true, gestao: true, financeiro: true, recepcao: false, profissional: false }],
    ["comissao de OUTRO profissional", `comissao?select=id&profissional_id=eq.${m.profOutro.id}`,
      { admin: true, gestao: true, financeiro: true, recepcao: false, profissional: false }],
    ["lancamento de despesa", `lancamento?select=id&id=eq.${m.despesa.id}`,
      { admin: true, gestao: true, financeiro: true, recepcao: false, profissional: false }],
    ["lancamento de receita", `lancamento?select=id&id=eq.${m.receita.id}`,
      { admin: true, gestao: true, financeiro: true, recepcao: true, profissional: false }],
    ["agendamento de OUTRO profissional", `agendamento?select=id&id=eq.${m.agOutro.id}`,
      { admin: true, gestao: true, financeiro: true, recepcao: true, profissional: false }],
    ["paciente de OUTRO profissional", `paciente?select=id&id=eq.${m.pacOutro.id}`,
      { admin: true, gestao: true, financeiro: true, recepcao: true, profissional: false }],
    ["usuarios do sistema (alem de si)", `usuario?select=id&id=neq.__SELF__`,
      { admin: true, gestao: true, financeiro: false, recepcao: false, profissional: false }],
  ];
  for (const [rotulo, caminho, esperado] of LEITURA) {
    for (const p of PERFIS) {
      const n = await linhas(caminho.replace("__SELF__", usuarios[p].id), t[p]);
      checar(`${p} ${esperado[p] ? "VE" : "NAO ve"} ${rotulo}`, esperado[p] ? n > 0 : n === 0, `${n} linha(s)`);
    }
  }

  console.log("\n-- profissional: so o que e dele --");
  checar("profissional ve o proprio agendamento",
    (await linhas(`agendamento?select=id&id=eq.${m.agMeu.id}`, t.profissional)) === 1);
  checar("profissional ve o proprio paciente",
    (await linhas(`paciente?select=id&id=eq.${m.pacMeu.id}`, t.profissional)) === 1);
  checar("profissional ve a propria comissao",
    (await linhas(`comissao?select=id&profissional_id=eq.${m.profMeu.id}`, t.profissional)) === 1);

  // ── Escrita ───────────────────────────────────────────────────────────────
  console.log("\n-- escrita por perfil --");
  // Um número por tentativa: aleatório, dois perfis às vezes colidiam (409).
  let numeroSala = 9000 + Math.floor(Math.random() * 500) * 2;
  const ESCRITA = [
    ["cria sala", { admin: true, gestao: true, financeiro: false, recepcao: false, profissional: false },
      (tk) => api("sala", { token: tk, metodo: "POST",
        corpo: { numero: numeroSala++, nome: "TESTE RLS escrita" } })],
    ["altera custo de procedimento", { admin: true, gestao: true, financeiro: false, recepcao: false, profissional: false },
      (tk) => api(`procedimento_custo?${filtroProc}`, { token: tk, metodo: "PATCH", corpo: { quantidade: 1 } })],
    ["cria paciente", { admin: true, gestao: false, financeiro: false, recepcao: true, profissional: false },
      (tk) => api("paciente", { token: tk, metodo: "POST", corpo: { nome: "TESTE RLS escrita" } })],
    ["remarca agendamento de outro", { admin: true, gestao: false, financeiro: false, recepcao: true, profissional: false },
      (tk) => api(`agendamento?id=eq.${m.agOutro.id}`, { token: tk, metodo: "PATCH", corpo: { observacoes: "TESTE RLS" } })],
    ["lanca despesa", { admin: true, gestao: false, financeiro: true, recepcao: false, profissional: false },
      (tk) => api("lancamento", { token: tk, metodo: "POST",
        corpo: { tipo: "despesa", origem_tipo: "outro", descricao: "TESTE RLS", valor: 1, vencimento: "2030-01-07" } })],
    ["lanca recebimento", { admin: true, gestao: false, financeiro: true, recepcao: true, profissional: false },
      (tk) => api("lancamento", { token: tk, metodo: "POST",
        corpo: { tipo: "receita", origem_tipo: "outro", descricao: "TESTE RLS", valor: 1, vencimento: "2030-01-07" } })],
    ["cadastra despesa fixa", { admin: true, gestao: false, financeiro: true, recepcao: false, profissional: false },
      (tk) => api("despesa_fixa", { token: tk, metodo: "POST",
        corpo: { descricao: "TESTE RLS", valor: 1, competencia: "2030-01" } })],
  ];
  for (const [rotulo, esperado, fazer] of ESCRITA) {
    for (const p of PERFIS) {
      const r = await fazer(t[p]);
      const ok = escreveu(r);
      checar(`${p} ${esperado[p] ? "PODE" : "NAO pode"} ${rotulo}`, ok === esperado[p], `status ${r.status}`);
    }
  }

  console.log("\n-- profissional: no proprio agendamento, so o status --");
  const meuStatus = await api(`agendamento?id=eq.${m.agPendente.id}`, {
    token: t.profissional, metodo: "PATCH", corpo: { status: "confirmado" },
  });
  checar("profissional PODE mudar o status do proprio atendimento", escreveu(meuStatus),
    `status ${meuStatus.status}`);
  for (const [rotulo, corpo] of [
    ["valor", { valor_avulso: 1 }],
    ["horario", { inicio: "2030-01-07T15:00:00-03:00", fim: "2030-01-07T15:30:00-03:00" }],
    ["paciente", { paciente_id: m.pacOutro.id }],
  ]) {
    const r = await api(`agendamento?id=eq.${m.agPendente.id}`, {
      token: t.profissional, metodo: "PATCH", corpo,
    });
    checar(`profissional NAO muda o ${rotulo} do proprio atendimento`, !escreveu(r), `status ${r.status}`);
  }

  // ── Caixa (0028) ──────────────────────────────────────────────────────────
  console.log("\n-- caixa: venda e recebimento --");
  const venda = await api("rpc/vender_pacote", {
    token: t.recepcao,
    metodo: "POST",
    corpo: {
      p_paciente: m.pacOutro.id,
      p_procedimento: m.proc.id,
      p_sessoes: 2,
      p_valor_total: 200,
      p_desconto: 0,
      p_validade: null,
      p_regiao: null,
      p_parcelas: 2,
      p_primeiro_vencimento: "2030-01-07",
      p_forma: "Pix",
      p_primeira_paga: false,
    },
  });
  checar("recepcao vende pacote com parcelas", venda.ok, `status ${venda.status}`);
  const { rows: parcelasRls } = await db.query(
    `select id from lancamento where origem_tipo = 'pacote' and origem_id = $1 order by parcela_num`,
    [venda.dados],
  );
  checar("venda gerou as 2 parcelas", parcelasRls.length === 2, `${parcelasRls.length}`);
  for (const [perfil, pode] of [
    ["gestao", false],
    ["profissional", false],
    ["financeiro", true],
    ["recepcao", true],
  ]) {
    const alvo = perfil === "recepcao" ? parcelasRls[1]?.id : parcelasRls[0]?.id;
    if (perfil === "financeiro" || perfil === "recepcao" || !pode) {
      const r = await api("rpc/registrar_recebimento", {
        token: t[perfil],
        metodo: "POST",
        corpo: { p_lancamento: alvo, p_valor: 10, p_data: "2030-01-07", p_forma: "Pix" },
      });
      checar(
        `${perfil} ${pode ? "PODE" : "NAO pode"} registrar recebimento`,
        r.ok === pode,
        `status ${r.status}`,
      );
    }
  }

  // ── Escalonamento de privilégio ───────────────────────────────────────────
  console.log("\n-- ninguem alem do admin concede acesso --");
  for (const p of PERFIS.filter((x) => x !== "admin")) {
    await api(`usuario?id=eq.${usuarios[p].id}`, { token: t[p], metodo: "PATCH", corpo: { perfil: "admin" } });
    const { rows } = await db.query(`select perfil from usuario where id = $1`, [usuarios[p].id]);
    checar(`${p} NAO se promove a admin`, rows[0].perfil === p, `ficou ${rows[0].perfil}`);
  }

  // ── Tabela derivada e funções internas ────────────────────────────────────
  console.log("\n-- reserva e funcoes internas --");
  const reserva = await api("reserva", {
    token: t.admin,
    metodo: "POST",
    corpo: {
      agendamento_id: m.agPendente.id,
      recurso_tipo: "sala",
      recurso_id: m.sala.id,
      periodo: "[2030-01-08 10:00,2030-01-08 11:00)",
    },
  });
  checar("nem o admin escreve em `reserva` direto (tabela derivada)", !escreveu(reserva),
    `status ${reserva.status}`);

  // RN-06: comissão só nasce de sessão realizada, nem chamando a função direto.
  await api("rpc/gerar_comissoes", {
    token: t.profissional,
    metodo: "POST",
    corpo: { p_agendamento: m.agPendente.id },
  });
  const { rows: [pend] } = await db.query(
    `select count(*)::int as n from comissao where agendamento_id = $1`, [m.agPendente.id],
  );
  checar("gerar_comissoes direto NAO cria comissao de sessao nao realizada", pend.n === 0,
    `${pend.n} comissao(oes)`);

  // Comissão paga não pode ter o valor recalculado por baixo.
  await db.query(
    `update comissao set status = 'paga', valor = 7 where agendamento_id = $1`, [m.agMeu.id],
  );
  await api("rpc/gerar_comissoes", {
    token: t.profissional,
    metodo: "POST",
    corpo: { p_agendamento: m.agMeu.id },
  });
  const { rows: [paga] } = await db.query(
    `select valor from comissao where agendamento_id = $1`, [m.agMeu.id],
  );
  checar("comissao paga NAO e recalculada", Number(paga.valor) === 7, `valor ${paga.valor}`);

  console.log("\n-- time comercial e upsell (0041) --");
  const sdr = usuarios.sdr.token;
  checar("sdr le paciente",
    (await linhas(`paciente?select=id&id=eq.${m.pacMeu.id}`, sdr)) === 1);
  checar("sdr NAO le bonificacao (comissao)",
    (await linhas(`comissao?select=id`, sdr)) === 0);
  checar("sdr NAO le despesa fixa",
    (await linhas(`despesa_fixa?select=id`, sdr)) === 0);
  const agSdr = await api("rpc/criar_agendamento", {
    token: sdr,
    metodo: "POST",
    corpo: {
      p_paciente: m.pacOutro.id,
      p_procedimento: m.proc.id,
      p_inicio: "2030-01-07T14:00:00-03:00",
      p_sala: m.sala.id,
      p_profissionais: [m.profOutro.id],
      p_valor_avulso: 100,
    },
  });
  checar("sdr agenda", agSdr.ok, JSON.stringify(agSdr.dados));
  if (agSdr.ok) {
    const { rows: [o] } = await db.query(
      `select origem, vendido_por from agendamento where id = $1`, [agSdr.dados],
    );
    checar("agendamento do sdr sai como comercial, vendido pelo sdr",
      o.origem === "comercial" && o.vendido_por === usuarios.sdr.id, JSON.stringify(o));
  }

  const upsell = (token, origem, hora) =>
    api("rpc/registrar_upsell", {
      token,
      metodo: "POST",
      corpo: {
        p_origem: origem,
        p_procedimento: m.proc.id,
        p_inicio: `2030-01-07T${hora}:00-03:00`,
        p_sala: m.sala.id,
        p_profissionais: [m.profMeu.id],
        p_valor_avulso: 100,
      },
    });
  const meu = await upsell(t.profissional, m.agMeu.id, "12");
  checar("profissional registra upsell no PROPRIO atendimento", meu.ok, JSON.stringify(meu.dados));
  if (meu.ok) {
    const { rows: [u] } = await db.query(
      `select origem, atendimento_origem_id, vendido_por from agendamento where id = $1`,
      [meu.dados],
    );
    checar("upsell fica ligado a origem e a quem vendeu",
      u.origem === "upsell" && u.atendimento_origem_id === m.agMeu.id &&
        u.vendido_por === usuarios.profissional.id, JSON.stringify(u));
  }
  const alheio = await upsell(t.profissional, m.agOutro.id, "13");
  checar("profissional NAO registra upsell no atendimento de outra", !alheio.ok,
    `status ${alheio.status}`);
  const financeiro = await upsell(t.financeiro, m.agMeu.id, "15");
  checar("financeiro NAO registra upsell", !financeiro.ok, `status ${financeiro.status}`);
  console.log("\n-- venda de pacote pela profissional (0045) --");
  const vender = (token, paciente) =>
    api("rpc/vender_pacote", {
      token,
      metodo: "POST",
      corpo: {
        p_paciente: paciente,
        p_procedimento: m.proc.id,
        p_sessoes: 3,
        p_valor_total: 300,
        p_desconto: 0,
        p_validade: null,
        p_regiao: null,
        p_parcelas: 1,
        p_primeiro_vencimento: "2030-01-07",
        p_forma: "Pix",
        p_primeira_paga: false,
      },
    });
  const vendaMinha = await vender(t.profissional, m.pacMeu.id);
  checar("profissional vende pacote a paciente que atende", vendaMinha.ok,
    JSON.stringify(vendaMinha.dados));
  if (vendaMinha.ok) {
    const { rows: [pc] } = await db.query(`select vendido_por from pacote where id = $1`,
      [vendaMinha.dados]);
    checar("pacote registra a profissional como vendedora",
      pc.vendido_por === usuarios.profissional.id);
  }
  checar("profissional NAO vende pacote a paciente de outra",
    !(await vender(t.profissional, m.pacOutro.id)).ok);
  checar("gestao continua sem vender pacote", !(await vender(t.gestao, m.pacMeu.id)).ok);
  checar("sdr vende pacote", (await vender(sdr, m.pacOutro.id)).ok);

  console.log("\n-- relatorio de vendas (0046) --");
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const vendasGestao = await api("rpc/vendas_periodo", {
    token: t.gestao,
    metodo: "POST",
    corpo: { p_de: hoje, p_ate: hoje },
  });
  const minhas = (vendasGestao.dados ?? []).filter((v) =>
    [m.pacMeu.id, m.pacOutro.id].includes(v.paciente_id),
  );
  const canalDe = (perfil, tipo) =>
    minhas.find((v) => v.vendedor_perfil === perfil && v.tipo === tipo)?.canal;
  checar("venda da profissional entra como canal clinica", canalDe("profissional", "pacote") === "clinica",
    JSON.stringify(minhas.map((v) => [v.tipo, v.vendedor_perfil, v.canal])));
  checar("pacote do sdr entra como canal comercial", canalDe("sdr", "pacote") === "comercial");
  checar("sessao avulsa agendada pelo sdr entra como comercial", canalDe("sdr", "avulsa") === "comercial");
  checar("upsell entra como canal clinica",
    minhas.some((v) => v.tipo === "avulsa" && v.vendedor_perfil === "profissional" && v.canal === "clinica"));
  checar("gestao ve quem vendeu", minhas.every((v) => v.vendedor_nome !== null || v.vendedor_perfil === null));
  const vendasProf = await api("rpc/vendas_periodo", {
    token: t.profissional,
    metodo: "POST",
    corpo: { p_de: hoje, p_ate: hoje },
  });
  checar("profissional NAO ve o nome de quem vendeu (usuario fechado pelo RLS)",
    (vendasProf.dados ?? []).every((v) => v.vendedor_id === null || v.vendedor_id === usuarios.profissional.id));

  checar("profissional continua sem agendar direto (fora do upsell)",
    !(await api("rpc/criar_agendamento", {
      token: t.profissional,
      metodo: "POST",
      corpo: {
        p_paciente: m.pacMeu.id,
        p_procedimento: m.proc.id,
        p_inicio: "2030-01-07T16:00:00-03:00",
        p_sala: m.sala.id,
        p_valor_avulso: 100,
      },
    })).ok);

  console.log("\n-- metas (0047) --");
  // Mês de teste longe do real; sai no fim deste bloco.
  const MES_RLS = "2031-02";
  const metaDe = (token) =>
    api("meta_mes", { token, metodo: "POST", corpo: { mes: MES_RLS, ocupacao: 0.2 } });
  checar("recepcao NAO define meta de ocupacao", !(await metaDe(t.recepcao)).ok);
  checar("profissional NAO define meta de ocupacao", !(await metaDe(t.profissional)).ok);
  checar("gestao define meta de ocupacao", (await metaDe(t.gestao)).ok);
  const vendaMeta = (token) =>
    api("meta_venda", {
      token,
      metodo: "POST",
      corpo: { mes: MES_RLS, rotulo: "TESTE RLS", procedimento_id: m.proc.id, por_dia_min: 1 },
    });
  checar("sdr NAO cria meta de venda", !(await vendaMeta(sdr)).ok);
  checar("gestao cria meta de venda", (await vendaMeta(t.gestao)).ok);
  checar("profissional le as metas", (await linhas(`meta_venda?mes=eq.${MES_RLS}`, t.profissional)) === 1);
  const apagou = await api(`meta_venda?mes=eq.${MES_RLS}`, { token: t.recepcao, metodo: "DELETE" });
  checar("recepcao NAO apaga meta de venda", (apagou.dados ?? []).length === 0);
  checar("meta de venda com maximo menor que minimo e recusada",
    !(await api("meta_venda", {
      token: t.gestao,
      metodo: "POST",
      corpo: { mes: MES_RLS, rotulo: "TESTE RLS", procedimento_id: m.proc.id, por_dia_min: 4, por_dia_max: 3 },
    })).ok);
  await db.query(`delete from meta_venda where mes = $1`, [MES_RLS]);
  await db.query(`delete from meta_mes where mes = $1`, [MES_RLS]);
} catch (e) {
  falharam++;
  console.log(`\n  ERRO  ${e.message}`);
} finally {
  await apagarTudo();
  const { rows: [sobra] } = await db.query(
    `select (select count(*) from usuario where email like 'teste-rls-%')
          + (select count(*) from sala where nome like 'TESTE RLS%')
          + (select count(*) from paciente where nome like 'TESTE RLS%')
          + (select count(*) from lancamento where descricao = 'TESTE RLS') as n`,
  );
  checar("limpeza: nenhum registro de teste sobrou", Number(sobra.n) === 0, `${sobra.n} sobra(s)`);
  await db.end();
}

console.log(`\n${passaram} passaram, ${falharam} falharam`);
process.exit(falharam > 0 ? 1 : 0);
