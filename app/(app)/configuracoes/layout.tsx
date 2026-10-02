import { AbasConfiguracao } from "@/components/config/abas-configuracao";

export default function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="titulo-xl">Configurações</h1>
          <p className="mt-1 text-[15px] text-[var(--tinta-2)]">
            Tudo o que molda a clínica no sistema: recursos, catálogo, horários, despesas e acessos.
            Nada aqui está fixado no código.
          </p>
        </div>
        <AbasConfiguracao />
      </header>
      {children}
    </div>
  );
}
