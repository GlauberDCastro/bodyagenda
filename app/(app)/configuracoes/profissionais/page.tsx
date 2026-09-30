import { listarProfissionais, listarProcedimentos } from "@/lib/consultas/recursos";
import { AvisoBanco, Etiqueta, Vazio } from "@/components/ui/primitivos";
import { FormularioProfissional } from "./formulario-profissional";

export const metadata = { title: "Profissionais" };

export default async function ProfissionaisPage() {
  const [profissionais, procedimentos] = await Promise.all([
    listarProfissionais(),
    listarProcedimentos(),
  ]);

  if (profissionais.semSchema) return <AvisoBanco />;
  if (profissionais.erro) {
    return (
      <p className="text-sm text-[color:var(--status-critico)]">
        Erro ao carregar profissionais: {profissionais.erro}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-[var(--tinta-3)]">
          {profissionais.dados.filter((p) => p.ativo).length} profissional(is) ativo(s)
        </p>
        <FormularioProfissional procedimentos={procedimentos.dados} />
      </div>

      {profissionais.dados.length === 0 ? (
        <Vazio>
          Nenhum profissional cadastrado. Um profissional pode existir sem login &mdash; o vínculo
          com usuário é opcional.
        </Vazio>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--traco)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--traco)] text-left ">
              <tr className="text-[var(--tinta-3)]">
                <th className="px-4 py-2.5 font-medium">Nome</th>
                <th className="px-4 py-2.5 font-medium">Especialidade</th>
                <th className="px-4 py-2.5 font-medium">Login</th>
                <th className="px-4 py-2.5 font-medium">Vigência</th>
                <th className="px-4 py-2.5 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {profissionais.dados.map((p) => (
                <tr key={p.id} className="border-b border-[var(--traco)] last:border-0 ">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: p.cor_agenda }}
                      />
                      <span className="font-medium">{p.nome}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--tinta-2)]">{p.especialidade ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <Etiqueta>{p.usuario_id ? "Com acesso" : "Sem login"}</Etiqueta>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--tinta-2)]">
                    {p.vigencia_inicio}
                    {p.vigencia_fim ? ` → ${p.vigencia_fim}` : ""}
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
    </div>
  );
}
