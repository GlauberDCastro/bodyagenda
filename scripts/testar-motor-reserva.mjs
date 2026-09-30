#!/usr/bin/env node
/**
 * Prova o motor de reserva contra o Postgres real.
 *
 * Estes casos não dão para verificar clicando na tela — sobretudo o CA-13,
 * que é o requisito mais caro do sistema se estiver errado: duas
 * recepcionistas salvando ao mesmo tempo o mesmo aparelho.
 *
 * Roda em transação e faz rollback no fim: não suja o banco.
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

const URL = process.env.DATABASE_URL;
if (!URL) {
  console.error("DATABASE_URL ausente.");
  process.exit(1);
}

const conectar = async () => {
  const c = new pg.Client({ connectionString: URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
};

let passaram = 0;
let falharam = 0;

function checar(rotulo, condicao, detalhe = "") {
  if (condicao) {
    passaram++;
    console.log(`  PASSOU  ${rotulo}`);
  } else {
    falharam++;
    console.log(`  FALHOU  ${rotulo}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

const cli = await conectar();

// ── Massa de teste ───────────────────────────────────────────────────────────
await cli.query("begin");

const { rows: [paciente] } = await cli.query(
  `insert into paciente (nome, cpf) values ('Paciente Teste', '00000000191')
   returning id`,
);
const { rows: [proc] } = await cli.query(
  `select id, duracao_min from procedimento where nome = 'Ultraformer Olhos'`,
);
const { rows: [sala] } = await cli.query(`select id from sala where numero = 2`);
const { rows: equipamentos } = await cli.query(
  `select id, nome from equipamento where modelo = 'Ultraformer' order by nome`,
);

console.log(`\nmassa: procedimento ${proc.duracao_min}min, ${equipamentos.length} Ultraformer\n`);

// Terça-feira 14:00 — dentro do expediente seg-sex 08:00-18:00 do seed.
const QUANDO = "2026-10-06T14:00:00-03:00";

console.log("-- RN-01 · conflito de recurso --");

const { rows: [ag1] } = await cli.query(
  `select criar_agendamento($1,$2,$3::timestamptz,$4,$5::uuid[],'{}'::uuid[]) as id`,
  [paciente.id, proc.id, QUANDO, sala.id, [equipamentos[0].id]],
);
checar("primeiro agendamento criado", !!ag1.id);

const { rows: reservas } = await cli.query(
  `select recurso_tipo from reserva where agendamento_id = $1 order by recurso_tipo`,
  [ag1.id],
);
checar(
  "reserva gerada por trigger para sala e equipamento",
  reservas.length === 2,
  `gerou ${reservas.length}`,
);

// CA-01 · mesmo equipamento, mesmo horário
let conflitou = false;
try {
  await cli.query("savepoint s1");
  await cli.query(
    `select criar_agendamento($1,$2,$3::timestamptz,$4,$5::uuid[],'{}'::uuid[])`,
    [paciente.id, proc.id, QUANDO, sala.id, [equipamentos[0].id]],
  );
} catch (e) {
  conflitou = e.code === "23P01";
  await cli.query("rollback to savepoint s1");
}
checar("CA-01 · mesmo equipamento no mesmo horario e recusado (23P01)", conflitou);

// Outra unidade do mesmo modelo deve passar — é o que os 4 Ultraformer compram
let outraUnidade = false;
try {
  await cli.query("savepoint s2");
  const { rows: [ag] } = await cli.query(
    `select criar_agendamento($1,$2,$3::timestamptz,$4,$5::uuid[],'{}'::uuid[]) as id`,
    [paciente.id, proc.id, QUANDO, sala.id, [equipamentos[1].id]],
  );
  outraUnidade = !!ag.id;
  await cli.query("rollback to savepoint s2");
} catch (e) {
  await cli.query("rollback to savepoint s2");
  outraUnidade = false;
  console.log(`    (erro: ${e.message})`);
}
// A sala 2 tambem esta reservada, entao isto DEVE falhar por causa da sala.
checar("sala ocupada bloqueia mesmo com outro equipamento", !outraUnidade);

// Encosto: 14:20 logo apos um atendimento que termina 14:20
let encostou = false;
try {
  await cli.query("savepoint s3");
  const { rows: [ag] } = await cli.query(
    `select criar_agendamento($1,$2,$3::timestamptz,$4,$5::uuid[],'{}'::uuid[]) as id`,
    [paciente.id, proc.id, "2026-10-06T14:20:00-03:00", sala.id, [equipamentos[0].id]],
  );
  encostou = !!ag.id;
  await cli.query("rollback to savepoint s3");
} catch (e) {
  await cli.query("rollback to savepoint s3");
  console.log(`    (erro: ${e.message})`);
}
checar("RN-01 · intervalo semiaberto: 14:20 nao conflita com quem termina 14:20", encostou);

console.log("\n-- RF-47 · disponibilidade e bloqueio --");

// CA-02 · fora do expediente (domingo)
let foraDoHorario = false;
try {
  await cli.query("savepoint s4");
  await cli.query(
    `select criar_agendamento($1,$2,$3::timestamptz,$4,$5::uuid[],'{}'::uuid[])`,
    [paciente.id, proc.id, "2026-10-04T14:00:00-03:00", sala.id, [equipamentos[2].id]],
  );
} catch (e) {
  foraDoHorario = e.code === "23514";
  await cli.query("rollback to savepoint s4");
}
checar("CA-02 · domingo (fora da janela) e recusado", foraDoHorario);

// CA-03 · sobre bloqueio de manutencao
await cli.query(
  `insert into recurso_bloqueio (recurso_tipo, recurso_id, inicio, fim, motivo)
   values ('equipamento', $1, '2026-10-07T08:00:00-03:00', '2026-10-07T18:00:00-03:00', 'manutencao')`,
  [equipamentos[2].id],
);
let sobreBloqueio = false;
try {
  await cli.query("savepoint s5");
  await cli.query(
    `select criar_agendamento($1,$2,$3::timestamptz,$4,$5::uuid[],'{}'::uuid[])`,
    [paciente.id, proc.id, "2026-10-07T14:00:00-03:00", sala.id, [equipamentos[2].id]],
  );
} catch (e) {
  sobreBloqueio = e.code === "23514";
  await cli.query("rollback to savepoint s5");
}
checar("CA-03 · manutencao do aparelho bloqueia agendamento", sobreBloqueio);

console.log("\n-- RN-02 / RN-03 · capacidade e ocupacao --");

const { rows: [cap] } = await cli.query(
  `select capacidade_recurso('equipamento', $1,
     '2026-10-05T00:00:00-03:00', '2026-10-09T23:59:59-03:00') as c`,
  [equipamentos[3].id],
);
// Seg a sex, 10h/dia. A janela cobre seg(5) a sex(9) = 5 dias uteis = 50h.
checar(
  "capacidade de 5 dias uteis = 50h",
  cap.c && cap.c.hours === 50,
  `veio ${JSON.stringify(cap.c)}`,
);

const { rows: [capBloqueada] } = await cli.query(
  `select capacidade_recurso('equipamento', $1,
     '2026-10-05T00:00:00-03:00', '2026-10-09T23:59:59-03:00') as c`,
  [equipamentos[2].id],
);
checar(
  "CA-09 · bloqueio de 1 dia reduz capacidade para 40h",
  capBloqueada.c && capBloqueada.c.hours === 40,
  `veio ${JSON.stringify(capBloqueada.c)}`,
);

const { rows: [ocup] } = await cli.query(
  `select * from ocupacao_recurso('equipamento', $1,
     '2026-10-06T00:00:00-03:00', '2026-10-06T23:59:59-03:00')`,
  [equipamentos[0].id],
);
checar(
  "ocupacao agendada > 0 com um atendimento no dia",
  Number(ocup.taxa_agendada) > 0,
  `taxa ${ocup.taxa_agendada}`,
);
checar(
  "ocupacao efetiva = 0 enquanto o status e 'agendado'",
  Number(ocup.taxa_efetiva) === 0,
  `taxa ${ocup.taxa_efetiva}`,
);

// RN-03 · falta conta como agendada, nao como efetiva
await cli.query(`update agendamento set status = 'falta' where id = $1`, [ag1.id]);
const { rows: [ocupFalta] } = await cli.query(
  `select * from ocupacao_recurso('equipamento', $1,
     '2026-10-06T00:00:00-03:00', '2026-10-06T23:59:59-03:00')`,
  [equipamentos[0].id],
);
checar(
  "RN-03 · falta mantem ocupacao agendada",
  Number(ocupFalta.taxa_agendada) > 0,
  `taxa ${ocupFalta.taxa_agendada}`,
);
checar("RN-03 · falta nao entra na ocupacao efetiva", Number(ocupFalta.taxa_efetiva) === 0);

// CA-08 · cancelar libera o horario
await cli.query(`update agendamento set status = 'cancelado' where id = $1`, [ag1.id]);
const { rows: [aposCancelar] } = await cli.query(
  `select count(*)::int as c from reserva where agendamento_id = $1 and ativo`,
  [ag1.id],
);
checar("CA-08 · cancelar desativa as reservas", aposCancelar.c === 0);

let reagendou = false;
try {
  await cli.query("savepoint s6");
  const { rows: [ag] } = await cli.query(
    `select criar_agendamento($1,$2,$3::timestamptz,$4,$5::uuid[],'{}'::uuid[]) as id`,
    [paciente.id, proc.id, QUANDO, sala.id, [equipamentos[0].id]],
  );
  reagendou = !!ag.id;
  await cli.query("rollback to savepoint s6");
} catch (e) {
  await cli.query("rollback to savepoint s6");
  console.log(`    (erro: ${e.message})`);
}
checar("CA-08 · horario cancelado volta a ficar disponivel", reagendou);

await cli.query("rollback");
await cli.end();

// ── CA-13 · concorrência real, em conexões separadas ────────────────────────
console.log("\n-- CA-13 · concorrencia (duas conexoes simultaneas) --");

const preparar = await conectar();
const { rows: [p2] } = await preparar.query(
  `insert into paciente (nome, cpf) values ('Paciente Concorrencia', '00000000272')
   returning id`,
);
const { rows: [pr2] } = await preparar.query(
  `select id from procedimento where nome = 'Ultraformer Papada'`,
);
const { rows: [s3] } = await preparar.query(`select id from sala where numero = 3`);
const { rows: [e3] } = await preparar.query(
  `select id from equipamento where nome = 'Ultraformer #3'`,
);
await preparar.end();

const N = 8;
const QUANDO2 = "2026-10-08T10:00:00-03:00";

const tentativas = await Promise.allSettled(
  Array.from({ length: N }, async () => {
    const c = await conectar();
    try {
      const { rows } = await c.query(
        `select criar_agendamento($1,$2,$3::timestamptz,$4,$5::uuid[],'{}'::uuid[]) as id`,
        [p2.id, pr2.id, QUANDO2, s3.id, [e3.id]],
      );
      return rows[0].id;
    } finally {
      await c.end();
    }
  }),
);

const sucessos = tentativas.filter((t) => t.status === "fulfilled");
const conflitos = tentativas.filter(
  (t) => t.status === "rejected" && t.reason?.code === "23P01",
);
const outros = tentativas.filter(
  (t) => t.status === "rejected" && t.reason?.code !== "23P01",
);

console.log(`  ${N} tentativas simultaneas no mesmo Ultraformer e horario`);
console.log(`  ${sucessos.length} persistiram, ${conflitos.length} receberam 23P01, ${outros.length} outros erros`);
for (const o of outros) console.log(`    erro inesperado: ${o.reason?.message}`);

checar("CA-13 · exatamente UMA reserva persiste sob concorrencia", sucessos.length === 1);
checar("CA-13 · as demais recebem exclusion_violation", conflitos.length === N - 1);

// Limpeza
const limpar = await conectar();
await limpar.query(
  `delete from agendamento where paciente_id = $1`, [p2.id],
);
await limpar.query(`delete from paciente where id = $1`, [p2.id]);
await limpar.end();

console.log(`\n${passaram} passaram, ${falharam} falharam`);
process.exit(falharam > 0 ? 1 : 0);
