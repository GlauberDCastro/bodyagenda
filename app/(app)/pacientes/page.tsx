import Link from "next/link";
import { Suspense } from "react";
import { listarPacientesResumo, type LinhaPaciente } from "@/lib/consultas/pacientes";
import { perfilDoUsuario } from "@/lib/consultas/recursos";
import { hojeNaClinica } from "@/lib/consultas/caixa";
import { Etiqueta, Vazio } from "@/components/ui/primitivos";
import { CampoBusca } from "@/components/pacientes/campo-busca";
import { FormularioPaciente } from "./formulario-paciente";

export const metadata = { title: "Pacientes" };

const TZ = "America/Sao_Paulo";
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataCurta = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: TZ });
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TZ,
});

/** Recortes que geram ação da recepção: retorno, cobrança, assinatura. */
const FILTROS: { chave: string; rotulo: string; aplica: (p: LinhaPaciente) => boolean }[] = [
  { chave: "", rotulo: "Ativos", aplica: (p) => p.ativo },
  {
    chave: "sem_retorno",
    rotulo: "Sem retorno agendado",
    aplica: (p) => p.ativo && !!p.ultima_visita && !p.proximo_inicio,
  },
  { chave: "debito", rotulo: "Em atraso", aplica: (p) => p.em_atraso > 0 },
  { chave: "lgpd", rotulo: "LGPD pendente", aplica: (p) => p.ativo && !p.consentimento_lgpd },
  { chave: "inativos", rotulo: "Inativos", aplica: (p) => !p.ativo },
];

/** Linhas exibidas de uma vez; a busca afunila o resto. */
const LIMITE = 200;

function idade(nascimento: string | null, hoje: string): number | null {
  if (!nascimento) return null;
  const [a, m, d] = nascimento.split("-").map(Number);
  const [ha, hm, hd] = hoje.split("-").map(Number);
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}

const iniciais = (nome: string) =>
  nome
    .replace(/\(.*?\)/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

export default async function PacientesPage(props: {
  searchParams: Promise<{ q?: string; filtro?: string }>;
}) {
  const { q = "", filtro = "" } = await props.searchParams;
  const [todos, perfil] = await Promise.all([listarPacientesResumo(q), perfilDoUsuario()]);
  const hoje = hojeNaClinica();
  const ativo = FILTROS.find((f) => f.chave === filtro) ?? FILTROS[0];
  const lista = todos.filter(ativo.aplica);

  const link = (chave: string) =>
    `/pacientes?${new URLSearchParams({ ...(q && { q }), ...(chave && { filtro: chave }) })}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="titulo-xl">Pacientes</h1>
          <p className="mt-1 text-[15px] text-[var(--tinta-2)]">
            {todos.filter((p) => p.ativo).length} paciente(s) ativo(s). Clique para abrir a ficha.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(perfil === "admin" || perfil === "recepcao") && (
            <Link
              href="/pacientes/importar"
              className="rounded-full border border-[var(--traco)] bg-[var(--superficie)] px-4 py-2.5 text-[13.5px] font-medium shadow-[var(--sombra-1)] hover:bg-[var(--superficie-2)]"
            >
              Importar planilha
            </Link>
          )}
          <FormularioPaciente />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Suspense>
          <CampoBusca placeholder="Nome, CPF ou telefone…" />
        </Suspense>
        <nav
          aria-label="Filtrar pacientes"
          className="inline-flex flex-wrap gap-1 rounded-full bg-[var(--superficie)] p-1.5 shadow-[var(--sombra-1)]"
        >
          {FILTROS.map((f) => {
            const n = todos.filter(f.aplica).length;
            const atual = f.chave === ativo.chave;
            return (
              <Link
                key={f.chave}
                href={link(f.chave)}
                aria-current={atual ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] transition-colors ${
                  atual
                    ? "bg-[var(--superficie-inversa)] font-medium text-[var(--tinta-inversa)]"
                    : "text-[var(--tinta-2)] hover:text-[var(--tinta-1)]"
                }`}
              >
                {f.rotulo}
                <span className={`tabular-nums ${atual ? "opacity-70" : "text-[var(--tinta-3)]"}`}>
                  {n}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {lista.length === 0 ? (
        <Vazio>
          {q
            ? `Nenhum paciente encontrado para "${q}" neste filtro.`
            : ativo.chave
              ? "Nenhum paciente neste filtro."
              : "Nenhum paciente cadastrado ainda. Use “Novo paciente” para começar."}
        </Vazio>
      ) : (
        <div className="cartao overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_1fr_1.4fr_minmax(0,1.4fr)] gap-4 border-b border-[var(--traco)] px-5 py-3 text-[13px] text-[var(--tinta-3)] lg:grid">
            <span>Paciente</span>
            <span>Última visita</span>
            <span>Próximo atendimento</span>
            <span>Situação</span>
          </div>
          <ul className="divide-y divide-[var(--traco)]">
            {lista.slice(0, LIMITE).map((p) => {
              const anos = idade(p.data_nascimento, hoje);
              return (
                <li key={p.id}>
                  <Link
                    href={`/pacientes/${p.id}`}
                    className="grid items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-[var(--superficie-2)] lg:grid-cols-[minmax(0,2.2fr)_1fr_1.4fr_minmax(0,1.4fr)]"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden
                        className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--superficie-2)] text-[14px] font-semibold text-[var(--tinta-2)]"
                      >
                        {iniciais(p.nome)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-medium">{p.nome}</span>
                        <span className="block truncate text-[13px] text-[var(--tinta-2)]">
                          {[anos !== null && `${anos} anos`, p.telefone]
                            .filter(Boolean)
                            .join(" · ") || "Sem contato"}
                        </span>
                      </span>
                    </span>
                    <span className="text-[14px] tabular-nums text-[var(--tinta-2)]">
                      <span className="text-[12.5px] text-[var(--tinta-3)] lg:hidden">
                        Última visita:{" "}
                      </span>
                      {p.ultima_visita ? dataCurta.format(new Date(p.ultima_visita)) : "—"}
                    </span>
                    <span className="min-w-0 text-[14px]">
                      {p.proximo_inicio ? (
                        <>
                          <span className="block tabular-nums">
                            {dataHora.format(new Date(p.proximo_inicio)).replace(".", "")}
                          </span>
                          <span className="block truncate text-[13px] text-[var(--tinta-2)]">
                            {p.proximo_procedimento}
                          </span>
                        </>
                      ) : (
                        <span className="text-[var(--tinta-3)]">Nada agendado</span>
                      )}
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      {!p.ativo && <Etiqueta>Inativo</Etiqueta>}
                      {p.em_atraso > 0 && (
                        <Etiqueta tom="critico">Atraso {brl.format(p.em_atraso)}</Etiqueta>
                      )}
                      {p.pacotes_ativos > 0 && (
                        <Etiqueta tom="marca">
                          {p.pacotes_ativos === 1 ? "Pacote ativo" : `${p.pacotes_ativos} pacotes`}
                        </Etiqueta>
                      )}
                      {p.faltas > 0 && <Etiqueta tom="atencao">{p.faltas} falta(s)</Etiqueta>}
                      {p.ativo && !p.consentimento_lgpd && (
                        <Etiqueta tom="atencao">LGPD pendente</Etiqueta>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {lista.length > LIMITE && (
            <p className="border-t border-[var(--traco)] px-5 py-3 text-[13px] text-[var(--tinta-3)]">
              Mostrando {LIMITE} de {lista.length}. Busque pelo nome para encontrar os demais.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
