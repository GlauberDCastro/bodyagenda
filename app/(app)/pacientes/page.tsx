import Link from "next/link";
import { buscarPacientes } from "@/lib/consultas/pacientes";
import { formatarCpf } from "@/lib/domain/cpf";
import { Etiqueta, Vazio, Input } from "@/components/ui/primitivos";
import { FormularioPaciente } from "./formulario-paciente";

export const metadata = { title: "Pacientes" };

export default async function PacientesPage(props: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await props.searchParams;
  const pacientes = await buscarPacientes(q);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pacientes</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Busque por nome, CPF ou telefone.
          </p>
        </div>
        <FormularioPaciente />
      </header>

      {/* Busca via GET: o termo fica na URL e a visão é compartilhável. */}
      <form className="max-w-sm">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Nome, CPF ou telefone…"
          aria-label="Buscar paciente"
        />
      </form>

      {pacientes.length === 0 ? (
        <Vazio>
          {q
            ? `Nenhum paciente encontrado para "${q}".`
            : "Nenhum paciente cadastrado ainda."}
        </Vazio>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left dark:border-slate-800">
              <tr className="text-slate-500 dark:text-slate-400">
                <th className="px-4 py-2.5 font-medium">Nome</th>
                <th className="px-4 py-2.5 font-medium">CPF</th>
                <th className="px-4 py-2.5 font-medium">Telefone</th>
                <th className="px-4 py-2.5 font-medium">LGPD</th>
                <th className="px-4 py-2.5 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {pacientes.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-900"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/pacientes/${p.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {p.nome}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-600 dark:text-slate-400">
                    {p.cpf ? formatarCpf(p.cpf) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                    {p.telefone ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Etiqueta tom={p.consentimento_lgpd ? "verde" : "ambar"}>
                      {p.consentimento_lgpd ? "Consentido" : "Pendente"}
                    </Etiqueta>
                  </td>
                  <td className="px-4 py-2.5">
                    <Etiqueta tom={p.ativo ? "verde" : "neutro"}>
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
