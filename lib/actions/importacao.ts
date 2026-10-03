"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { cpfValido } from "@/lib/domain/cpf";
import { chaveHomonimo, LOTE_IMPORTACAO, type PacienteImportado } from "@/lib/importacao/pacientes";

/** O navegador manda dados já normalizados; o servidor confere de novo. */
const registroSchema = z.object({
  linha: z.number().int().positive(),
  nome: z.string().trim().min(2).max(200),
  cpf: z
    .string()
    .regex(/^\d{11}$/)
    .refine(cpfValido)
    .nullable(),
  telefone: z.string().max(40).nullable(),
  email: z.email().max(200).nullable(),
  data_nascimento: z.iso.date().nullable(),
  endereco: z.string().max(500).nullable(),
  observacoes: z.string().max(2000).nullable(),
});

export interface Pulado {
  linha: number;
  motivo: string;
}

const normalizarNome = (n: string) => chaveHomonimo(n, "x") ?? n;

/**
 * Quem do lote já está cadastrado: mesmo CPF; sem CPF, mesmo nome e
 * nascimento; sem nenhum dos dois, mesmo nome. Reimportar a mesma planilha
 * não duplica ninguém.
 */
async function jaCadastrados(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  registros: PacienteImportado[],
): Promise<Map<number, string>> {
  const cpfs = registros.map((r) => r.cpf).filter((c): c is string => !!c);
  const nomes = [...new Set(registros.map((r) => r.nome))];
  const [{ data: porCpf }, { data: porNome }] = await Promise.all([
    cpfs.length
      ? supabase.from("paciente").select("cpf, nome").in("cpf", cpfs)
      : Promise.resolve({ data: [] as { cpf: string | null; nome: string }[] }),
    supabase.from("paciente").select("nome, data_nascimento, cpf").in("nome", nomes),
  ]);

  const cpfExistente = new Map((porCpf ?? []).map((p) => [p.cpf, p.nome]));
  const chaves = new Set(
    (porNome ?? []).map((p) => chaveHomonimo(p.nome, p.data_nascimento)).filter(Boolean),
  );
  const nomesExistentes = new Set((porNome ?? []).map((p) => normalizarNome(p.nome)));

  const motivos = new Map<number, string>();
  for (const r of registros) {
    if (r.cpf && cpfExistente.has(r.cpf)) {
      motivos.set(r.linha, `CPF já cadastrado (${cpfExistente.get(r.cpf)})`);
    } else if (!r.cpf && chaves.has(chaveHomonimo(r.nome, r.data_nascimento))) {
      motivos.set(r.linha, "Já cadastrado com o mesmo nome e nascimento");
    } else if (!r.cpf && !r.data_nascimento && nomesExistentes.has(normalizarNome(r.nome))) {
      motivos.set(r.linha, "Nome já cadastrado, sem CPF nem nascimento para diferenciar");
    }
  }
  return motivos;
}

function validar(registros: unknown): { validos: PacienteImportado[]; pulados: Pulado[] } {
  const lista = Array.isArray(registros) ? registros.slice(0, LOTE_IMPORTACAO) : [];
  const validos: PacienteImportado[] = [];
  const pulados: Pulado[] = [];
  for (const r of lista) {
    const ok = registroSchema.safeParse(r);
    if (ok.success) validos.push(ok.data);
    else
      pulados.push({
        linha: Number((r as { linha?: number })?.linha) || 0,
        motivo: "Dados inválidos",
      });
  }
  return { validos, pulados };
}

/** Prévia: quais linhas do lote já existem no cadastro. Não grava nada. */
export async function conferirImportacao(registros: PacienteImportado[]): Promise<Pulado[]> {
  const { validos, pulados } = validar(registros);
  const supabase = await createServerSupabase();
  const existentes = await jaCadastrados(supabase, validos);
  return [...pulados, ...[...existentes].map(([linha, motivo]) => ({ linha, motivo }))];
}

/**
 * Grava um lote. Confere duplicados de novo (outra pessoa pode ter
 * cadastrado alguém entre a prévia e agora) e passa pelo RLS de quem importa.
 */
export async function importarPacientes(
  registros: PacienteImportado[],
): Promise<{ inseridos: number; pulados: Pulado[]; erro?: string }> {
  const { validos, pulados } = validar(registros);
  const supabase = await createServerSupabase();
  const existentes = await jaCadastrados(supabase, validos);
  for (const [linha, motivo] of existentes) pulados.push({ linha, motivo });

  const novos = validos.filter((r) => !existentes.has(r.linha));
  if (novos.length === 0) return { inseridos: 0, pulados };

  const linhaDoBanco = ({ linha: _l, ...r }: PacienteImportado) => ({
    ...r,
    consentimento_lgpd: false,
  });
  const { error } = await supabase.from("paciente").insert(novos.map(linhaDoBanco));

  if (error?.code === "42501" || error?.message.includes("row-level security")) {
    return { inseridos: 0, pulados, erro: "Seu perfil não pode cadastrar pacientes." };
  }

  let inseridos = novos.length;
  if (error) {
    // Um registro ruim derruba o lote inteiro: refaz um a um para salvar o resto.
    inseridos = 0;
    for (const r of novos) {
      const { error: e } = await supabase.from("paciente").insert(linhaDoBanco(r));
      if (e)
        pulados.push({
          linha: r.linha,
          motivo: e.code === "23505" ? "CPF já cadastrado" : "Não foi possível gravar",
        });
      else inseridos++;
    }
  }

  revalidatePath("/pacientes");
  return { inseridos, pulados };
}
