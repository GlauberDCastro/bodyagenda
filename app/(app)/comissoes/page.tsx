import Link from "next/link";
import {
  comissoesDetalhadas,
  competenciaAtual,
  competenciaVizinha,
  type ComissaoDetalhada,
} from "@/lib/consultas/financeiro";
import { Cartao } from "@/components/painel/indicadores";
import { Cabecalho, Etiqueta, Secao, Tabela, Td, Th, Tr, Vazio } from "@/components/ui/primitivos";
import { FecharCompetencia, PagarProfissional } from "./acoes-comissao";
import { perfilDoUsuario } from "@/lib/consultas/recursos";

export const metadata = { title: "Comissões" };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

const TOM: Record<ComissaoDetalhada["status"], "neutro" | "atencao" | "bom"> = {
  prevista: "neutro",
  apurada: "atencao",
  paga: "bom",
};
const ROTULO: Record<ComissaoDetalhada["status"], string> = {
  prevista: "Prevista",
  apurada: "Apurada",
  paga: "Paga",
};

const soma = (xs: ComissaoDetalhada[]) => xs.reduce((t, c) => t + Number(c.valor), 0);

/**
 * RF-85 / RF-98 · comissões da competência: por profissional, com a sessão de
 * cada uma. Prevista nasce quando a sessão é realizada; apurada quando a
 * competência é fechada; paga quando o pagamento é registrado.
 */
export default async function ComissoesPage(props: {
  searchParams: Promise<{ competencia?: string }>;
}) {
  const { competencia = competenciaAtual() } = await props.searchParams;
  const [comissoes, perfil] = await Promise.all([comissoesDetalhadas(competencia), perfilDoUsuario()]);
  // Fechar e pagar é do financeiro e do admin; os demais só consultam.
  const opera = perfil === "admin" || perfil === "financeiro";

  const porProfissional = new Map<string, { nome: string; linhas: ComissaoDetalhada[] }>();
  for (const c of comissoes) {
    const id = c.profissional?.id ?? "—";
    const grupo = porProfissional.get(id) ?? { nome: c.profissional?.nome ?? "—", linhas: [] };
    grupo.linhas.push(c);
    porProfissional.set(id, grupo);
  }
  const grupos = [...porProfissional.entries()].sort((a, b) => soma(b[1].linhas) - soma(a[1].linhas));
  const previstas = comissoes.filter((c) => c.status === "prevista");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Comissões</h1>
          <p className="text-sm text-[var(--tinta-3)]">
            Nascem quando a sessão é marcada como realizada. Fechar a competência congela o valor;
            depois registre o pagamento de cada profissional.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/comissoes?competencia=${competenciaVizinha(competencia, -1)}`}
            className="rounded-md border border-[var(--traco)] px-2 py-1 text-sm hover:bg-[var(--superficie-2)]"
            aria-label="Competência anterior"
          >
            ←
          </Link>
          <form method="get">
            <input
              type="month"
              name="competencia"
              defaultValue={competencia}
              aria-label="Competência"
              className="rounded-md border border-[var(--traco)] bg-[var(--superficie)] px-2 py-1 text-sm"
            />
          </form>
          <Link
            href={`/comissoes?competencia=${competenciaVizinha(competencia, 1)}`}
            className="rounded-md border border-[var(--traco)] px-2 py-1 text-sm hover:bg-[var(--superficie-2)]"
            aria-label="Próxima competência"
          >
            →
          </Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Cartao rotulo="Previstas" valor={brl.format(soma(previstas))} apoio={`${previstas.length} sessão(ões)`} />
        <Cartao
          rotulo="Apuradas a pagar"
          valor={brl.format(soma(comissoes.filter((c) => c.status === "apurada")))}
          destaque="atencao"
        />
        <Cartao
          rotulo="Pagas"
          valor={brl.format(soma(comissoes.filter((c) => c.status === "paga")))}
          destaque="bom"
        />
      </section>

      {comissoes.length === 0 ? (
        <Vazio>Nenhuma comissão em {competencia}.</Vazio>
      ) : (
        <>
          {opera && previstas.length > 0 && (
            <div className="flex justify-end">
              <FecharCompetencia competencia={competencia} />
            </div>
          )}
          {grupos.map(([id, g]) => {
            const aPagar = g.linhas.filter((c) => c.status !== "paga");
            return (
              <Secao
                key={id}
                titulo={g.nome}
                descricao={`${g.linhas.length} sessão(ões) · total ${brl.format(soma(g.linhas))}${
                  aPagar.length > 0 ? ` · a pagar ${brl.format(soma(aPagar))}` : " · tudo pago"
                }`}
                acao={
                  opera && aPagar.length > 0 && id !== "—" ? (
                    <PagarProfissional competencia={competencia} profissionalId={id} />
                  ) : undefined
                }
              >
                <Tabela>
                  <Cabecalho>
                    <Th>Sessão</Th>
                    <Th>Paciente</Th>
                    <Th>Procedimento</Th>
                    <Th alinhar="right">Base</Th>
                    <Th alinhar="right">Comissão</Th>
                    <Th>Situação</Th>
                  </Cabecalho>
                  <tbody>
                    {g.linhas.map((c) => (
                      <Tr key={c.id}>
                        <Td>{c.agendamento ? dataHora.format(new Date(c.agendamento.inicio)) : "—"}</Td>
                        <Td forte>{c.agendamento?.paciente?.nome ?? "—"}</Td>
                        <Td>{c.agendamento?.procedimento?.nome ?? "—"}</Td>
                        <Td alinhar="right">{brl.format(Number(c.base_calculo))}</Td>
                        <Td alinhar="right">
                          {brl.format(Number(c.valor))}
                          {c.percentual !== null && (
                            <span className="text-[var(--tinta-3)]"> · {Number(c.percentual)}%</span>
                          )}
                        </Td>
                        <Td>
                          <Etiqueta tom={TOM[c.status]}>{ROTULO[c.status]}</Etiqueta>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Tabela>
              </Secao>
            );
          })}
        </>
      )}
    </div>
  );
}
