import {
  listarProfissionais,
  listarProcedimentos,
  perfilDoUsuario,
} from "@/lib/consultas/recursos";
import { createServerSupabase } from "@/lib/supabase/server";
import { ConviteProfissional } from "@/components/config/convite-profissional";
import { AvisoBanco, Etiqueta, Vazio } from "@/components/ui/primitivos";
import { FormularioProfissional } from "./formulario-profissional";
import { AcoesProfissional } from "@/components/config/acoes-profissional";
import { BotaoDuplicar } from "../equipamentos/botao-duplicar";

export const metadata = { title: "Profissionais" };

export default async function ProfissionaisPage() {
  const supabase = await createServerSupabase();
  const [profissionais, procedimentos, perfil, { data: convites }] = await Promise.all([
    listarProfissionais(),
    listarProcedimentos(),
    perfilDoUsuario(),
    // RLS: só o admin enxerga convites; para os demais a lista vem vazia.
    supabase
      .from("convite_profissional")
      .select("profissional_id, expira_em")
      .is("usado_em", null)
      .is("revogado_em", null)
      .gt("expira_em", new Date().toISOString()),
  ]);
  const pendentes = new Map((convites ?? []).map((c) => [c.profissional_id, c.expira_em]));

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
        <FormularioProfissional procedimentos={procedimentos.dados.filter((p) => p.ativo)} />
      </div>

      {profissionais.dados.length === 0 ? (
        <Vazio>
          Nenhum profissional cadastrado. Um profissional pode existir sem login &mdash; o vínculo
          com usuário é opcional.
        </Vazio>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--traco)] text-left ">
              <tr className="text-[var(--tinta-3)]">
                <th className="px-4 py-2.5 font-medium">Nome</th>
                <th className="px-4 py-2.5 font-medium">Especialidade</th>
                <th className="px-4 py-2.5 font-medium">Acesso</th>
                <th className="px-4 py-2.5 font-medium">Vigência</th>
                <th className="px-4 py-2.5 font-medium">Situação</th>
                <th className="px-4 py-2.5 font-medium"><span className="sr-only">Ações</span></th>
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
                    <ConviteProfissional
                      profissional={{
                        id: p.id,
                        nome: p.nome,
                        telefone: p.telefone,
                        ativo: p.ativo,
                        temAcesso: Boolean(p.usuario_id),
                      }}
                      pendenteAte={pendentes.get(p.id) ?? null}
                      podeConvidar={perfil === "admin"}
                    />
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
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <BotaoDuplicar id={p.id} nome={p.nome} tipo="profissional" />
                      <AcoesProfissional profissional={p} procedimentos={procedimentos.dados.filter((x) => x.ativo)} />
                    </div>
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
