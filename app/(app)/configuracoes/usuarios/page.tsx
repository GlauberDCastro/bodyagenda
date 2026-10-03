import { createServerSupabase } from "@/lib/supabase/server";
import { listarUsuarios } from "@/lib/actions/usuarios";
import { Aviso, Etiqueta, Vazio } from "@/components/ui/primitivos";
import { PERFIS, ROTULO_PERFIL } from "@/lib/perfis";
import { nomeDaClinica } from "@/lib/consultas/clinica";
import { CancelarConvite, ConvidarUsuario } from "@/components/config/convite-usuario";
import {
  FormularioUsuario,
  AcoesUsuario,
  EtiquetaPerfil,
  type UsuarioLinha,
} from "./formulario-usuario";

export const metadata = { title: "Usuários" };

export default async function UsuariosPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: meuPerfil } = await supabase
    .from("usuario")
    .select("perfil")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  if (meuPerfil?.perfil !== "admin") {
    return (
      <Aviso>
        <p className="font-semibold">Acesso restrito</p>
        <p className="mt-1">
          Apenas o administrador gerencia usuários. Gestão configura a clínica,
          mas não concede acesso — separar as duas coisas é o que impede alguém
          de ampliar os próprios privilégios.
        </p>
      </Aviso>
    );
  }

  const [{ usuarios, profissionais }, { data: convites }, clinica] = await Promise.all([
    listarUsuarios(),
    supabase
      .from("convite")
      .select("id, perfil, nome, expira_em")
      .not("perfil", "is", null)
      .is("usado_em", null)
      .is("revogado_em", null)
      .gt("expira_em", new Date().toISOString())
      .order("criado_em", { ascending: false }),
    nomeDaClinica(),
  ]);

  const semAcesso = profissionais.filter((p) => !p.usuario_id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[13.5px] text-[var(--tinta-2)]">
            {usuarios.filter((u) => u.ativo).length} acesso(s) ativo(s)
          </p>
          <p className="mt-0.5 text-[12.5px] text-[var(--tinta-3)]">
            O perfil define o que a pessoa vê. É aplicado no banco, não na tela.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConvidarUsuario nomeClinica={clinica} />
          <FormularioUsuario profissionais={profissionais} />
        </div>
      </div>

      {(convites ?? []).length > 0 && (
        <section className="cartao divide-y divide-[var(--traco)]" aria-label="Convites pendentes">
          <p className="px-5 py-3 text-[13px] font-medium text-[var(--tinta-2)]">
            Convites pendentes
          </p>
          {(convites ?? []).map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <span className="text-[14px]">
                <span className="font-medium">{c.nome || "Sem nome"}</span>
                <span className="text-[var(--tinta-2)]">
                  {" "}
                  · {ROTULO_PERFIL[c.perfil ?? ""] ?? c.perfil} · vale até{" "}
                  {new Intl.DateTimeFormat("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    timeZone: "America/Sao_Paulo",
                  }).format(new Date(c.expira_em))}
                </span>
              </span>
              <CancelarConvite id={c.id} />
            </div>
          ))}
        </section>
      )}

      {semAcesso.length > 0 && (
        <Aviso tom="neutro">
          {semAcesso.length} profissional(is) sem login:{" "}
          {semAcesso.map((p) => p.nome).join(", ")}. Elas aparecem na agenda
          normalmente — o login só é necessário para consultarem a própria
          agenda e bonificação.
        </Aviso>
      )}

      {usuarios.length === 0 ? (
        <Vazio>Nenhum usuário cadastrado.</Vazio>
      ) : (
        <div className="cartao overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-[var(--traco)] text-left text-[12px] font-medium text-[var(--tinta-3)]">
                  <th className="px-4 py-2.5">Nome</th>
                  <th className="px-4 py-2.5">E-mail</th>
                  <th className="px-4 py-2.5">Perfil</th>
                  <th className="px-4 py-2.5">Vínculo</th>
                  <th className="px-4 py-2.5">Situação</th>
                  <th className="px-4 py-2.5">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => {
                  const prof = profissionais.find((p) => p.usuario_id === u.id);
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-[var(--traco)] last:border-0 hover:bg-[var(--superficie-2)]"
                    >
                      <td className="px-4 py-3 font-medium text-[var(--tinta-1)]">
                        {u.nome}
                        {u.id === user?.id && (
                          <span className="ml-2 text-[11.5px] font-normal text-[var(--tinta-3)]">
                            você
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--tinta-2)]">{u.email}</td>
                      <td className="px-4 py-3">
                        <EtiquetaPerfil perfil={u.perfil} />
                      </td>
                      <td className="px-4 py-3 text-[var(--tinta-2)]">
                        {prof?.nome ?? <span className="text-[var(--tinta-3)]">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Etiqueta tom={u.ativo ? "bom" : "neutro"}>
                          {u.ativo ? "Ativo" : "Sem acesso"}
                        </Etiqueta>
                      </td>
                      <td className="px-4 py-3">
                        <AcoesUsuario
                          usuario={u as UsuarioLinha}
                          profissionais={profissionais}
                          ehVoceMesmo={u.id === user?.id}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="titulo-md">O que cada perfil alcança</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PERFIS.map((p) => (
            <div key={p.valor} className="cartao p-4">
              <p className="text-[13.5px] font-medium">{p.rotulo}</p>
              <p className="mt-1 text-[12.5px] leading-snug text-[var(--tinta-3)]">
                {p.descricao}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
