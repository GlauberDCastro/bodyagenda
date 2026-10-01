"use client";

import { useRouter } from "next/navigation";
import type { ColunaRecurso } from "@/lib/consultas/agenda";

/**
 * Na semana, todos os atendimentos de todas as salas no mesmo dia ficariam
 * espremidos lado a lado. O filtro mostra a semana de um recurso só.
 */
export function FiltroRecurso({
  dia,
  valor,
  recursos,
}: {
  dia: string;
  /** "sala:<id>" ou "" para todos. */
  valor: string;
  recursos: ColunaRecurso[];
}) {
  const router = useRouter();
  const grupos = [
    { tipo: "sala", rotulo: "Salas" },
    { tipo: "equipamento", rotulo: "Equipamentos" },
    { tipo: "profissional", rotulo: "Profissionais" },
  ] as const;

  return (
    <select
      aria-label="Filtrar a semana por recurso"
      value={valor}
      onChange={(e) => {
        const q = new URLSearchParams({ dia, por: "semana" });
        if (e.target.value) q.set("recurso", e.target.value);
        router.push(`/agenda?${q}`);
      }}
      className="rounded-full border border-[var(--traco)] bg-[var(--superficie)] px-3 py-1 text-sm"
    >
      <option value="">Todos os recursos</option>
      {grupos.map((g) => (
        <optgroup key={g.tipo} label={g.rotulo}>
          {recursos
            .filter((r) => r.tipo === g.tipo)
            .map((r) => (
              <option key={r.id} value={`${r.tipo}:${r.id}`}>
                {r.subtitulo && r.tipo === "sala" ? `${r.rotulo} — ${r.subtitulo}` : r.rotulo}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}
