import Link from "next/link";

const ABAS = [
  { href: "/configuracoes/salas", rotulo: "Salas" },
  { href: "/configuracoes/equipamentos", rotulo: "Equipamentos" },
  { href: "/configuracoes/profissionais", rotulo: "Profissionais" },
  { href: "/configuracoes/procedimentos", rotulo: "Procedimentos" },
] as const;

export default function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Configuração</h1>
          <p className="text-sm text-[var(--tinta-3)]">
            Salas, equipamentos e profissionais em quantidade livre. Nada aqui está fixado no
            código.
          </p>
        </div>
        <nav className="flex gap-1 border-b border-[var(--traco)]">
          {ABAS.map((aba) => (
            <Link
              key={aba.href}
              href={aba.href}
              className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-[var(--tinta-2)] transition
 hover:border-[var(--traco)] hover:text-[var(--tinta-1)]
 dark:hover:border-slate-700 dark:hover:text-slate-100"
            >
              {aba.rotulo}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
