/**
 * Marca hellodoctor — dois arcos espessos que se encontram na cintura,
 * formando um X. Desenhado em SVG para escalar sem perda e herdar a cor.
 */
export function Marca({ tamanho = 28 }: { tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
      focusable="false"
    >
      {/* Arco superior: apoia em baixo e sobe — "∩".
          Arco inferior: apoia em cima e desce — "∪".
          O vão de 2px na cintura é o que faz os dois lerem como um X em vez
          de um círculo partido. */}
      <path
        d="M8 17A15 15 0 0 1 32 17"
        stroke="currentColor"
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <path
        d="M8 23A15 15 0 0 0 32 23"
        stroke="currentColor"
        strokeWidth="5.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logotipo({ compacto = false }: { compacto?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span style={{ color: "var(--marca)" }}>
        <Marca tamanho={compacto ? 24 : 26} />
      </span>
      {!compacto && (
        <span className="text-[15px] leading-none" style={{ letterSpacing: "-0.03em" }}>
          <span style={{ fontWeight: 400 }}>hello</span>
          <span style={{ fontWeight: 650 }}>doctor</span>
        </span>
      )}
    </span>
  );
}

/** Nome completo do produto, para telas de entrada e metadados. */
export const NOME_PRODUTO = "hellodoctor";
export const SUBTITULO_PRODUTO = "Performance Clínica";
