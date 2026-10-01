import { createServerSupabase } from "@/lib/supabase/server";
import { listarUsuarios } from "@/lib/actions/usuarios";
import { Aviso, Etiqueta, Vazio } from "@/components/ui/primitivos";
import { PERFIS } from "@/lib/perfis";
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

  const { usuarios, profissionais } = await listarUsuarios();

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
        <FormularioUsuario profissionais={profissionais} />
      </div>

      {semAcesso.length > 0 && (
        <Aviso tom="neutro">
          {semAcesso.length} profissional(is) sem login:{" "}
          {semAcesso.map((p) => p.nome).join(", ")}. Elas aparecem na agenda
          normalmente — o login só é necessário para consultarem a própria
          agenda e comissão.
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
