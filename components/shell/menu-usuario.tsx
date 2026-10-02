"use client";

import { useEffect, useRef, useState } from "react";
import { sair } from "@/lib/actions/auth";

/** Pílula do usuário no topo; "Sair" fica no menu, não exposto ao lado. */
export function MenuUsuario({ nome, perfil }: { nome: string; perfil: string }) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: PointerEvent) {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    window.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", fora);
      window.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        className="flex items-center gap-3 rounded-full bg-[var(--superficie)] py-1.5 pl-1.5 pr-4 shadow-[var(--sombra-2)] transition-colors hover:bg-[var(--superficie-2)]"
      >
        <span
          className="grid size-10 place-items-center rounded-full text-[15px] font-semibold text-white"
          style={{ background: "linear-gradient(135deg, var(--marca), oklch(0.6 0.19 300))" }}
          aria-hidden
        >
          {nome.charAt(0).toUpperCase()}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[15px] font-semibold text-[var(--tinta-1)]">{nome}</span>
          <span className="block text-[13px] text-[var(--tinta-3)]">{perfil}</span>
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-[var(--tinta-3)] transition-transform ${aberto ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {aberto && (
        <div
          role="menu"
          className="cartao absolute right-0 top-full z-30 mt-2 min-w-48 p-1.5 shadow-[var(--sombra-3)]"
        >
          <form action={sair}>
            <button
              type="submit"
              role="menuitem"
              className="w-full rounded-[var(--r-sm)] px-3 py-2 text-left text-[14.5px] text-[var(--tinta-2)] hover:bg-[var(--superficie-2)] hover:text-[var(--tinta-1)]"
            >
              Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
