"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buscarPacientesAction } from "@/lib/actions/busca";

/**
 * Busca global de paciente, com ⌘K / Ctrl+K.
 *
 * Fica no topo porque "achar o paciente" é a ação mais repetida da recepção —
 * enterrá-la num menu custa um clique dezenas de vezes por dia.
 */
export function BuscaPaciente() {
  const router = useRouter();
  const campo = useRef<HTMLInputElement>(null);
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<{ id: string; nome: string }[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    function atalho(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        campo.current?.focus();
      }
      if (e.key === "Escape") setAberto(false);
    }
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, []);

  useEffect(() => {
    if (termo.trim().length < 2) return;
    const t = setTimeout(async () => {
      setResultados(await buscarPacientesAction(termo));
      setAberto(true);
    }, 220);
    return () => clearTimeout(t);
  }, [termo]);

  // Derivado na renderização: resultado obsoleto simplesmente não aparece.
  const visiveis = termo.trim().length < 2 ? [] : resultados;

  return (
    <div className="relative hidden min-w-0 flex-1 md:block md:max-w-md">
      <div className="flex h-[52px] items-center gap-2.5 rounded-full border border-transparent bg-[var(--superficie)] px-5 shadow-[var(--sombra-2)] focus-within:border-[var(--marca)]">
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
          ref={campo}
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onFocus={() => visiveis.length > 0 && setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 160)}
          placeholder="Buscar paciente, CPF…"
          aria-label="Buscar paciente"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--tinta-1)] outline-none placeholder:text-[var(--tinta-3)]"
        />
        <kbd className="hidden shrink-0 rounded-md border border-[var(--traco)] bg-[var(--superficie-2)] px-2 py-0.5 text-[12.5px] text-[var(--tinta-3)] lg:block">
          ⌘ K
        </kbd>
      </div>

      {aberto && visiveis.length > 0 && (
        <ul className="cartao absolute inset-x-0 top-full z-20 mt-1.5 max-h-72 overflow-y-auto p-1.5 shadow-[var(--sombra-3)]">
          {visiveis.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={() => {
                  router.push(`/pacientes/${p.id}`);
                  setTermo("");
                  setAberto(false);
                }}
                className="w-full rounded-[var(--r-sm)] px-3 py-2 text-left text-[13.5px] text-[var(--tinta-1)] transition-colors hover:bg-[var(--superficie-2)]"
              >
                {p.nome}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
