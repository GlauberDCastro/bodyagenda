import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { listarProcedimentos } from "@/lib/consultas/recursos";
import { calcularMargem } from "@/lib/domain/margem";
import { AvisoBanco, Aviso, Etiqueta, Vazio } from "@/components/ui/primitivos";
import { brlExato, pct } from "@/components/painel/indicadores";
import { FormularioProcedimento } from "./formulario-procedimento";

export const metadata = { title: "Procedimentos" };

export default async function ProcedimentosPage() {
  const procedimentos = await listarProcedimentos();
  if (procedimentos.semSchema) return <AvisoBanco />;

  const supabase = await createServerSupabase();
  const [{ data: custos }, { data: habilitacoes }] = await Promise.all([
    supabase.from("procedimento_custo").select("procedimento_id, valor_unitario, quantidade"),
    supabase.from("profissional_habilitacao").select("procedimento_id"),
  ]);

  // Procedimento sem profissional habilitado nao pode ser agendado (RF-23a):
  // a agenda nao tem ninguem para oferecer. Vale avisar no cadastro, nao
  // deixar a recepcao descobrir na frente do paciente.
  const profissionaisPorProc = new Map<string, number>();
  for (const h of habilitacoes ?? []) {
    profissionaisPorProc.set(
      h.procedimento_id,
      (profissionaisPorProc.get(h.procedimento_id) ?? 0) + 1,
    );
  }

  const porProcedimento = new Map<string, { valor_unitario: number; quantidade: number }[]>();
  for (const c of custos ?? []) {
    const lista = porProcedimento.get(c.procedimento_id) ?? [];
    lista.push({ valor_unitario: Number(c.valor_unitario), quantidade: Number(c.quantidade) });
    porProcedimento.set(c.procedimento_id, lista);
  }

  const linhas = procedimentos.dados.map((p) => ({
    ...p,
    temCusto: (porProcedimento.get(p.id)?.length ?? 0) > 0,
    profissionais: profissionaisPorProc.get(p.id) ?? 0,
    margem: calcularMargem({
      valorSessao: Number(p.valor_sessao),
      duracaoMin: p.duracao_min,
      custos: porProcedimento.get(p.id) ?? [],
    }),
  }));

  const semCusto = linhas.filter((l) => !l.temCusto).length;
  const semProfissional = linhas.filter((l) => l.ativo && l.profissionais === 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-[var(--tinta-3)]">
          {linhas.filter((l) => l.ativo).length} procedimento(s) ativo(s)
        </p>
        <FormularioProcedimento />
      </div>

      {semProfissional.length > 0 && (
        <Aviso>
          <p className="font-semibold">
            {semProfissional.length} procedimento(s) sem profissional habilitado
          </p>
          <p className="mt-1">
            {semProfissional.map((l) => l.nome).join(", ")} — a agenda não tem
            ninguém para oferecer, então não é possível agendar. Habilite em
            Profissionais.
          </p>
        </Aviso>
      )}

      {semCusto > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {semCusto} procedimento(s) sem custo cadastrado. Enquanto o custo não entrar, a coluna de
          margem mostra a receita bruta — e nenhuma decisão de portfólio ou preço deve ser tomada
          sobre ela.
        </p>
      )}

      {linhas.length === 0 ? (
        <Vazio>Nenhum procedimento cadastrado.</Vazio>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--traco)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--traco)] text-left ">
              <tr className="text-[var(--tinta-3)]">
                <th className="px-4 py-2.5 font-medium">Procedimento</th>
                <th className="px-4 py-2.5 text-right font-medium">Duração</th>
                <th className="px-4 py-2.5 text-right font-medium">Sessões</th>
                <th className="px-4 py-2.5 text-right font-medium">Valor</th>
                <th className="px-4 py-2.5 text-right font-medium">Custo</th>
                <th className="px-4 py-2.5 text-right font-medium">Margem</th>
                <th className="px-4 py-2.5 text-right font-medium">Margem/hora</th>
                <th className="px-4 py-2.5 text-right font-medium">Equipe</th>
                <th className="px-4 py-2.5 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {[...linhas]
                .sort((a, b) => (b.margem.margemPorHora ?? 0) - (a.margem.margemPorHora ?? 0))
                .map((p) => (
                  <tr key={p.id} className="border-b border-[var(--traco)] last:border-0 ">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/configuracoes/procedimentos/${p.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {p.nome}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {p.duracao_min} min
                      {p.buffer_min > 0 && (
                        <span className="text-[var(--tinta-3)]"> +{p.buffer_min}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{p.sessoes_padrao}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {brlExato.format(Number(p.valor_sessao))}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {p.temCusto ? (
                        brlExato.format(p.margem.custoDireto)
                      ) : (
                        <span className="text-[color:var(--status-atencao)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {brlExato.format(p.margem.margem)}
                      <span className="ml-1 text-xs text-[var(--tinta-3)]">
                        {pct(p.margem.margemPct)}
                      </span>
                    </td>
                    {/* Ordenação padrão da tabela: é o indicador que compara
 procedimentos de durações diferentes (RN-04). */}
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                      {p.margem.margemPorHora === null
                        ? "—"
                        : brlExato.format(p.margem.margemPorHora)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {p.profissionais === 0 ? (
                        <Etiqueta tom="atencao">nenhuma</Etiqueta>
                      ) : (
                        p.profissionais
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Etiqueta tom={p.ativo ? "bom" : "neutro"}>
                        {p.ativo ? "Ativo" : "Inativo"}
                      </Etiqueta>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-[var(--tinta-3)]">
        Ordenado por margem por hora. Alterar valor ou custo aqui não muda pacotes já vendidos nem
        sessões realizadas — esses guardam o preço do momento da venda.
      </p>
    </div>
  );
}
