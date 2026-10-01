import Link from "next/link";
import { diasDeAtraso, emAberto, type Cobranca } from "@/lib/consultas/caixa";
import { Cabecalho, Etiqueta, Tabela, Td, Th, Tr, Vazio } from "@/components/ui/primitivos";
import { Receber } from "./receber";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const data = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function Situacao({ c }: { c: Cobranca }) {
  if (c.status === "pago") {
    return (
      <Etiqueta tom="bom">
        Pago {c.data_pagamento ? data(c.data_pagamento) : ""}
        {c.forma_pagamento ? ` · ${c.forma_pagamento}` : ""}
      </Etiqueta>
    );
  }
  if (c.status === "cancelado") return <Etiqueta>Cancelado</Etiqueta>;
  const dias = diasDeAtraso(c.vencimento);
  return dias > 0 ? (
    <Etiqueta tom="critico">Atrasado {dias} dia(s)</Etiqueta>
  ) : (
    <Etiqueta>A vencer</Etiqueta>
  );
}

/** Cobranças de pacote e de sessão avulsa, com o botão de receber. */
export function TabelaCobrancas({
  cobrancas,
  mostrarPaciente = true,
  vazio,
}: {
  cobrancas: Cobranca[];
  mostrarPaciente?: boolean;
  vazio: string;
}) {
  if (cobrancas.length === 0) return <Vazio>{vazio}</Vazio>;

  return (
    <Tabela>
      <Cabecalho>
        {mostrarPaciente && <Th>Paciente</Th>}
        <Th>Cobrança</Th>
        <Th>Vencimento</Th>
        <Th alinhar="right">Valor</Th>
        <Th>Situação</Th>
        <Th>
          <span className="sr-only">Ações</span>
        </Th>
      </Cabecalho>
      <tbody>
        {cobrancas.map((c) => (
          <Tr key={c.id}>
            {mostrarPaciente && (
              <Td forte>
                {c.paciente_id ? (
                  <Link href={`/pacientes/${c.paciente_id}`} className="hover:underline">
                    {c.paciente_nome}
                  </Link>
                ) : (
                  "—"
                )}
              </Td>
            )}
            <Td>{c.descricao ?? "—"}</Td>
            <Td>{data(c.vencimento)}</Td>
            <Td alinhar="right">{brl.format(Number(c.valor))}</Td>
            <Td>
              <Situacao c={c} />
            </Td>
            <Td alinhar="right">{emAberto(c) && <Receber cobranca={c} />}</Td>
          </Tr>
        ))}
      </tbody>
    </Tabela>
  );
}
