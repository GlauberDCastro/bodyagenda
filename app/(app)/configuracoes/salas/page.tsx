import { listarSalas, listarProcedimentos } from "@/lib/consultas/recursos";
import { AvisoBanco, Etiqueta, Vazio } from "@/components/ui/primitivos";
import { FormularioSala } from "./formulario-sala";
import { AcoesSala } from "@/components/config/acoes-sala";

export const metadata = { title: "Salas" };

export default async function SalasPage() {
  const [salas, procedimentos] = await Promise.all([listarSalas(), listarProcedimentos()]);

  if (salas.semSchema) return <AvisoBanco />;
  if (salas.erro) {
    return (
      <p className="text-sm text-[color:var(--status-critico)]">
        Erro ao carregar salas: {salas.erro}
      </p>
    );
  }

  const nomeProcedimento = (id: string | null) =>
    procedimentos.dados.find((p) => p.id === id)?.nome ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-[var(--tinta-3)]">
          {salas.dados.filter((s) => s.ativo).length} sala(s) ativa(s)
          {salas.dados.length !== salas.dados.filter((s) => s.ativo).length &&
            ` · ${salas.dados.filter((s) => !s.ativo).length} inativa(s)`}
        </p>
        <FormularioSala procedimentos={procedimentos.dados} />
      </div>

      {salas.dados.length === 0 ? (
        <Vazio>
          Nenhuma sala cadastrada. Rode <code>npm run db:reset</code> para carregar as 9 salas do
          Anexo A, ou cadastre a primeira manualmente.
        </Vazio>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--traco)] text-left ">
              <tr className="text-[var(--tinta-3)]">
                <th className="px-4 py-2.5 font-medium">Nº</th>
                <th className="px-4 py-2.5 font-medium">Nome</th>
                <th className="px-4 py-2.5 font-medium">Alocação</th>
                <th className="px-4 py-2.5 font-medium">Procedimento fixo</th>
                <th className="px-4 py-2.5 font-medium">Vigência</th>
                <th className="px-4 py-2.5 font-medium">Situação</th>
                <th className="px-4 py-2.5 font-medium"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {salas.dados.map((sala) => (
                <tr key={sala.id} className="border-b border-[var(--traco)] last:border-0 ">
                  <td className="px-4 py-2.5 tabular-nums">{sala.numero}</td>
                  <td className="px-4 py-2.5 font-medium">{sala.nome}</td>
                  <td className="px-4 py-2.5">
                    <Etiqueta tom={sala.tipo_alocacao === "dedicada" ? "atencao" : "neutro"}>
                      {sala.tipo_alocacao === "dedicada" ? "Dedicada" : "Flexível"}
                    </Etiqueta>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--tinta-2)]">
                    {nomeProcedimento(sala.procedimento_fixo_id)}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--tinta-2)]">
                    {sala.vigencia_inicio}
                    {sala.vigencia_fim ? ` → ${sala.vigencia_fim}` : ""}
                  </td>
                  <td className="px-4 py-2.5">
                    <Etiqueta tom={sala.ativo ? "bom" : "neutro"}>
                      {sala.ativo ? "Ativa" : "Inativa"}
                    </Etiqueta>
                  </td>
                  <td className="px-4 py-2.5">
                    <AcoesSala sala={sala} procedimentos={procedimentos.dados} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
