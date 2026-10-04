"use client";

import { useRouter } from "next/navigation";
import type { ColunaRecurso } from "@/lib/consultas/agenda";
import { SeletorData } from "./seletor-data";

/** Filtro de status: o que a recepção procura no dia a dia. */
export const FILTROS_STATUS = [
  { valor: "", rotulo: "Todos" },
  { valor: "agendado", rotulo: "A confirmar" },
  { valor: "confirmado", rotulo: "Confirmados" },
  { valor: "em_atendimento", rotulo: "Em atendimento" },
  { valor: "realizado", rotulo: "Realizados" },
  { valor: "falta", rotulo: "Faltas" },
] as const;

const DIA_LONGO = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  timeZone: "UTC",
});
const MES_LONGO = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const CURTO = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });

/** "Quinta-feira, 01 de outubro" · "Semana de 28 set a 04 out" · "Outubro de 2026" */
function rotuloDaData(dia: string, periodo: string, semana: string[]): string {
  const d = new Date(`${dia}T12:00:00Z`);
  const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (periodo === "mes") return maiuscula(MES_LONGO.format(d));
  if (periodo === "semana") {
    const de = CURTO.format(new Date(`${semana[0]}T12:00:00Z`)).replace(".", "");
    const ate = CURTO.format(new Date(`${semana.at(-1)}T12:00:00Z`)).replace(".", "");
    return `Semana de ${de} a ${ate}`;
  }
  return maiuscula(DIA_LONGO.format(d));
}

const pilula =
  "inline-flex h-11 items-center rounded-full border border-[var(--traco)] bg-[var(--superficie)] px-4 text-[14.5px] text-[var(--tinta-1)] transition-colors hover:bg-[var(--superficie-2)]";

/**
 * Navegação e filtros da agenda. Tudo vive na URL: qualquer visão é
 * compartilhável por link e o botão voltar do navegador funciona.
 */
const TODOS: Record<string, string> = {
  sala: "Todas as salas",
  equipamento: "Todos os equipamentos",
  profissional: "Todos os profissionais",
};
const ROTULO_TIPO: Record<string, string> = {
  sala: "Sala",
  equipamento: "Equipamento",
  profissional: "Profissional",
};

export function BarraAgenda({
  dia,
  tipo,
  periodo,
  hoje,
  anterior,
  seguinte,
  status,
  recurso,
  recursos,
  semana,
  resumo,
  diasAbertos,
}: {
  dia: string;
  tipo: string;
  periodo: string;
  hoje: string;
  anterior: string;
  seguinte: string;
  status: string;
  recurso: string;
  recursos: ColunaRecurso[];
  semana: string[];
  resumo: string;
  /** Dias em que a clínica abre: o mini-calendário apaga os demais. */
  diasAbertos: readonly number[];
}) {
  const router = useRouter();
  const ir = (mudar: Record<string, string>) => {
    const q = new URLSearchParams({
      dia,
      por: tipo,
      ...(periodo !== "dia" && { periodo }),
      ...(status && { status }),
      ...(recurso && { recurso }),
    });
    for (const [k, v] of Object.entries(mudar)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    router.push(`/agenda?${q}`);
  };

  return (
    <div className="cartao flex flex-wrap items-end gap-x-4 gap-y-3 px-5 py-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => ir({ dia: hoje })} className={pilula}>
          Hoje
        </button>
        <button
          type="button"
          onClick={() => ir({ dia: anterior })}
          aria-label="Anterior"
          className="grid size-11 place-items-center rounded-full text-[18px] text-[var(--tinta-2)] hover:bg-[var(--superficie-2)]"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => ir({ dia: seguinte })}
          aria-label="Próximo"
          className="grid size-11 place-items-center rounded-full text-[18px] text-[var(--tinta-2)] hover:bg-[var(--superficie-2)]"
        >
          ›
        </button>
        {/* A data por extenso abre o mini-calendário: um clique leva ao dia. */}
        <SeletorData
          dia={dia}
          hoje={hoje}
          periodo={periodo}
          rotulo={rotuloDaData(dia, periodo, semana)}
          diasAbertos={diasAbertos}
          aoEscolher={(d) => ir({ dia: d })}
        />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="px-1 text-[13px] font-medium text-[var(--tinta-2)]">Status</span>
        <select
          value={status}
          onChange={(e) => ir({ status: e.target.value })}
          aria-label="Filtrar por status"
          className={`${pilula} pr-9`}
        >
          {FILTROS_STATUS.map((f) => (
            <option key={f.valor} value={f.valor}>
              {f.rotulo}
            </option>
          ))}
        </select>
      </label>

      {/* Semana e mês podem mostrar a agenda de um recurso só. */}
      {periodo !== "dia" && (
        <label className="flex flex-col gap-1.5">
          <span className="px-1 text-[13px] font-medium text-[var(--tinta-2)]">
            {ROTULO_TIPO[tipo]}
          </span>
          <select
            value={recurso}
            onChange={(e) => ir({ recurso: e.target.value })}
            aria-label={`Escolher ${ROTULO_TIPO[tipo].toLowerCase()}`}
            className={`${pilula} pr-9`}
          >
            <option value="">{TODOS[tipo]}</option>
            {recursos.map((r) => (
              <option key={r.id} value={`${r.tipo}:${r.id}`}>
                {r.subtitulo && r.tipo === "sala" ? `${r.rotulo} — ${r.subtitulo}` : r.rotulo}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="ml-auto self-center text-[13.5px] text-[var(--tinta-2)]">{resumo}</p>
    </div>
  );
}
