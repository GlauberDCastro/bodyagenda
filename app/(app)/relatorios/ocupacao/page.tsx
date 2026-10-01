import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  carregarPainel,
  consolidar,
  hojeNaClinica,
  resolverPeriodo,
  type Periodo,
} from "@/lib/consultas/painel";
import { faltasECancelamentos } from "@/lib/consultas/relatorios";
import { SeletorPeriodo } from "@/components/relatorios/seletor-periodo";
import { Cabecalho, Secao, Tabela, Td, Th, Tr } from "@/components/ui/primitivos";
import { Vazio } from "@/components/ui/primitivos";
import { Cartao, TabelaRecursos, brl, pct, horas } from "@/components/painel/indicadores";
import type { TipoRecurso } from "@/lib/types/database";

export const metadata = { title: "Relatórios de ocupação" };

interface Vaga {
  inicio: string;
  fim: string;
  minutos: number;
  recurso: string;
}

/**
 * RF-91 · janelas vagas por recurso, ordenadas por tamanho.
 * É insumo comercial direto: diz onde exatamente encaixar mais um paciente.
 */
async function janelasVagas(
  tipo: TipoRecurso,
  recursos: { recurso_id: string; nome: string }[],
  periodo: Periodo,
): Promise<Vaga[]> {
  const supabase = await createServerSupabase();

  // RF-19a/91 · todos os recursos, sem teto fixo no código.
  const porRecurso = await Promise.all(
    recursos.map(async (r) => {
      const { data } = await supabase.rpc("janelas_vagas", {
        p_tipo: tipo,
        p_id: r.recurso_id,
        p_inicio: periodo.inicio.toISOString(),
        p_fim: periodo.fim.toISOString(),
        p_min_minutos: 30,
      });
      return (data ?? []).map((v) => ({
        ...v,
        recurso: r.nome,
      }));
    }),
  );

  return porRecurso.flat().sort((a, b) => b.minutos - a.minutos);
}

/** A tabela mostra as maiores; o total aparece no texto. */
const VAGAS_EXIBIDAS = 100;

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export default async function OcupacaoPage(props: {
  searchParams: Promise<{ por?: string; de?: string; ate?: string }>;
}) {
  const { por = "sala", de, ate } = await props.searchParams;
  const tipo = (
    ["sala", "equipamento", "profissional"].includes(por) ? por : "sala"
  ) as TipoRecurso;
  const periodo = resolverPeriodo(de, ate);

  const painel = await carregarPainel(tipo, periodo);
  const total = consolidar(painel.linhas);
  const [vagas, ausencias] = await Promise.all([
    janelasVagas(tipo, painel.linhas, periodo),
    faltasECancelamentos(periodo.inicio, periodo.fim),
  ]);
  const horasVagas = vagas.reduce((t, v) => t + v.minutos, 0) / 60;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Relatórios de ocupação</h1>
          <p className="text-sm text-[var(--tinta-3)]">{periodo.rotulo}</p>
        </div>
        <Link href="/" className="text-sm underline-offset-4 hover:underline">
          ← Painel
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <nav className="flex gap-0.5 rounded-full bg-[var(--superficie)] p-1 shadow-[var(--sombra-1)]">
          {(
            [
              ["sala", "Salas"],
              ["equipamento", "Equipamentos"],
              ["profissional", "Profissionais"],
            ] as const
          ).map(([chave, rotulo]) => (
            <Link
              key={chave}
              href={`/relatorios/ocupacao?${new URLSearchParams({ por: chave, de: periodo.de, ate: periodo.ate })}`}
              aria-current={tipo === chave ? "true" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
                tipo === chave
                  ? "bg-[var(--superficie-inversa)] font-medium text-[var(--tinta-inversa)]"
                  : "text-[var(--tinta-2)] hover:text-[var(--tinta-1)]"
              }`}
            >
              {rotulo}
            </Link>
          ))}
        </nav>
        <SeletorPeriodo
          caminho="/relatorios/ocupacao"
          de={periodo.de}
          ate={periodo.ate}
          hoje={hojeNaClinica()}
          manter={{ por: tipo }}
        />
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao rotulo="Capacidade" valor={horas(total.capacidade)} />
        <Cartao
          rotulo="Realizadas"
          valor={horas(total.realizadas)}
          apoio={pct(total.taxaEfetiva)}
        />
        <Cartao
          rotulo="Ociosas"
          valor={horas(total.ociosidade)}
          destaque={total.ociosidade > total.realizadas ? "atencao" : "neutro"}
        />
        <Cartao
          rotulo="No-show"
          valor={pct(total.taxaNoShow)}
          apoio={`${total.faltas} de ${total.atendimentos + total.faltas}`}
          destaque={(total.taxaNoShow ?? 0) > 0.1 ? "atencao" : "neutro"}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Ocupação por recurso</h2>
        <TabelaRecursos linhas={painel.linhas} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Horários vagos</h2>
          <p className="text-xs text-[var(--tinta-3)]">
            Janelas livres de 30 min ou mais, da maior para a menor. Cada uma é capacidade que a
            clínica paga e não usou.
            {vagas.length > 0 &&
              ` ${vagas.length} janela(s), ${horas(horasVagas)} no total${
                vagas.length > VAGAS_EXIBIDAS ? `; as ${VAGAS_EXIBIDAS} maiores abaixo` : ""
              }.`}
          </p>
        </div>

        {vagas.length === 0 ? (
          <Vazio>
            Nenhuma janela livre no período — ou nenhum recurso com disponibilidade cadastrada.
          </Vazio>
        ) : (
          <div className="cartao overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--traco)] text-left ">
                <tr className="text-[var(--tinta-3)]">
                  <th className="px-4 py-2.5 font-medium">Recurso</th>
                  <th className="px-4 py-2.5 font-medium">De</th>
                  <th className="px-4 py-2.5 font-medium">Até</th>
                  <th className="px-4 py-2.5 text-right font-medium">Duração</th>
                </tr>
              </thead>
              <tbody>
                {vagas.slice(0, VAGAS_EXIBIDAS).map((v, i) => (
                  <tr
                    key={`${v.recurso}-${v.inicio}-${i}`}
                    className="border-b border-[var(--traco)] last:border-0 "
                  >
                    <td className="px-4 py-2.5 font-medium">{v.recurso}</td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {dataHora.format(new Date(v.inicio))}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{dataHora.format(new Date(v.fim))}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {Math.floor(v.minutos / 60)}h{String(v.minutos % 60).padStart(2, "0")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* RF-92 · faltas e cancelamentos */}
      <Secao
        titulo="Faltas e cancelamentos"
        descricao={`${ausencias.faltas} falta(s) · taxa de falta ${pct(ausencias.taxaFalta)} · ${ausencias.cancelamentos} cancelamento(s)`}
      >
        {ausencias.ranking.length === 0 ? (
          <Vazio>Nenhuma falta nem cancelamento no período.</Vazio>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <Tabela>
              <Cabecalho>
                <Th>Paciente</Th>
                <Th alinhar="right">Faltas</Th>
                <Th alinhar="right">Cancelamentos</Th>
              </Cabecalho>
              <tbody>
                {ausencias.ranking.map((p) => (
                  <Tr key={p.id}>
                    <Td forte>
                      <Link href={`/pacientes/${p.id}`} className="hover:underline">
                        {p.nome}
                      </Link>
                    </Td>
                    <Td alinhar="right">{p.faltas}</Td>
                    <Td alinhar="right">{p.cancelamentos}</Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
            {ausencias.motivos.length > 0 && (
              <Tabela>
                <Cabecalho>
                  <Th>Motivo do cancelamento</Th>
                  <Th alinhar="right">Vezes</Th>
                </Cabecalho>
                <tbody>
                  {ausencias.motivos.map(([motivo, n]) => (
                    <Tr key={motivo}>
                      <Td>{motivo}</Td>
                      <Td alinhar="right">{n}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabela>
            )}
          </div>
        )}
      </Secao>

      <p className="text-xs text-[var(--tinta-3)]">
        Receita total no período: {brl.format(total.receita)}.
      </p>
    </div>
  );
}
