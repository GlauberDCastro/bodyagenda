/**
 * Marca hellodoctor.
 *
 * Geometria: uma taça (∪) em cima e um arco (∩) embaixo, encostando na
 * cintura. A ordem importa — invertida (∩ em cima, ∪ embaixo) os dois fecham
 * um círculo em vez de formar o X.
 *
 * Pontas retas, não arredondadas: as hastes terminam em corte reto.
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
      {/* Taça: hastes para cima, curva embaixo. */}
      <path d="M9 6A11 11 0 0 0 31 6" stroke="currentColor" strokeWidth="6" />
      {/* Arco: curva em cima, hastes para baixo. */}
      <path d="M9 34A11 11 0 0 1 31 34" stroke="currentColor" strokeWidth="6" />
    </svg>
  );
}

export function Logotipo({ compacto = false }: { compacto?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span style={{ color: "var(--marca)" }}>
        <Marca tamanho={compacto ? 22 : 26} />
      </span>
      {!compacto && (
        // Peso único na palavra inteira, como no original.
        <span
          className="text-[16px] leading-none"
          style={{ letterSpacing: "-0.035em", fontWeight: 600 }}
        >
          hellodoctor
        </span>
      )}
    </span>
  );
}

export const NOME_PRODUTO = "hellodoctor";
export const SUBTITULO_PRODUTO = "Performance Clínica";
