import Link from "next/link";
import { cobrancas, diasDeAtraso, emAberto, hojeNaClinica } from "@/lib/consultas/caixa";
import { Cartao } from "@/components/painel/indicadores";
import { Cabecalho, Secao, Tabela, Td, Th, Tr, Vazio } from "@/components/ui/primitivos";
import { TabelaCobrancas } from "@/components/financeiro/tabela-cobrancas";
import { Exportar } from "@/components/relatorios/exportar";

export const metadata = { title: "Recebimentos" };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const FILTROS = [
  { chave: "abertas", rotulo: "Em aberto" },
  { chave: "atrasadas", rotulo: "Atrasadas" },
  { chave: "pagas", rotulo: "Recebidas no mês" },
] as const;

const soma = (xs: { valor: number }[]) => xs.reduce((t, x) => t + Number(x.valor), 0);

/**
 * RF-80/81/82/97 · o caixa do dia a dia: o que entra, o que venceu, quem deve.
 */
export default async function RecebimentosPage(props: {
  searchParams: Promise<{ ver?: string }>;
}) {
  const { ver = "abertas" } = await props.searchParams;
  const todas = await cobrancas();
  const hoje = hojeNaClinica();
  const mes = hoje.slice(0, 7);

  const abertas = todas.filter(emAberto).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const atrasadas = abertas.filter((c) => diasDeAtraso(c.vencimento) > 0);
  const pagasNoMes = todas
    .filter((c) => c.status === "pago" && c.data_pagamento?.startsWith(mes))
    .sort((a, b) => (b.data_pagamento ?? "").localeCompare(a.data_pagamento ?? ""));
  const recebidoHoje = soma(pagasNoMes.filter((c) => c.data_pagamento === hoje));

  const lista = ver === "atrasadas" ? atrasadas : ver === "pagas" ? pagasNoMes : abertas;

  // RF-97 · inadimplência por paciente, com aging.
  const porPaciente = new Map<
    string,
    { id: string | null; nome: string; aVencer: number; ate30: number; ate60: number; mais60: number }
  >();
  for (const c of abertas) {
    const chave = c.paciente_id ?? "—";
    const linha = porPaciente.get(chave) ?? {
      id: c.paciente_id,
      nome: c.paciente_nome ?? "—",
      aVencer: 0,
      ate30: 0,
      ate60: 0,
      mais60: 0,
    };
    const dias = diasDeAtraso(c.vencimento);
    const v = Number(c.valor);
    if (dias === 0) linha.aVencer += v;
    else if (dias <= 30) linha.ate30 += v;
    else if (dias <= 60) linha.ate60 += v;
    else linha.mais60 += v;
    porPaciente.set(chave, linha);
  }
  const devedores = [...porPaciente.values()]
    .filter((l) => l.ate30 + l.ate60 + l.mais60 > 0)
    .sort((a, b) => b.mais60 + b.ate60 + b.ate30 - (a.mais60 + a.ate60 + a.ate30));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Recebimentos</h1>
        <p className="text-sm text-[var(--tinta-3)]">
          Parcelas de pacotes e sessões avulsas realizadas. Venda de pacote é na ficha do paciente.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao rotulo="Em aberto" valor={brl.format(soma(abertas))} apoio={`${abertas.length} cobrança(s)`} />
        <Cartao
          rotulo="Atrasado"
          valor={brl.format(soma(atrasadas))}
          apoio={`${atrasadas.length} cobrança(s)`}
          destaque={atrasadas.length > 0 ? "atencao" : undefined}
        />
        <Cartao rotulo="Recebido hoje" valor={brl.format(recebidoHoje)} destaque="bom" />
        <Cartao rotulo="Recebido no mês" valor={brl.format(soma(pagasNoMes))} />
      </section>

      <Secao
        titulo="Cobranças"
        acao={
          <div className="flex flex-wrap items-center gap-2">
          <Exportar relatorio="cobrancas" params={{ ver }} />
          <nav className="flex gap-0.5 rounded-full bg-[var(--superficie)] p-1 shadow-[var(--sombra-1)]">
            {FILTROS.map((f) => (
              <Link
                key={f.chave}
                href={`/recebimentos?ver=${f.chave}`}
                aria-current={ver === f.chave ? "true" : undefined}
                className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
                  ver === f.chave
                    ? "bg-[var(--superficie-inversa)] font-medium text-[var(--tinta-inversa)]"
                    : "text-[var(--tinta-2)] hover:text-[var(--tinta-1)]"
                }`}
              >
                {f.rotulo}
              </Link>
            ))}
          </nav>
          </div>
        }
      >
        <TabelaCobrancas
          cobrancas={lista}
          vazio={
            ver === "pagas"
              ? "Nenhum recebimento neste mês."
              : ver === "atrasadas"
                ? "Nenhuma cobrança atrasada."
                : "Nenhuma cobrança em aberto."
          }
        />
      </Secao>

      <Secao
        titulo="Inadimplência por paciente"
        descricao="Só quem tem cobrança vencida, do maior atraso para o menor."
      >
        {devedores.length === 0 ? (
          <Vazio>Nenhum paciente com cobrança vencida.</Vazio>
        ) : (
          <Tabela>
            <Cabecalho>
              <Th>Paciente</Th>
              <Th alinhar="right">A vencer</Th>
              <Th alinhar="right">1–30 dias</Th>
              <Th alinhar="right">31–60 dias</Th>
              <Th alinhar="right">60+ dias</Th>
            </Cabecalho>
            <tbody>
              {devedores.map((l) => (
                <Tr key={l.id ?? l.nome}>
                  <Td forte>
                    {l.id ? (
                      <Link href={`/pacientes/${l.id}`} className="hover:underline">
                        {l.nome}
                      </Link>
                    ) : (
                      l.nome
                    )}
                  </Td>
                  <Td alinhar="right">{brl.format(l.aVencer)}</Td>
                  <Td alinhar="right">{brl.format(l.ate30)}</Td>
                  <Td alinhar="right">{brl.format(l.ate60)}</Td>
                  <Td alinhar="right">{brl.format(l.mais60)}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Secao>
    </div>
  );
}
