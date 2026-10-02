"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Busca que filtra enquanto digita. O termo vive na URL (`q`): a lista
 * filtrada é compartilhável e o voltar do navegador funciona.
 */
export function CampoBusca({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  const [termo, setTermo] = useState(params.get("q") ?? "");
  const primeira = useRef(true);

  useEffect(() => {
    // Não navega na montagem: a URL já reflete o termo inicial.
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    const t = setTimeout(() => {
      const q = new URLSearchParams(params);
      if (termo.trim()) q.set("q", termo.trim());
      else q.delete("q");
      router.replace(`${caminho}?${q}`, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
    // `params` muda a cada navegação; reagir a ele aqui criaria um laço.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo]);

  return (
    <div className="flex h-[52px] w-full max-w-md items-center gap-2.5 rounded-full bg-[var(--superficie)] px-5 shadow-[var(--sombra-2)] focus-within:ring-2 focus-within:ring-[var(--marca)]">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="shrink-0 text-[var(--tinta-3)]"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder={placeholder}
        aria-label="Buscar paciente"
        className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--tinta-1)] outline-none placeholder:text-[var(--tinta-3)]"
      />
    </div>
  );
}
