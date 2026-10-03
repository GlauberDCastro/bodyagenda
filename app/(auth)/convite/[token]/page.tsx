import Link from "next/link";
import { Logotipo } from "@/components/ui/logo";
import { situacaoDoConvite } from "@/lib/auth/convites";
import { nomeDaClinicaPublico } from "@/lib/consultas/clinica";
import { formatarCpf } from "@/lib/domain/cpf";
import { FormularioConvite } from "./formulario-convite";

export const metadata = { title: "Criar acesso" };

const MOTIVOS = {
  invalido: "Este link de convite não é válido.",
  usado: "Este convite já foi usado. Entre com o e-mail e a senha que você criou.",
  expirado: "Este convite expirou. Peça um novo link à clínica.",
  revogado:
    "Este convite foi substituído por um mais recente. Use o último link que a clínica enviou.",
  ja_tem_acesso: "Você já tem acesso ao sistema. Entre com seu e-mail e senha.",
} as const;

const dataLonga = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  timeZone: "America/Sao_Paulo",
});

export default async function ConvitePage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const [situacao, clinica] = await Promise.all([situacaoDoConvite(token), nomeDaClinicaPublico()]);

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[520px] space-y-6">
        <div className="flex justify-center">
          <Logotipo />
        </div>

        {situacao.ok ? (
          <>
            <div className="text-center">
              <h1 className="titulo-xl">Bem-vindo(a){clinica ? ` à ${clinica}` : ""}</h1>
              <p className="mt-2 text-[15px] text-[var(--tinta-2)]">
                Crie seu acesso para ver sua agenda e suas bonificações. Confira seus dados e complete
                o que faltar.
              </p>
            </div>
            <div className="cartao p-6">
              <FormularioConvite
                token={token}
                inicial={{
                  ...situacao.convite.profissional,
                  cpf: situacao.convite.profissional.cpf
                    ? formatarCpf(situacao.convite.profissional.cpf)
                    : null,
                }}
              />
            </div>
            <p className="text-center text-[12.5px] text-[var(--tinta-3)]">
              Convite pessoal, válido até {dataLonga.format(new Date(situacao.convite.expira_em))}.
              Não compartilhe este link.
            </p>
          </>
        ) : (
          <div className="cartao space-y-4 p-6 text-center">
            <h1 className="titulo-lg">Não foi possível usar este convite</h1>
            <p className="text-[15px] text-[var(--tinta-2)]">{MOTIVOS[situacao.motivo]}</p>
            <Link
              href="/login"
              className="inline-flex rounded-full bg-[var(--superficie-inversa)] px-5 py-2.5 text-[14px] font-medium text-[var(--tinta-inversa)]"
            >
              Ir para o login
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
