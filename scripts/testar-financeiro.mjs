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
// Recursos próprios do teste, e não o catálogo real: os nomes e as salas da
// clínica mudam, e as fórmulas precisam de números conhecidos.
const { rows: [proc] } = await cli.query(
  `insert into procedimento (nome, duracao_min, valor_sessao)
   values ('TESTE financeiro', 15, 0) returning id, duracao_min, valor_sessao`,
);
const { rows: [procPacote] } = await cli.query(
  `insert into procedimento (nome, duracao_min, valor_sessao)
   values ('TESTE financeiro pacote', 30, 0) returning id`,
);
const { rows: [sala] } = await cli.query(
  `insert into sala (numero, nome)
   values ((select coalesce(max(numero), 0) + 900 from sala), 'TESTE financeiro') returning id`,
);
const { rows: [equip] } = await cli.query(
  `insert into equipamento (nome, modelo) values ('TESTE financeiro', 'TESTE-FIN') returning id`,
);
for (const [tipo, id] of [["sala", sala.id], ["equipamento", equip.id]]) {
  await cli.query(
    `insert into recurso_disponibilidade (recurso_tipo, recurso_id, dia_semana, hora_inicio, hora_fim)
     select $1::tipo_recurso, $2, d, '08:00', '18:00' from generate_series(1,5) d`,
    [tipo, id],
  );
}

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
  // RF-23a (0029): só atende quem é habilitado no procedimento.
  await cli.query(
    `insert into profissional_habilitacao (profissional_id, procedimento_id) values ($1, $2)`,
    [p.id, proc.id],
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
   values ($1, $2, 8, 799) returning id`,
  [pac.id, procPacote.id],
);
const { rows: passivo } = await cli.query(`select * from passivo_entrega()`);
const cmSlim = passivo.find((x) => x.nome === "TESTE financeiro pacote");
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
const fotona = rent.find((x) => x.nome === "TESTE financeiro");
checar("procedimento aparece com 1 sessao realizada", fotona && fotona.sessoes === 1);
checar("margem por procedimento bate com margem_sessao",
  fotona && q(fotona.margem) === 809.05, `veio ${fotona?.margem}`);

console.log("\n-- caixa · avulsa realizada gera cobranca --");
const { rows: cobAvulsa } = await cli.query(
  `select valor from lancamento where origem_tipo = 'agendamento' and origem_id = $1
     and status <> 'cancelado'`,
  [ag.id],
);
checar(
  "uma cobranca por atendimento avulso realizado, mesmo apos ida e volta",
  cobAvulsa.length === 1 && q(cobAvulsa[0].valor) === 999,
  JSON.stringify(cobAvulsa),
);

console.log("\n-- RF-80 · venda de pacote com parcelas --");
const {
  rows: [vp],
} = await cli.query(
  `select vender_pacote($1, $2, 4, 1000, 0, null, null, 3, '2026-10-10', 'Pix', true) as id`,
  [pac.id, procPacote.id],
);
const { rows: parcelas } = await cli.query(
  `select valor, vencimento::text as venc, status, parcela_num from lancamento
    where origem_tipo = 'pacote' and origem_id = $1 order by parcela_num`,
  [vp.id],
);
checar("3 parcelas geradas", parcelas.length === 3, `veio ${parcelas.length}`);
checar(
  "parcelas somam o liquido, centavos na ultima",
  parcelas.map((x) => q(x.valor)).join(",") === "333.33,333.33,333.34",
  parcelas.map((x) => x.valor).join(","),
);
checar(
  "vencimentos mensais a partir do primeiro",
  parcelas.map((x) => x.venc).join(",") === "2026-10-10,2026-11-10,2026-12-10",
  parcelas.map((x) => x.venc).join(","),
);
checar(
  "primeira parcela paga na hora",
  parcelas[0].status === "pago" && parcelas[1].status === "pendente",
);

console.log("\n-- RF-81 · recebimento parcial --");
const {
  rows: [p2],
} = await cli.query(`select id from lancamento where origem_id = $1 and parcela_num = 2`, [vp.id]);
const {
  rows: [resto],
} = await cli.query(`select registrar_recebimento($1, 100, '2026-11-05', 'Dinheiro') as id`, [
  p2.id,
]);
const {
  rows: [pago2],
} = await cli.query(`select valor, status, forma_pagamento from lancamento where id = $1`, [p2.id]);
const {
  rows: [aberto2],
} = await cli.query(`select valor, status from lancamento where id = $1`, [resto.id]);
checar(
  "parte paga fica paga com a forma informada",
  q(pago2.valor) === 100 && pago2.status === "pago" && pago2.forma_pagamento === "Dinheiro",
  JSON.stringify(pago2),
);
checar(
  "restante vira cobranca em aberto",
  q(aberto2.valor) === 233.33 && aberto2.status === "pendente",
  JSON.stringify(aberto2),
);
let recusou = false;
try {
  await cli.query("savepoint rp");
  await cli.query(`select registrar_recebimento($1, 50, '2026-11-05', 'Pix')`, [p2.id]);
} catch (e) {
  recusou = e.code === "23514";
  await cli.query("rollback to savepoint rp");
}
checar("parcela ja paga nao recebe de novo", recusou);

console.log("\n-- RF-82 · atrasados --");
const {
  rows: [velho],
} = await cli.query(
  `insert into lancamento (tipo, origem_tipo, origem_id, descricao, valor, vencimento)
   values ('receita', 'pacote', $1, 'TESTE vencido', 10, '2020-01-01') returning id`,
  [vp.id],
);
await cli.query("select marcar_atrasados()");
const {
  rows: [vel],
} = await cli.query(`select status from lancamento where id = $1`, [velho.id]);
checar("pendente vencido vira atrasado", vel.status === "atrasado", vel.status);

console.log("\n-- RF-64 · pacote concluido --");
const {
  rows: [pc2],
} = await cli.query(
  `select vender_pacote($1, $2, 2, 400, 0, null, null, 1, '2026-10-10', 'Pix', false) as id`,
  [pac.id, procPacote.id],
);
const ags = [];
for (const h of ["10:00", "11:00"]) {
  const {
    rows: [a],
  } = await cli.query(
    `select criar_agendamento($1, $2, $3::timestamptz, $4, '{}'::uuid[], '{}'::uuid[], $5) as id`,
    [pac.id, procPacote.id, `2026-10-14T${h}:00-03:00`, sala.id, pc2.id],
  );
  ags.push(a.id);
}
await cli.query(`update agendamento set status = 'realizado' where id = $1`, [ags[0]]);
let {
  rows: [st],
} = await cli.query(`select status from pacote where id = $1`, [pc2.id]);
checar("com sessao pendente, pacote segue ativo", st.status === "ativo", st.status);
await cli.query(`update agendamento set status = 'realizado' where id = $1`, [ags[1]]);
({
  rows: [st],
} = await cli.query(`select status from pacote where id = $1`, [pc2.id]));
checar("ultima sessao realizada conclui o pacote", st.status === "concluido", st.status);
await cli.query(`update agendamento set status = 'agendado' where id = $1`, [ags[1]]);
({
  rows: [st],
} = await cli.query(`select status from pacote where id = $1`, [pc2.id]));
checar("desfazer o realizado reabre o pacote", st.status === "ativo", st.status);

console.log("\n-- RF-65 · cancelar pacote --");
// cancelar_pacote checa o perfil: simula o admin real da clinica.
const {
  rows: [adm],
} = await cli.query(`select id from usuario where perfil = 'admin' and ativo limit 1`);
await cli.query(`select set_config('request.jwt.claims', $1, true)`, [
  JSON.stringify({ sub: adm.id }),
]);
const {
  rows: [canc],
} = await cli.query(`select cancelar_pacote($1) as r`, [pc2.id]);
// 400 em 2 sessoes, 1 realizada (200 consumido), nada pago -> deve 200
checar("saldo = pago - consumido", q(canc.r.saldo) === -200, JSON.stringify(canc.r));
const {
  rows: [pend],
} = await cli.query(
  `select count(*) filter (where status = 'cancelado')::int as canceladas,
          count(*) filter (where descricao like 'Saldo%' and status = 'pendente')::int as saldo
     from lancamento where origem_id = $1`,
  [pc2.id],
);
checar(
  "parcelas em aberto canceladas e saldo devido lancado",
  pend.canceladas === 1 && pend.saldo === 1,
  JSON.stringify(pend),
);

// ── 0046 · funil da avaliação e vendas do período ───────────────────────────
console.log("\n-- funil da avaliacao e vendas (0046) --");
const { rows: [procAval] } = await cli.query(
  `insert into procedimento (nome, duracao_min, valor_sessao, avaliacao)
   values ('TESTE avaliacao', 30, 0, true) returning id`,
);
const novoPaciente = async (nome) =>
  (await cli.query(`insert into paciente (nome) values ($1) returning id`, [nome])).rows[0].id;
const [pA, pB, pC, pD] = [
  await novoPaciente("Funil A"),
  await novoPaciente("Funil B"),
  await novoPaciente("Funil C"),
  await novoPaciente("Funil D"),
];
const avaliacao = (paciente, quando, status) =>
  cli.query(
    `insert into agendamento (paciente_id, procedimento_id, sala_id, inicio, fim, status)
     values ($1, $2, $3, $4::timestamptz, $4::timestamptz + interval '30 min', $5)`,
    [paciente, procAval.id, sala.id, quando, status],
  );
const pacoteVendido = (paciente, dia, status = "ativo") =>
  cli.query(
    `insert into pacote (paciente_id, procedimento_id, quantidade_sessoes, valor_total, desconto,
                         data_venda, status)
     values ($1, $2, 3, 900, 100, $3, $4)`,
    [paciente, procPacote.id, dia, status],
  );
// A: avaliada 04/02, compra 06/02 (converte em 2 dias). B: avaliada, não compra.
// C: avaliação só agendada (não conta). D: comprou ANTES da avaliação (não converte).
await avaliacao(pA, "2030-02-04T09:00:00-03:00", "realizado");
await pacoteVendido(pA, "2030-02-06");
await avaliacao(pB, "2030-02-05T09:00:00-03:00", "realizado");
await avaliacao(pC, "2030-02-06T09:00:00-03:00", "agendado");
await pacoteVendido(pD, "2030-02-01");
await avaliacao(pD, "2030-02-07T09:00:00-03:00", "realizado");
await pacoteVendido(pB, "2030-02-03", "cancelado"); // cancelado não é venda nem conversão

const { rows: [funil] } = await cli.query(`select * from funil_avaliacao('2030-02-04', '2030-02-08')`);
checar(
  "funil: 3 avaliados, 1 comprou depois, 2 dias ate a compra",
  funil.avaliados === 3 && funil.compraram === 1 && Number(funil.dias_ate_compra) === 2,
  JSON.stringify(funil),
);
const { rows: vendasFunil } = await cli.query(
  `select tipo, dia::text, valor::numeric, canal from vendas_periodo('2030-02-01', '2030-02-08')
    where paciente_id = any($1::uuid[]) order by dia`,
  [[pA, pB, pC, pD]],
);
checar(
  "vendas: pacotes pelo valor liquido, cancelado e avaliacao fora",
  JSON.stringify(vendasFunil.map((v) => [v.tipo, v.dia, Number(v.valor), v.canal])) ===
    JSON.stringify([
      ["pacote", "2030-02-01", 800, "recepcao"],
      ["pacote", "2030-02-06", 800, "recepcao"],
    ]),
  JSON.stringify(vendasFunil),
);

await cli.query("rollback");
await cli.end();

console.log(`\n${passaram} passaram, ${falharam} falharam`);
process.exit(falharam > 0 ? 1 : 0);
