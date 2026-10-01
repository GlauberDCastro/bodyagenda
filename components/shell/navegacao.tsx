"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logotipo } from "@/components/ui/logo";
import { ABAS_CONFIGURACAO } from "@/components/config/abas-configuracao";

/** Ícones em traço, 1.6px — peso único em toda a navegação. */
function Icone({ d, tamanho = 18 }: { d: string; tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className="shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

const ICONES = {
  painel: "M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6V11h-6v9Zm0-16v4h6V4h-6Z",
  agenda:
    "M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  pacientes: "M16 19v-2a4 4 0 0 0-8 0v2M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  financeiro: "M3 7h18v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Zm0 0 2.5-3h13L21 7M8 12h8",
  relatorios: "M5 20V10m7 10V4m7 16v-7",
  configuracoes: "M4 6h9m4 0h3M15 4v4M4 12h3m4 0h9M9 10v4M4 18h11m4 0h1M17 16v4",
} as const;

interface ItemNav {
  href: string;
  rotulo: string;
  icone: keyof typeof ICONES;
}

const GRUPOS: { titulo: string; itens: ItemNav[] }[] = [
  {
    titulo: "Operação",
    itens: [
      { href: "/", rotulo: "Painel", icone: "painel" },
      { href: "/agenda", rotulo: "Agenda", icone: "agenda" },
      { href: "/pacientes", rotulo: "Pacientes", icone: "pacientes" },
    ],
  },
  {
    titulo: "Resultado",
    itens: [
      { href: "/relatorios/ocupacao", rotulo: "Ocupação", icone: "relatorios" },
      { href: "/relatorios/financeiro", rotulo: "Financeiro", icone: "financeiro" },
    ],
  },
];

/** Fixada no rodapé do menu, fora dos grupos: é onde se ajusta, não onde se opera. */
const CONFIGURACOES: ItemNav = {
  href: "/configuracoes",
  rotulo: "Configurações",
  icone: "configuracoes",
};

/** A rota `/` só casa exata; as demais casam por prefixo. */
function estaAtivo(href: string, caminho: string): boolean {
  return href === "/" ? caminho === "/" : caminho.startsWith(href);
}

function ItemMenu({ item, ativo }: { item: ItemNav; ativo: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={ativo ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-[var(--r-md)] px-3 py-2 text-[13.5px] transition-colors
        ${
          ativo
            ? "bg-[var(--superficie-inversa)] font-medium text-[var(--tinta-inversa)]"
            : "text-[var(--tinta-2)] hover:bg-[var(--superficie-2)] hover:text-[var(--tinta-1)]"
        }`}
    >
      <Icone d={ICONES[item.icone]} />
      {item.rotulo}
    </Link>
  );
}

export function Navegacao() {
  const caminho = usePathname();

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="cartao flex items-center px-4 py-3.5">
        <Link href="/" aria-label="hellodoctor — início">
          <Logotipo />
        </Link>
      </div>

      <nav className="cartao flex flex-1 flex-col p-3">
        <div className="space-y-5">
          {GRUPOS.map((grupo) => (
            <div key={grupo.titulo} className="space-y-1">
              <p className="px-3 pb-1 text-[11px] font-medium tracking-wide text-[var(--tinta-3)]">
                {grupo.titulo}
              </p>
              {grupo.itens.map((item) => (
                <ItemMenu key={item.href} item={item} ativo={estaAtivo(item.href, caminho)} />
              ))}
            </div>
          ))}
        </div>

        <div className="mt-auto border-t border-[var(--traco)] pt-3">
          <ItemMenu item={CONFIGURACOES} ativo={estaAtivo(CONFIGURACOES.href, caminho)} />
        </div>
      </nav>
    </div>
  );
}

/** Migalha derivada da rota — evita repetir o título em toda página. */
export function Migalha() {
  const caminho = usePathname();

  // Em Configurações a migalha mostra a aba: "Configurações › Salas".
  const aba = ABAS_CONFIGURACAO.find((a) => caminho.startsWith(a.href));
  const todos = [
    ...GRUPOS.flatMap((g) => g.itens.map((i) => ({ ...i, grupo: g.titulo }))),
    ...(aba
      ? [{ ...CONFIGURACOES, href: aba.href, rotulo: aba.rotulo, grupo: "Configurações" }]
      : []),
  ];
  const atual =
    [...todos]
      .filter((i) => estaAtivo(i.href, caminho))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null;

  return (
    <nav aria-label="Localização" className="flex items-center gap-2 text-[13.5px]">
      <span className="text-[var(--tinta-3)]">{atual?.grupo ?? "hellodoctor"}</span>
      <span className="text-[var(--tinta-3)]" aria-hidden>
        ›
      </span>
      <span className="font-medium text-[var(--tinta-1)]">{atual?.rotulo ?? "Início"}</span>
    </nav>
  );
}
