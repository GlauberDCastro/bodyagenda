"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Marca } from "@/components/ui/logo";
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
  comissoes: "M12 3v18M17 7H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H7",
  recebimentos: "M3 7h18v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Zm0 3h18M7 15h3",
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
    titulo: "Atendimento",
    itens: [
      { href: "/", rotulo: "Painel", icone: "painel" },
      { href: "/agenda", rotulo: "Agenda", icone: "agenda" },
      { href: "/pacientes", rotulo: "Pacientes", icone: "pacientes" },
    ],
  },
  {
    titulo: "Clínica",
    itens: [{ href: "/relatorios/ocupacao", rotulo: "Ocupação", icone: "relatorios" }],
  },
  {
    titulo: "Financeiro",
    itens: [
      { href: "/recebimentos", rotulo: "Recebimentos", icone: "recebimentos" },
      { href: "/relatorios/financeiro", rotulo: "Financeiro", icone: "financeiro" },
      { href: "/comissoes", rotulo: "Comissões", icone: "comissoes" },
    ],
  },
];

/** Fica no grupo "Sistema", no fim do menu: é onde se ajusta, não onde se opera. */
const CONFIGURACOES: ItemNav = {
  href: "/configuracoes",
  rotulo: "Configurações",
  icone: "configuracoes",
};

const ICONE_RECOLHER = "M4 5h16v14H4zM9 5v14M15.5 10 13.5 12l2 2";

/** A rota `/` só casa exata; as demais casam por prefixo. */
function estaAtivo(href: string, caminho: string): boolean {
  return href === "/" ? caminho === "/" : caminho.startsWith(href);
}

function ItemMenu({
  item,
  ativo,
  recolhido,
}: {
  item: ItemNav;
  ativo: boolean;
  recolhido: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={ativo ? "page" : undefined}
      aria-label={recolhido ? item.rotulo : undefined}
      title={recolhido ? item.rotulo : undefined}
      className={`flex items-center gap-3 rounded-full py-2.5 text-[15px] transition-colors
        ${recolhido ? "justify-center px-0" : "px-4"}
        ${
          ativo
            ? "bg-[var(--superficie-inversa)] font-medium text-[var(--tinta-inversa)] shadow-[var(--sombra-3)]"
            : "text-[var(--tinta-2)] hover:bg-[var(--superficie-2)] hover:text-[var(--tinta-1)]"
        }`}
    >
      <Icone d={ICONES[item.icone]} tamanho={20} />
      {!recolhido && item.rotulo}
    </Link>
  );
}

/** Cookie, não localStorage: o servidor já renderiza o menu no estado certo. */
const COOKIE_RECOLHIDO = "hd_menu_recolhido";

export function Navegacao({ recolhidoInicial = false }: { recolhidoInicial?: boolean }) {
  const caminho = usePathname();
  const [recolhido, setRecolhido] = useState(recolhidoInicial);

  function alternar() {
    const novo = !recolhido;
    setRecolhido(novo);
    document.cookie = `${COOKIE_RECOLHIDO}=${novo ? 1 : 0}; path=/; max-age=31536000; samesite=lax`;
  }

  const grupos = [...GRUPOS, { titulo: "Sistema", itens: [CONFIGURACOES] }];

  return (
    <aside
      className={`hidden shrink-0 transition-[width] duration-200 lg:block ${
        recolhido ? "w-[84px]" : "w-[260px]"
      }`}
    >
      <div className="sticky top-3 flex h-[calc(100dvh-1.5rem)] flex-col gap-3">
        <Link
          href="/"
          aria-label="hellodoctor — início"
          className={`flex items-center gap-3 py-2 ${recolhido ? "justify-center" : "px-2"}`}
        >
          <span
            className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--superficie)] shadow-[var(--sombra-2)]"
            style={{ color: "var(--marca)" }}
          >
            <Marca tamanho={24} />
          </span>
          {!recolhido && (
            <span
              className="text-[22px] leading-none"
              style={{ letterSpacing: "-0.035em", fontWeight: 600 }}
            >
              hellodoctor
            </span>
          )}
        </Link>

        <nav className="cartao flex-1 overflow-y-auto p-3">
          <div className="space-y-5">
            {grupos.map((grupo) => (
              <div key={grupo.titulo} className="space-y-1">
                {recolhido ? (
                  <hr className="mx-3 mb-2 border-[var(--traco)] first:hidden" />
                ) : (
                  <p className="px-4 pb-1 pt-1 text-[13px] text-[var(--tinta-3)]">{grupo.titulo}</p>
                )}
                {grupo.itens.map((item) => (
                  <ItemMenu
                    key={item.href}
                    item={item}
                    ativo={estaAtivo(item.href, caminho)}
                    recolhido={recolhido}
                  />
                ))}
              </div>
            ))}
          </div>
        </nav>

        <button
          type="button"
          onClick={alternar}
          aria-expanded={!recolhido}
          aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
          className={`cartao flex items-center gap-3 py-3.5 text-[15px] text-[var(--tinta-2)] transition-colors hover:text-[var(--tinta-1)] ${
            recolhido ? "justify-center" : "px-5"
          }`}
        >
          <span className={recolhido ? "rotate-180" : undefined}>
            <Icone d={ICONE_RECOLHER} tamanho={20} />
          </span>
          {!recolhido && "Recolher menu"}
        </button>
      </div>
    </aside>
  );
}

/** Migalha derivada da rota: "Painel › Agenda", "Configurações › Salas". */
export function Migalha() {
  const caminho = usePathname();

  const aba = ABAS_CONFIGURACAO.find((a) => caminho.startsWith(a.href));
  const todos = [...GRUPOS.flatMap((g) => g.itens), CONFIGURACOES];
  const atual =
    todos
      .filter((i) => estaAtivo(i.href, caminho))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null;

  const raiz = aba ? CONFIGURACOES : { href: "/", rotulo: "Painel" };
  const folha = aba?.rotulo ?? (atual && atual.href !== "/" ? atual.rotulo : null);

  return (
    <nav aria-label="Localização" className="flex items-center gap-2.5 px-2 text-[15px]">
      {folha ? (
        <>
          <Link href={raiz.href} className="text-[var(--tinta-3)] hover:text-[var(--tinta-1)]">
            {raiz.rotulo}
          </Link>
          <span className="text-[var(--tinta-3)]" aria-hidden>
            ›
          </span>
          <span className="font-medium text-[var(--tinta-1)]">{folha}</span>
        </>
      ) : (
        <span className="font-medium text-[var(--tinta-1)]">Painel</span>
      )}
    </nav>
  );
}
