import Link from "next/link";
import { nomeDaClinica } from "@/lib/consultas/clinica";
import { carregarHorarios } from "@/lib/consultas/horarios";
import { perfilDoUsuario } from "@/lib/consultas/recursos";
import { padraoMaisComum, resumirHorario } from "@/lib/horarios";
import { Cartao, Secao } from "@/components/ui/primitivos";
import { FormularioClinica } from "./formulario-clinica";

export const metadata = { title: "Clínica" };

export default async function ClinicaPage() {
  const [nome, perfil, { recursos }] = await Promise.all([
    nomeDaClinica(),
    perfilDoUsuario(),
    carregarHorarios(),
  ]);
  const expediente = resumirHorario(padraoMaisComum(recursos.map((r) => r.janelas)));

  return (
    <div className="space-y-8">
      <Secao titulo="Dados da clínica">
        <Cartao className="max-w-2xl">
          <FormularioClinica nome={nome} podeEditar={perfil === "admin" || perfil === "gestao"} />
        </Cartao>
      </Secao>

      <Secao
        titulo="Expediente"
        descricao="A agenda, o mapa de calor e as confirmações seguem este horário."
      >
        <Cartao className="flex max-w-2xl flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] font-medium">{expediente}</p>
          <Link
            href="/configuracoes/horarios"
            className="rounded-full border border-[var(--traco)] px-4 py-2 text-[13.5px] font-medium hover:bg-[var(--superficie-2)]"
          >
            Editar horários
          </Link>
        </Cartao>
      </Secao>
    </div>
  );
}
