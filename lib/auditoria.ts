/** Campos que mudam sozinhos e não dizem nada a quem lê a auditoria. */
const IGNORADOS = new Set(["updated_at", "created_at"]);

export interface Mudanca {
  campo: string;
  antes: unknown;
  depois: unknown;
}

/** O que mudou entre o antes e o depois de uma edição. */
export function diferencas(
  antes: Record<string, unknown> | null,
  depois: Record<string, unknown> | null,
): Mudanca[] {
  if (!antes || !depois) return [];
  return Object.keys({ ...antes, ...depois })
    .filter((c) => !IGNORADOS.has(c))
    .filter((c) => JSON.stringify(antes[c]) !== JSON.stringify(depois[c]))
    .map((campo) => ({ campo, antes: antes[campo], depois: depois[campo] }));
}

/** Nome legível do registro: nome, descrição ou, por fim, o início. */
export function rotuloDoRegistro(dados: Record<string, unknown> | null): string {
  if (!dados) return "—";
  for (const c of ["nome", "descricao", "email"]) {
    if (typeof dados[c] === "string" && dados[c]) return dados[c] as string;
  }
  if (typeof dados.numero === "number") return `Nº ${dados.numero}`;
  if (typeof dados.inicio === "string") return dados.inicio.slice(0, 16).replace("T", " ");
  return "—";
}
