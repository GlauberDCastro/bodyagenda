import Link from "next/link";

const ABAS = [
  { href: "/configuracoes/salas", rotulo: "Salas" },
  { href: "/configuracoes/equipamentos", rotulo: "Equipamentos" },
  { href: "/configuracoes/profissionais", rotulo: "Profissionais" },
  { href: "/configuracoes/procedimentos", rotulo: "Procedimentos" },
] as const;

export default function ConfiguracoesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Configuração</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Salas, equipamentos e profissionais em quantidade livre. Nada aqui
            está fixado no código.
          </p>
        </div>
        <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
          {ABAS.map((aba) => (
            <Link
              key={aba.href}
              href={aba.href}
              className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-slate-600 transition
                         hover:border-slate-300 hover:text-slate-900
                         dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-100"
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
