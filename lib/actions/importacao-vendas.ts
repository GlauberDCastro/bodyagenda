"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

/** O navegador manda o plano já ligado ao catálogo; o servidor confere de novo. */
const itemSchema = z.object({
  chave: z.string().min(3).max(200),
  procedimento_id: z.uuid(),
  regiao_id: z.uuid().nullable(),
  sessoes: z.number().int().positive().max(100),
  valor: z.number().min(0).max(1_000_000),
});
const planoSchema = z.object({
  linha: z.number().int().positive(),
  cliente: z.string().trim().min(2).max(200),
  dataVenda: z.iso.date(),
  validade: z.iso.date().nullable(),
  vendedor_id: z.uuid().nullable(),
  forma: z.string().max(200),
  observacoes: z.string().max(4000),
  itens: z.array(itemSchema).min(1).max(20),
});
export type PlanoParaGravar = z.infer<typeof planoSchema>;

export interface ResultadoImportacao {
  importadas: number;
  jaImportadas: number;
  erros: { linha: number; motivo: string }[];
  erro?: string;
}

/** Chaves do lote que já foram importadas antes (para a prévia avisar). */
export async function vendasJaImportadas(chaves: string[]): Promise<string[]> {
  if (chaves.length === 0) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("pacote").select("id_externo").in("id_externo", chaves);
  return (data ?? []).map((p) => p.id_externo).filter((c): c is string => !!c);
}

export async function importarVendas(planos: PlanoParaGravar[]): Promise<ResultadoImportacao> {
  const resultado: ResultadoImportacao = { importadas: 0, jaImportadas: 0, erros: [] };
  const lista = z.array(planoSchema).max(500).safeParse(planos);
  if (!lista.success)
    return { ...resultado, erro: "Dados da importação inválidos. Recarregue o arquivo." };

  const supabase = await createServerSupabase();
  for (const p of lista.data) {
    const { data: pacienteId, error: ePac } = await supabase.rpc("paciente_da_importacao", {
      p_nome: p.cliente,
    });
    if (ePac || !pacienteId) {
      if (ePac?.code === "42501")
        return { ...resultado, erro: "Só administração e gestão importam vendas." };
      resultado.erros.push({
        linha: p.linha,
        motivo: `Paciente: ${ePac?.message ?? "não criado"}`,
      });
      continue;
    }
    for (const it of p.itens) {
      const { data, error } = await supabase.rpc("importar_venda", {
        p_id_externo: it.chave,
        p_paciente: pacienteId,
        p_procedimento: it.procedimento_id,
        p_regiao: it.regiao_id,
        p_sessoes: it.sessoes,
        p_valor: it.valor,
        p_data_venda: p.dataVenda,
        p_validade: p.validade,
        p_vendedor: p.vendedor_id,
        p_forma: p.forma,
        p_observacoes: p.observacoes,
      });
      if (error) resultado.erros.push({ linha: p.linha, motivo: error.message });
      else if (data) resultado.importadas++;
      else resultado.jaImportadas++;
    }
  }

  revalidatePath("/pacientes");
  revalidatePath("/gestao");
  revalidatePath("/");
  return resultado;
}
