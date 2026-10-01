import Link from "next/link";
import { atalhosDePeriodo } from "@/lib/periodos";

/**
 * RF-72 · atalhos (hoje, semana, mês, mês passado) e intervalo livre. O
 * período vive na URL, então qualquer visão é compartilhável por link.
 */
export function SeletorPeriodo({
  caminho,
  de,
  ate,
  hoje,
  manter = {},
}: {
  caminho: string;
  de: string;
  ate: string;
  hoje: string;
  /** Outros parâmetros da página que a troca de período não pode perder. */
  manter?: Record<string, string | undefined>;
}) {
  const extras = Object.fromEntries(
    Object.entries(manter).filter((e): e is [string, string] => !!e[1]),
  );
  const href = (d: string, a: string) =>
    `${caminho}?${new URLSearchParams({ ...extras, de: d, ate: a })}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav className="flex gap-0.5 rounded-full bg-[var(--superficie)] p-1 shadow-[var(--sombra-1)]">
        {atalhosDePeriodo(hoje).map((a) => {
          const ativo = a.de === de && a.ate === ate;
          return (
            <Link
              key={a.chave}
              href={href(a.de, a.ate)}
              aria-current={ativo ? "true" : undefined}
              className={`rounded-full px-3 py-1.5 text-[13px] transition-colors ${
                ativo
                  ? "bg-[var(--superficie-inversa)] font-medium text-[var(--tinta-inversa)]"
                  : "text-[var(--tinta-2)] hover:text-[var(--tinta-1)]"
              }`}
            >
              {a.rotulo}
            </Link>
          );
        })}
      </nav>
      <form
        method="get"
        action={caminho}
        className="flex items-center gap-1.5 rounded-full bg-[var(--superficie)] px-3 py-1.5 shadow-[var(--sombra-1)]"
      >
        {Object.entries(extras).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <input
          type="date"
          name="de"
          defaultValue={de}
          aria-label="Início do período"
          className="bg-transparent text-[13px] text-[var(--tinta-1)] outline-none"
        />
        <span className="text-[var(--tinta-3)]">→</span>
        <input
          type="date"
          name="ate"
          defaultValue={ate}
          aria-label="Fim do período"
          className="bg-transparent text-[13px] text-[var(--tinta-1)] outline-none"
        />
        <button
          type="submit"
          className="rounded-full px-2 text-[12.5px] text-[var(--tinta-2)] hover:text-[var(--tinta-1)]"
        >
          Ver
        </button>
      </form>
    </div>
  );
}
