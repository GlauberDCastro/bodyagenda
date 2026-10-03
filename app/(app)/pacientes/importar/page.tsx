import Link from "next/link";
import { perfilDoUsuario } from "@/lib/consultas/recursos";
import { Aviso } from "@/components/ui/primitivos";
import { Importador } from "@/components/pacientes/importador";

export const metadata = { title: "Importar pacientes" };

/** Quem cadastra paciente (RLS): administração, recepção e time comercial. */
const PODEM_IMPORTAR = ["admin", "recepcao", "sdr", "closer"];

export default async function ImportarPacientesPage() {
  const perfil = await perfilDoUsuario();

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/pacientes"
          className="text-[14px] text-[var(--tinta-3)] underline-offset-4 hover:text-[var(--tinta-1)] hover:underline"
        >
          ← Pacientes
        </Link>
        <h1 className="titulo-xl mt-1">Importar pacientes</h1>
        <p className="mt-1 text-[15px] text-[var(--tinta-2)]">
          Traga a lista de pacientes de outro sistema ou planilha.
        </p>
      </header>
      {PODEM_IMPORTAR.includes(perfil ?? "") ? (
        <Importador />
      ) : (
        <Aviso>Só administração, recepção e time comercial cadastram pacientes.</Aviso>
      )}
    </div>
  );
}
