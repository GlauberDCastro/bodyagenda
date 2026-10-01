"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  { href: "/configuracoes/salas", rotulo: "Salas" },
  { href: "/configuracoes/equipamentos", rotulo: "Equipamentos" },
  { href: "/configuracoes/profissionais", rotulo: "Profissionais" },
  { href: "/configuracoes/procedimentos", rotulo: "Procedimentos" },
  { href: "/configuracoes/horarios", rotulo: "Horários e bloqueios" },
  { href: "/configuracoes/despesas", rotulo: "Despesas fixas" },
  { href: "/configuracoes/usuarios", rotulo: "Usuários" },
] as const;

/** Abas da Configuração. Cliente só para saber qual está ativa. */
export function AbasConfiguracao() {
  const caminho = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-[var(--traco)]">
      {ABAS.map((aba) => {
        const ativa = caminho.startsWith(aba.href);
        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ativa ? "page" : undefined}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition ${
              ativa
                ? "border-[var(--tinta-1)] font-medium text-[var(--tinta-1)]"
                : "border-transparent text-[var(--tinta-2)] hover:border-[var(--traco)] hover:text-[var(--tinta-1)]"
            }`}
          >
            {aba.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
