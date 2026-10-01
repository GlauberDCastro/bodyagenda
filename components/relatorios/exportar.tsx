/**
 * RF-102 · links de exportação de um relatório, com os mesmos filtros da tela.
 * Link comum (não botão de JS): o navegador baixa o arquivo sozinho.
 */
export function Exportar({
  relatorio,
  params = {},
}: {
  relatorio: string;
  params?: Record<string, string | undefined>;
}) {
  const href = (formato: string) => {
    const q = new URLSearchParams(
      Object.entries({ ...params, formato }).filter((e): e is [string, string] => !!e[1]),
    );
    return `/api/exportar/${relatorio}?${q}`;
  };
  const estilo =
    "rounded-full border border-[var(--traco)] px-2.5 py-0.5 text-[12px] text-[var(--tinta-2)] transition-colors hover:bg-[var(--superficie-2)] hover:text-[var(--tinta-1)]";
  return (
    <span className="inline-flex items-center gap-1.5" aria-label="Exportar">
      <a href={href("csv")} className={estilo} download>
        CSV
      </a>
      <a href={href("xlsx")} className={estilo} download>
        XLSX
      </a>
    </span>
  );
}
