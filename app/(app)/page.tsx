import Link from "next/link";
import { SeletorPeriodo } from "@/components/relatorios/seletor-periodo";
import { SerieComparativa } from "@/components/painel/serie-comparativa";
import { serieOcupacao as serieDiaria } from "@/lib/consultas/relatorios";
import { periodoAnterior } from "@/lib/periodos";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  carregarPainel,
  consolidar,
  mapaDeCalor,
  gargalos,
  resolverPeriodo,
  hojeNaClinica,
} from "@/lib/consultas/painel";
import { AvisoBanco, Aviso, Secao, Botao } from "@/components/ui/primitivos";
import { Cartao, TabelaRecursos, brl, brlExato, pct, horas } from "@/components/painel/indicadores";
import { MapaCalor } from "@/components/painel/mapa-calor";
import type { TipoRecurso } from "@/lib/types/database";
import { Exportar } from "@/components/relatorios/exportar";

export const metadata = { title: "Painel" };

const VISOES = [
  { chave: "sala", rotulo: "Salas" },
  { chave: "equipamento", rotulo: "Equipamentos" },
  { chave: "profissional", rotulo: "Profissionais" },
] as const;

function saudacao(): string {
  const h = Number(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Sao_Paulo",
    }).format(new Date()),
  );
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

const dataPorExtenso = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "America/Sao_Paulo",
});

export default async function PainelPage(props: {
  searchParams: Promise<{ por?: string; de?: string; ate?: string }>;
}) {
  const { por = "sala", de, ate } = await props.searchParams;
  const tipo = (VISOES.find((v) => v.chave === por)?.chave ?? "sala") as TipoRecurso;
  const periodo = resolverPeriodo(de, ate);

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = await supabase
    .from("usuario")
    .select("nome")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const anterior = periodoAnterior(periodo.de, periodo.ate);
  const [painel, calor, gargalosLista, serieAtual, serieAnterior] = await Promise.all([
    carregarPainel(tipo, periodo),
    mapaDeCalor(tipo, periodo),
    gargalos(periodo),
    serieDiaria(tipo, periodo.de, periodo.ate),
    serieDiaria(tipo, anterior.de, anterior.ate),
  ]);
  const comoTaxa = (s: Awaited<ReturnType<typeof serieDiaria>>) =>
    s.map((d) => ({ dia: d.dia, taxa: d.capacidade > 0 ? d.realizadas / d.capacidade : null }));

  if (painel.semSchema) return <AvisoBanco />;

  const total = consolidar(painel.linhas);
  // RF-77 · cada número leva à lista de atendimentos que o compõe.
  const lista = (status: string) =>
    `/relatorios/atendimentos?${new URLSearchParams({ de: periodo.de, ate: periodo.ate, status })}`;

  const qs = (extra: Record<string, string>) =>
    new URLSearchParams({
      por,
      ...(de ? { de } : {}),
      ...(ate ? { ate } : {}),
      ...extra,
    }).toString();

  // Série das 8 maiores ocupações — dá forma ao cartão sem inventar histórico.
  const serieOcupacao = [...painel.linhas]
    .map((l) => Number(l.taxa_efetiva ?? 0) * 100)
    .slice(0, 8);
  const serieReceita = [...painel.linhas].map((l) => Number(l.receita)).slice(0, 8);

  // O nome pode vir do e-mail (minúsculo) quando o cadastro não foi preenchido.
  const primeiroNome = (perfil?.nome ?? "")
    .split(" ")[0]
    .replace(/^./, (c) => c.toUpperCase());
  const hoje = new Date();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="titulo-xl">
            {saudacao()}
            {primeiroNome ? `, ${primeiroNome}` : ""}
          </h1>
          <p className="mt-1 text-[13.5px] text-[var(--tinta-2)] first-letter:uppercase">
            {dataPorExtenso.format(hoje)} · {periodo.rotulo.toLowerCase()} · {painel.linhas.length}{" "}
            recurso(s)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/pacientes">
            <Botao variante="secundario" type="button">
              Novo paciente
            </Botao>
          </Link>
          <Link href="/agenda">
            <Botao type="button">Novo agendamento</Botao>
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {/* Controle segmentado: as três visões são exclusivas entre si. */}
        <nav className="flex gap-0.5 rounded-full bg-[var(--superficie)] p-1 shadow-[var(--sombra-1)]">
          {VISOES.map((v) => (
            <Link
              key={v.chave}
              href={`/?${qs({ por: v.chave })}`}
              aria-current={por === v.chave ? "true" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
                por === v.chave
                  ? "bg-[var(--superficie-inversa)] font-medium text-[var(--tinta-inversa)]"
                  : "text-[var(--tinta-2)] hover:text-[var(--tinta-1)]"
              }`}
            >
              {v.rotulo}
            </Link>
          ))}
        </nav>

        <SeletorPeriodo
          caminho="/"
          de={periodo.de}
          ate={periodo.ate}
          hoje={hojeNaClinica()}
          manter={{ por }}
        />
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao
          href={lista("realizado")}
          rotulo="Ocupação efetiva"
          valor={pct(total.taxaEfetiva)}
          apoio={`Agendada ${pct(total.taxaAgendada)} · ${horas(total.realizadas)} de ${horas(total.capacidade)}`}
          serie={serieOcupacao}
        />
        <Cartao
          href={`/relatorios/ocupacao?${new URLSearchParams({ por: tipo, de: periodo.de, ate: periodo.ate })}`}
          rotulo="Horas ociosas"
          valor={horas(total.ociosidade)}
          apoio="Capacidade instalada não utilizada"
          destaque={total.ociosidade > total.realizadas ? "atencao" : "neutro"}
        />
        <Cartao
          href={lista("falta")}
          rotulo="Taxa de no-show"
          valor={pct(total.taxaNoShow)}
          apoio={`${total.faltas} falta(s) em ${total.atendimentos + total.faltas} sessões`}
          destaque={(total.taxaNoShow ?? 0) > 0.1 ? "atencao" : "neutro"}
        />
        <Cartao
          href={lista("realizado")}
          rotulo="Receita por hora disponível"
          valor={total.receitaPorHora === null ? "—" : brlExato.format(total.receitaPorHora)}
          apoio={`${brl.format(total.receita)} no período`}
          serie={serieReceita}
        />
      </section>

      {total.taxaAgendada !== null &&
        total.taxaEfetiva !== null &&
        total.taxaAgendada > total.taxaEfetiva && (
          <Aviso>
            {horas(total.agendadas - total.realizadas)} foram bloqueadas na agenda e não viraram
            atendimento. É a diferença entre a ocupação agendada e a efetiva — o custo do no-show.
          </Aviso>
        )}

      {gargalosLista.length > 0 && (
        <Secao titulo="Gargalos de equipamento">
          {gargalosLista.map((g) => (
            <Aviso key={g.modelo}>
              <p className="font-semibold">
                {g.modelo} — {pct(Number(g.taxa_media))} de ocupação
              </p>
              <p className="mt-1">
                {g.unidades} unidade{g.unidades > 1 ? "s" : ""} atendendo {g.procedimentos}{" "}
                procedimentos diferentes, com {horas(Number(g.horas_livres))} livres no período.
                Cada sessão de um procedimento desloca a de outro.
              </p>
            </Aviso>
          ))}
        </Secao>
      )}

      {/* RF-75 · série temporal contra o período anterior */}
      {serieAtual.length > 1 && (
        <Secao
          titulo="Ocupação efetiva por dia"
          descricao={`Comparada com ${anterior.de.slice(8, 10)}/${anterior.de.slice(5, 7)} a ${anterior.ate.slice(8, 10)}/${anterior.ate.slice(5, 7)}, o período anterior de mesmo tamanho.`}
        >
          <div className="cartao p-5">
            <SerieComparativa atual={comoTaxa(serieAtual)} anterior={comoTaxa(serieAnterior)} />
          </div>
        </Secao>
      )}

      <Secao
        titulo="Por recurso"
        acao={
          <Exportar relatorio="ocupacao" params={{ por: tipo, de: periodo.de, ate: periodo.ate }} />
        }
        descricao="Ocupação e receita por hora lado a lado — o cruzamento que a taxa sozinha esconde."
      >
        <TabelaRecursos
          linhas={painel.linhas}
          porModelo={tipo === "equipamento"}
          hrefRecurso={(l) =>
            `/relatorios/atendimentos?${new URLSearchParams({
              de: periodo.de,
              ate: periodo.ate,
              tipo,
              recurso: l.recurso_id,
              nome: l.nome,
            })}`
          }
        />
      </Secao>

      <Secao titulo="Quando a clínica está cheia">
        <div className="cartao p-5">
          <MapaCalor celulas={calor} />
        </div>
      </Secao>

      <nav className="flex flex-wrap gap-4 pt-2 text-[13.5px]">
        <Link
          href="/relatorios/ocupacao"
          className="text-[var(--marca)] underline-offset-4 hover:underline"
        >
          Relatórios de ocupação →
        </Link>
        <Link
          href="/relatorios/financeiro"
          className="text-[var(--marca)] underline-offset-4 hover:underline"
        >
          Relatórios financeiros →
        </Link>
      </nav>
    </div>
  );
}
