import { listarSalas, listarProcedimentos } from "@/lib/consultas/recursos";
import { AvisoBanco, Etiqueta, Vazio } from "@/components/ui/primitivos";
import { FormularioSala } from "./formulario-sala";

export const metadata = { title: "Salas" };

export default async function SalasPage() {
  const [salas, procedimentos] = await Promise.all([
    listarSalas(),
    listarProcedimentos(),
  ]);

  if (salas.semSchema) return <AvisoBanco />;
  if (salas.erro) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        Erro ao carregar salas: {salas.erro}
      </p>
    );
  }

  const nomeProcedimento = (id: string | null) =>
    procedimentos.dados.find((p) => p.id === id)?.nome ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {salas.dados.filter((s) => s.ativo).length} sala(s) ativa(s)
          {salas.dados.length !== salas.dados.filter((s) => s.ativo).length &&
            ` · ${salas.dados.filter((s) => !s.ativo).length} inativa(s)`}
        </p>
        <FormularioSala procedimentos={procedimentos.dados} />
      </div>

      {salas.dados.length === 0 ? (
        <Vazio>
          Nenhuma sala cadastrada. Rode <code>npm run db:reset</code> para
          carregar as 9 salas do Anexo A, ou cadastre a primeira manualmente.
        </Vazio>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left dark:border-slate-800">
              <tr className="text-slate-500 dark:text-slate-400">
                <th className="px-4 py-2.5 font-medium">Nº</th>
                <th className="px-4 py-2.5 font-medium">Nome</th>
                <th className="px-4 py-2.5 font-medium">Alocação</th>
                <th className="px-4 py-2.5 font-medium">Procedimento fixo</th>
                <th className="px-4 py-2.5 font-medium">Vigência</th>
                <th className="px-4 py-2.5 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {salas.dados.map((sala) => (
                <tr
                  key={sala.id}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-900"
                >
                  <td className="px-4 py-2.5 tabular-nums">{sala.numero}</td>
                  <td className="px-4 py-2.5 font-medium">{sala.nome}</td>
                  <td className="px-4 py-2.5">
                    <Etiqueta tom={sala.tipo_alocacao === "dedicada" ? "ambar" : "neutro"}>
                      {sala.tipo_alocacao === "dedicada" ? "Dedicada" : "Flexível"}
                    </Etiqueta>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                    {nomeProcedimento(sala.procedimento_fixo_id)}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-600 dark:text-slate-400">
                    {sala.vigencia_inicio}
                    {sala.vigencia_fim ? ` → ${sala.vigencia_fim}` : ""}
                  </td>
                  <td className="px-4 py-2.5">
                    <Etiqueta tom={sala.ativo ? "verde" : "neutro"}>
                      {sala.ativo ? "Ativa" : "Inativa"}
                    </Etiqueta>
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
