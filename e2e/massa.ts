import { readFileSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import pg from "pg";

const RAIZ = join(__dirname, "..");
const ARQUIVO = join(__dirname, ".massa.json");

/** Segunda-feira longe o bastante para nunca colidir com agenda real. */
export const DIA = "2030-01-07";

export interface Massa {
  email: string;
  senha: string;
  usuarioId: string;
  /** Gestão: configura horários e bloqueios, que a recepção não pode. */
  gestao: { email: string; senha: string; usuarioId: string };
  paciente: string;
  /** Nome que NÃO existe no banco: o E2E o cadastra pelo agendamento. */
  pacienteNovo: string;
  procedimento: string;
  sala: string;
  salaId: string;
  procedimentoId: string;
  /** Dois profissionais habilitados no procedimento, para trocar arrastando. */
  profissionais: { id: string; nome: string }[];
}

function env(): Record<string, string> {
  const vars: Record<string, string> = { ...(process.env as Record<string, string>) };
  const arquivo = join(RAIZ, ".env.local");
  if (existsSync(arquivo)) {
    for (const linha of readFileSync(arquivo, "utf8").split("\n")) {
      const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !vars[m[1]]) vars[m[1]] = m[2];
    }
  }
  return vars;
}

async function conectar() {
  const c = new pg.Client({
    connectionString: env().DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  return c;
}

async function authAdmin(caminho: string, metodo = "GET", corpo?: unknown) {
  const e = env();
  const r = await fetch(`${e.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/${caminho}`, {
    method: metodo,
    headers: {
      apikey: e.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { ok: r.ok, status: r.status, dados: await r.json().catch(() => null) };
}

async function criarUsuario(db: pg.Client, sufixo: string, perfil: string, nome: string) {
  const email = `teste-e2e-${perfil}-${sufixo}@exemplo.invalid`;
  const senha = randomBytes(18).toString("base64url");
  const criado = await authAdmin("users", "POST", { email, password: senha, email_confirm: true });
  if (!criado.ok) throw new Error(`criar usuario e2e ${perfil}: HTTP ${criado.status}`);
  const usuarioId: string = criado.dados.id;
  await db.query(
    `insert into usuario (id, nome, email, perfil, ativo) values ($1, $2, $3, $4, true)`,
    [usuarioId, nome, email, perfil],
  );
  return { email, senha, usuarioId };
}

export async function criarMassa(): Promise<Massa> {
  const sufixo = randomBytes(3).toString("hex");
  const db = await conectar();
  try {
    const { email, senha, usuarioId } = await criarUsuario(db, sufixo, "recepcao", "Recepção E2E");
    const gestao = await criarUsuario(db, sufixo, "gestao", "Gestão E2E");
    const nomeSala = `TESTE E2E ${sufixo}`;
    const {
      rows: [sala],
    } = await db.query(
      `insert into sala (numero, nome)
       values ((select coalesce(max(numero), 0) + 900 from sala), $1) returning id, numero`,
      [nomeSala],
    );
    await db.query(
      `insert into recurso_disponibilidade (recurso_tipo, recurso_id, dia_semana, hora_inicio, hora_fim)
       select 'sala', $1, d, '08:00', '18:00' from generate_series(1, 5) d`,
      [sala.id],
    );
    const procedimento = `TESTE E2E ${sufixo}`;
    const {
      rows: [proc],
    } = await db.query(
      `insert into procedimento (nome, duracao_min, valor_sessao) values ($1, 30, 300) returning id`,
      [procedimento],
    );
    const profissionais: { id: string; nome: string }[] = [];
    for (const letra of ["A", "B"]) {
      const nome = `TESTE E2E Prof ${letra} ${sufixo}`;
      const {
        rows: [p],
      } = await db.query(`insert into profissional (nome) values ($1) returning id`, [nome]);
      await db.query(
        `insert into profissional_habilitacao (profissional_id, procedimento_id) values ($1, $2)`,
        [p.id, proc.id],
      );
      await db.query(
        `insert into recurso_disponibilidade (recurso_tipo, recurso_id, dia_semana, hora_inicio, hora_fim)
         select 'profissional', $1, d, '08:00', '18:00' from generate_series(1, 5) d`,
        [p.id],
      );
      profissionais.push({ id: p.id, nome });
    }

    const paciente = `Paciente E2E ${sufixo}`;
    await db.query(`insert into paciente (nome) values ($1)`, [paciente]);

    const massa: Massa = {
      email,
      senha,
      usuarioId,
      gestao,
      paciente,
      pacienteNovo: `Paciente Novo E2E ${sufixo}`,
      procedimento,
      sala: `Sala ${sala.numero} — ${nomeSala}`,
      salaId: sala.id,
      procedimentoId: proc.id,
      profissionais,
    };
    writeFileSync(ARQUIVO, JSON.stringify(massa));
    return massa;
  } finally {
    await db.end();
  }
}

export function lerMassa(): Massa {
  return JSON.parse(readFileSync(ARQUIVO, "utf8"));
}

export async function horarioDaSala(m: Massa): Promise<string[]> {
  const db = await conectar();
  try {
    const { rows } = await db.query(
      `select dia_semana || ' ' || hora_inicio || '-' || hora_fim as j
         from recurso_disponibilidade where recurso_id = $1 order by dia_semana`,
      [m.salaId],
    );
    return rows.map((r) => r.j);
  } finally {
    await db.end();
  }
}

/** Início de cada atendimento da massa, "HH:MM" no horário da clínica. */
export async function iniciosDosAgendamentos(m: Massa): Promise<string[]> {
  const db = await conectar();
  try {
    const { rows } = await db.query(
      `select to_char(inicio at time zone 'America/Sao_Paulo', 'HH24:MI') as h
         from agendamento where procedimento_id = $1 order by inicio`,
      [m.procedimentoId],
    );
    return rows.map((r) => r.h);
  } finally {
    await db.end();
  }
}

/** Profissionais do atendimento que começa nesse horário ("HH:MM"). */
export async function profissionaisNoHorario(m: Massa, hhmm: string): Promise<string[]> {
  const db = await conectar();
  try {
    const { rows } = await db.query(
      `select p.nome from agendamento a
         join agendamento_profissional ap on ap.agendamento_id = a.id
         join profissional p on p.id = ap.profissional_id
        where a.procedimento_id = $1
          and to_char(a.inicio at time zone 'America/Sao_Paulo', 'HH24:MI') = $2`,
      [m.procedimentoId, hhmm],
    );
    return rows.map((r) => r.nome);
  } finally {
    await db.end();
  }
}

/** Atendimentos de um paciente pelo nome — para o paciente criado no E2E. */
export async function agendamentosDoPaciente(nome: string): Promise<number> {
  const db = await conectar();
  try {
    const { rows } = await db.query(
      `select count(*)::int as n from agendamento a join paciente p on p.id = a.paciente_id
        where p.nome = $1`,
      [nome],
    );
    return rows[0].n;
  } finally {
    await db.end();
  }
}

export async function statusDoAgendamento(m: Massa): Promise<string[]> {
  const db = await conectar();
  try {
    const { rows } = await db.query(
      `select status from agendamento where procedimento_id = $1 order by inicio`,
      [m.procedimentoId],
    );
    return rows.map((r) => r.status);
  } finally {
    await db.end();
  }
}

export async function apagarMassa() {
  if (!existsSync(ARQUIVO)) return;
  const m = lerMassa();
  const db = await conectar();
  try {
    await db.query(`delete from agendamento where procedimento_id = $1`, [m.procedimentoId]);
    await db.query(`delete from paciente where nome = any($1::text[])`, [
      [m.paciente, m.pacienteNovo].filter(Boolean),
    ]);
    const profIds = (m.profissionais ?? []).map((p) => p.id);
    await db.query(`delete from recurso_disponibilidade where recurso_id = any($1::uuid[])`, [
      [m.salaId, ...profIds],
    ]);
    await db.query(`delete from profissional where id = any($1::uuid[])`, [profIds]);
    await db.query(`delete from recurso_bloqueio where recurso_id = $1`, [m.salaId]);
    await db.query(`delete from sala where id = $1`, [m.salaId]);
    await db.query(`delete from procedimento where id = $1`, [m.procedimentoId]);
    // A auditoria referencia o usuário: as linhas do teste saem junto.
    const ids = [m.usuarioId, m.gestao?.usuarioId].filter(Boolean);
    await db.query(`delete from auditoria where usuario_id = any($1::uuid[])`, [ids]);
    await db.query(`delete from usuario where id = any($1::uuid[])`, [ids]);
  } finally {
    await db.end();
  }
  for (const id of [m.usuarioId, m.gestao?.usuarioId].filter(Boolean)) {
    await authAdmin(`users/${id}`, "DELETE");
  }
  rmSync(ARQUIVO);
}
