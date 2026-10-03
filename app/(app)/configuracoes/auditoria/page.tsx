import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { diferencas, rotuloDoRegistro } from "@/lib/auditoria";
import { Cabecalho, Etiqueta, Tabela, Td, Th, Tr, Vazio } from "@/components/ui/primitivos";

export const metadata = { title: "Auditoria" };

const ENTIDADES: Record<string, string> = {
  agendamento: "Agendamento",
  paciente: "Paciente",
  pacote: "Pacote",
  lancamento: "Cobrança / lançamento",
  comissao: "Bonificação",
  despesa_fixa: "Despesa fixa",
  procedimento: "Procedimento",
  procedimento_custo: "Custo de procedimento",
  procedimento_requisito: "Requisito de procedimento",
  procedimento_regiao: "Região de procedimento",
  sala: "Sala",
  equipamento: "Equipamento",
  equipamento_custo: "Custo de equipamento",
  profissional: "Profissional",
  profissional_remuneracao: "Remuneração",
  recurso_disponibilidade: "Horário",
  recurso_bloqueio: "Bloqueio",
  usuario: "Usuário",
};
const ACAO: Record<string, { rotulo: string; tom: "bom" | "neutro" | "critico" }> = {
  criar: { rotulo: "Criou", tom: "bom" },
  editar: { rotulo: "Editou", tom: "neutro" },
  excluir: { rotulo: "Excluiu", tom: "critico" },
};
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/Sao_Paulo",
});
const valor = (v: unknown) =>
  v === null || v === undefined ? "vazio" : typeof v === "object" ? JSON.stringify(v) : String(v);

/** RF-06 · quem criou, editou ou excluiu o quê, e quando. */
export default async function AuditoriaPage(props: {
  searchParams: Promise<{ entidade?: string }>;
}) {
  const { entidade } = await props.searchParams;
  const supabase = await createServerSupabase();
  let q = supabase
    .from("auditoria")
    .select("id, entidade, acao, created_at, dados_anteriores, dados_novos, usuario:usuario_id (nome)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (entidade) q = q.eq("entidade", entidade);
  const { data } = await q;
  const eventos = (data ?? []) as unknown as {
    id: number;
    entidade: string;
    acao: string;
    created_at: string;
    dados_anteriores: Record<string, unknown> | null;
    dados_novos: Record<string, unknown> | null;
    usuario: { nome: string } | null;
  }[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="text-sm text-[var(--tinta-3)]">
          Últimos 200 registros. Visível só para o administrador.
        </p>
        <form method="get" className="flex items-center gap-2">
          <select
            name="entidade"
            defaultValue={entidade ?? ""}
            aria-label="Filtrar por tipo de registro"
            className="rounded-full border border-[var(--traco)] bg-[var(--superficie)] px-3 py-1 text-sm"
          >
            <option value="">Todos os registros</option>
            {Object.entries(ENTIDADES).map(([k, r]) => (
              <option key={k} value={k}>
                {r}
              </option>
            ))}
          </select>
          <button type="submit" className="text-sm text-[var(--tinta-2)] hover:text-[var(--tinta-1)]">
            Filtrar
          </button>
          {entidade && (
            <Link href="/configuracoes/auditoria" className="text-sm text-[var(--tinta-3)] hover:underline">
              Limpar
            </Link>
          )}
        </form>
      </div>

      {eventos.length === 0 ? (
        <Vazio>Nenhum registro de auditoria (ou seu perfil não tem acesso a ela).</Vazio>
      ) : (
        <Tabela>
          <Cabecalho>
            <Th>Quando</Th>
            <Th>Quem</Th>
            <Th>O quê</Th>
            <Th>Registro</Th>
            <Th>Mudanças</Th>
          </Cabecalho>
          <tbody>
            {eventos.map((e) => {
              const mudancas = diferencas(e.dados_anteriores, e.dados_novos);
              const acao = ACAO[e.acao] ?? { rotulo: e.acao, tom: "neutro" as const };
              return (
                <Tr key={e.id}>
                  <Td>{dataHora.format(new Date(e.created_at))}</Td>
                  <Td forte>{e.usuario?.nome ?? "—"}</Td>
                  <Td>
                    <Etiqueta tom={acao.tom}>{acao.rotulo}</Etiqueta>{" "}
                    {ENTIDADES[e.entidade] ?? e.entidade}
                  </Td>
                  <Td>{rotuloDoRegistro(e.dados_novos ?? e.dados_anteriores)}</Td>
                  <Td>
                    {mudancas.length === 0 ? (
                      "—"
                    ) : (
                      <ul className="space-y-0.5 text-[12.5px]">
                        {mudancas.slice(0, 6).map((m) => (
                          <li key={m.campo}>
                            <span className="text-[var(--tinta-3)]">{m.campo}:</span>{" "}
                            {valor(m.antes)} → {valor(m.depois)}
                          </li>
                        ))}
                        {mudancas.length > 6 && (
                          <li className="text-[var(--tinta-3)]">+{mudancas.length - 6} campo(s)</li>
                        )}
                      </ul>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Tabela>
      )}
    </div>
  );
}
