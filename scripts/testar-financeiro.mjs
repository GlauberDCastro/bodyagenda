#!/usr/bin/env node
/**
 * Prova as fórmulas financeiras (RN-04, RN-05, RN-07, RN-08) contra o banco.
 *
 * Roda tudo em transação e faz rollback: não suja os dados.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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

let passaram = 0;
let falharam = 0;
const q = (v) => Number(v);

function checar(rotulo, ok, detalhe = "") {
  if (ok) {
    passaram++;
    console.log(`  PASSOU  ${rotulo}`);
  } else {
    falharam++;
    console.log(`  FALHOU  ${rotulo}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

const cli = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await cli.connect();
await cli.query("begin");

// ── Massa ────────────────────────────────────────────────────────────────────
const { rows: [pac] } = await cli.query(
  `insert into paciente (nome, cpf) values ('Financeiro Teste', '00000000353') returning id`,
);
const { rows: [proc] } = await cli.query(
  `select id, duracao_min, valor_sessao from procedimento where nome = 'Fotona'`,
);
const { rows: [sala] } = await cli.query(`select id from sala where numero = 6`);
const { rows: [equip] } = await cli.query(
  `select id from equipamento where modelo = 'Fotona' limit 1`,
);

// Custo de insumo do procedimento: R$ 100
await cli.query(
  `insert into procedimento_custo (procedimento_id, tipo, descricao, valor_unitario, quantidade)
   values ($1, 'insumo', 'Insumo teste', 100, 1)`,
  [proc.id],
);
// Custo/hora do aparelho: R$ 60 → 15 min = R$ 15
await cli.query(
  `insert into equipamento_custo (equipamento_id, custo_hora) values ($1, 60)
   on conflict (equipamento_id) do update set custo_hora = 60`,
  [equip.id],
);

// Dois profissionais, comissões diferentes
const profs = [];
for (const [nome, tipo, valor] of [
  ["Prof Percentual", "percentual", 10],
  ["Prof Fixo", "valor_fixo", 25],
]) {
  const { rows: [p] } = await cli.query(
    `insert into profissional (nome, cor_agenda) values ($1, '#000000') returning id`,
    [nome],
  );
  await cli.query(
    `insert into profissional_remuneracao (profissional_id, custo_hora, comissao_tipo, comissao_valor)
     values ($1, 0, $2, $3)`,
    [p.id, tipo, valor],
  );
  await cli.query(
    `insert into recurso_disponibilidade (recurso_tipo, recurso_id, dia_semana, hora_inicio, hora_fim)
     select 'profissional', $1, d, '08:00', '18:00' from generate_series(1,5) d`,
    [p.id],
  );
  profs.push(p.id);
}

console.log("\n-- RN-04 · receita e custo da sessao --");

// Sessão avulsa de R$ 999, 15 min
const QUANDO = "2026-10-13T10:00:00-03:00";
const { rows: [ag] } = await cli.query(
  `select criar_agendamento($1,$2,$3::timestamptz,$4,$5::uuid[],$6::uuid[],null,null,999) as id`,
  [pac.id, proc.id, QUANDO, sala.id, [equip.id], profs],
);

const { rows: [r] } = await cli.query(`select receita_sessao($1) as v`, [ag.id]);
checar("receita de sessao avulsa = valor informado", q(r.v) === 999, `veio ${r.v}`);

const { rows: [c] } = await cli.query(`select custo_direto_sessao($1) as v`, [ag.id]);
// insumo 100 + aparelho 60/h × 0,25h = 15 → 115
checar("custo direto = insumo + custo/hora do aparelho", q(c.v) === 115, `veio ${c.v}`);

console.log("\n-- RN-05 · comissao --");

const { rows: semComissao } = await cli.query(
  `select count(*)::int as n from comissao where agendamento_id = $1`, [ag.id],
);
checar("nenhuma comissao enquanto nao realizado", semComissao[0].n === 0);

await cli.query(`update agendamento set status = 'realizado' where id = $1`, [ag.id]);

const { rows: comissoes } = await cli.query(
  `select base_calculo, valor from comissao where agendamento_id = $1 order by valor`,
  [ag.id],
);
checar("duas comissoes geradas ao realizar", comissoes.length === 2, `veio ${comissoes.length}`);
// Base rateada: 999 / 2 = 499,50
checar(
  "base rateada entre os profissionais",
  comissoes.every((x) => q(x.base_calculo) === 499.5),
  JSON.stringify(comissoes),
);
// Percentual 10% sobre 499,50 = 49,95 · Fixo = 25
const valores = comissoes.map((x) => q(x.valor)).sort((a, b) => a - b);
checar("percentual sobre a base rateada e valor fixo", valores[0] === 25 && valores[1] === 49.95,
  JSON.stringify(valores));

console.log("\n-- RN-06 · falta nao gera comissao --");
await cli.query(`update agendamento set status = 'falta' where id = $1`, [ag.id]);
const { rows: [apos] } = await cli.query(
  `select count(*)::int as n from comissao where agendamento_id = $1`, [ag.id],
);
checar("reverter o realizado cancela comissao nao paga", apos.n === 0, `restaram ${apos.n}`);

await cli.query(`update agendamento set status = 'realizado' where id = $1`, [ag.id]);

console.log("\n-- RN-04 · margem --");
const { rows: [m] } = await cli.query(`select * from margem_sessao($1)`, [ag.id]);
// 999 - 115 - 74,95 = 809,05 ; por hora = 809,05 / 0,25 = 3236,20
checar("margem = receita - custo - comissao", q(m.margem_contrib) === 809.05, `veio ${m.margem_contrib}`);
checar("margem por hora normaliza duracoes diferentes",
  q(m.margem_por_hora) === 3236.2, `veio ${m.margem_por_hora}`);

console.log("\n-- RN-08 · receita por hora disponivel --");
const { rows: painel } = await cli.query(
  `select * from painel_ocupacao('sala',
     '2026-10-13T00:00:00-03:00', '2026-10-13T23:59:59-03:00')
   where recurso_id = $1`, [sala.id],
);
const linha = painel[0];
checar("painel traz a sala com receita apurada", q(linha.receita) === 999, `veio ${linha?.receita}`);
// 10h de capacidade no dia, receita 999 → 99,90/h
checar("receita por hora disponivel = receita / capacidade",
  q(linha.receita_por_hora) === 99.9, `veio ${linha.receita_por_hora}`);
checar("taxa efetiva reflete os 15 min em 10h",
  q(linha.taxa_efetiva) === 0.025, `veio ${linha.taxa_efetiva}`);

console.log("\n-- RN-07 · rateio de despesa fixa --");
await cli.query(
  `insert into despesa_fixa (descricao, valor, competencia) values ('Aluguel', 22000, '2026-10')`,
);
const { rows: [ch] } = await cli.query(`select custo_hora_estrutura('2026-10') as v`);
checar("custo/hora de estrutura calculado sobre capacidade de SALAS",
  ch.v !== null && q(ch.v) > 0, `veio ${ch.v}`);

const { rows: [dre] } = await cli.query(`select * from dre_competencia('2026-10')`);
checar("DRE fecha: receita - custos - comissoes - despesas",
  q(dre.resultado) === q(dre.receita_realizada) - q(dre.custos_diretos)
    - q(dre.comissoes) - q(dre.despesas_fixas),
  JSON.stringify(dre));

console.log("\n-- RF-95 · passivo de entrega --");
await cli.query(
  `insert into pacote (paciente_id, procedimento_id, quantidade_sessoes, valor_total)
   select $1, id, 8, 799 from procedimento where nome = 'CM Slim' returning id`,
  [pac.id],
);
const { rows: passivo } = await cli.query(`select * from passivo_entrega()`);
const cmSlim = passivo.find((x) => x.nome === "CM Slim");
checar("pacote de 8 sessoes aparece como 8 sessoes devidas",
  cmSlim && cmSlim.sessoes_devidas === 8, JSON.stringify(cmSlim));
checar("8 sessoes de 30 min = 4 horas de agenda comprometidas",
  cmSlim && q(cmSlim.horas_devidas) === 4, `veio ${cmSlim?.horas_devidas}`);
checar("valor devido = valor do pacote ainda nao entregue",
  cmSlim && q(cmSlim.valor_devido) === 799, `veio ${cmSlim?.valor_devido}`);

console.log("\n-- RF-91 · janelas vagas --");
const { rows: vagas } = await cli.query(
  `select * from janelas_vagas('sala', $1,
     '2026-10-13T00:00:00-03:00', '2026-10-13T23:59:59-03:00', 30)`,
  [sala.id],
);
// Expediente 08-18 com 15 min ocupados às 10:00 → duas janelas
checar("ocupacao no meio do dia parte a disponibilidade em duas janelas",
  vagas.length === 2, `veio ${vagas.length}`);
checar("janelas vem ordenadas da maior para a menor",
  vagas.length < 2 || vagas[0].minutos >= vagas[1].minutos,
  JSON.stringify(vagas.map((v) => v.minutos)));

console.log("\n-- RF-96 · rentabilidade por procedimento --");
const { rows: rent } = await cli.query(
  `select * from rentabilidade_procedimentos(
     '2026-10-01T00:00:00-03:00', '2026-11-01T00:00:00-03:00')`,
);
const fotona = rent.find((x) => x.nome === "Fotona");
checar("Fotona aparece com 1 sessao realizada", fotona && fotona.sessoes === 1);
checar("margem por procedimento bate com margem_sessao",
  fotona && q(fotona.margem) === 809.05, `veio ${fotona?.margem}`);

await cli.query("rollback");
await cli.end();

console.log(`\n${passaram} passaram, ${falharam} falharam`);
process.exit(falharam > 0 ? 1 : 0);
