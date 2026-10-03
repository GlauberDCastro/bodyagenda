import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";

/* ── Campos ─────────────────────────────────────────────────────────────── */

const campoBase =
  "w-full rounded-[var(--r-md)] border border-[var(--traco)] bg-[var(--superficie-2)] " +
  "px-3.5 py-2.5 text-[14px] text-[var(--tinta-1)] outline-none transition " +
  "placeholder:text-[var(--tinta-3)] " +
  "focus:border-[var(--marca)] focus:bg-[var(--superficie)] " +
  "disabled:opacity-45";

/** O que pode receber o rótulo do Campo: os campos do sistema e os nativos. */
function ehControle(no: ReactNode): no is ReactElement<ControleProps> {
  if (!isValidElement(no)) return false;
  const tipo = no.type as unknown;
  const controle =
    tipo === Input || tipo === Select || tipo === Textarea || tipo === "input" ||
    tipo === "select" || tipo === "textarea";
  return controle && (no.props as ControleProps).type !== "hidden";
}

interface ControleProps {
  id?: string;
  type?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
}

/**
 * Rótulo, campo, dica e erro.
 *
 * O rótulo aponta para o primeiro campo dentro dele (htmlFor + id gerado), e
 * a dica ou o erro são anunciados junto (aria-describedby): leitor de tela
 * diz "Nome da clínica, campo de texto" em vez de só "campo de texto". Sem
 * campo único dentro (lista de caixas de marcar), o rótulo vira o nome do grupo.
 */
export function Campo({
  label,
  erro,
  dica,
  children,
}: {
  label: string;
  erro?: string;
  dica?: string;
  children: ReactNode;
}) {
  const base = useId();
  const idDescricao = erro || dica ? `${base}-descricao` : undefined;
  const itens = Children.toArray(children);
  const i = itens.findIndex(ehControle);

  const descricao = (
    <>
      {dica && !erro && (
        <p id={idDescricao} className="text-[12px] leading-snug text-[var(--tinta-3)]">
          {dica}
        </p>
      )}
      {erro && (
        <p
          id={idDescricao}
          role="alert"
          className="text-[12px] leading-snug"
          style={{ color: "var(--status-critico)" }}
        >
          {erro}
        </p>
      )}
    </>
  );

  if (i >= 0) {
    const controle = itens[i] as ReactElement<ControleProps>;
    const id = controle.props.id ?? `${base}-campo`;
    itens[i] = cloneElement(controle, {
      id,
      "aria-describedby":
        [controle.props["aria-describedby"], idDescricao].filter(Boolean).join(" ") || undefined,
      "aria-invalid": erro ? true : controle.props["aria-invalid"],
    });
    return (
      <div className="space-y-1.5">
        <label htmlFor={id} className="block text-[13px] font-medium text-[var(--tinta-1)]">
          {label}
        </label>
        {itens}
        {descricao}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-labelledby={`${base}-rotulo`}
      aria-describedby={idDescricao}
      className="space-y-1.5"
    >
      <span id={`${base}-rotulo`} className="block text-[13px] font-medium text-[var(--tinta-1)]">
        {label}
      </span>
      {itens}
      {descricao}
    </div>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${campoBase} ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`${campoBase} ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${campoBase} resize-y ${props.className ?? ""}`} />;
}

/* ── Botões ─────────────────────────────────────────────────────────────── */

export function Botao({
  variante = "primario",
  ...props
}: ComponentProps<"button"> & {
  variante?: "primario" | "secundario" | "fantasma" | "perigo";
}) {
  const estilos: Record<string, string> = {
    primario:
      "bg-[var(--superficie-inversa)] text-[var(--tinta-inversa)] shadow-[var(--sombra-1)] " +
      "hover:opacity-90 active:scale-[0.985]",
    secundario:
      "bg-[var(--superficie)] text-[var(--tinta-1)] border border-[var(--traco)] " +
      "shadow-[var(--sombra-1)] hover:bg-[var(--superficie-2)] active:scale-[0.985]",
    fantasma: "text-[var(--tinta-2)] hover:bg-[var(--superficie-2)] hover:text-[var(--tinta-1)]",
    perigo: "bg-[var(--superficie)] border border-[var(--traco)] hover:bg-[var(--superficie-2)]",
  };

  return (
    <button
      {...props}
      style={variante === "perigo" ? { color: "var(--status-critico)" } : props.style}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5
        text-[13.5px] font-medium transition-all duration-150
        disabled:pointer-events-none disabled:opacity-45
        ${estilos[variante]} ${props.className ?? ""}`}
    />
  );
}

/* ── Superfícies ────────────────────────────────────────────────────────── */

export function Cartao({
  children,
  className = "",
  padding = "p-5",
}: {
  children: ReactNode;
  className?: string;
  padding?: string;
}) {
  return <div className={`cartao ${padding} ${className}`}>{children}</div>;
}

export function Secao({
  titulo,
  descricao,
  acao,
  children,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="titulo-md">{titulo}</h2>
          {descricao && (
            <p className="mt-0.5 text-[12.5px] leading-snug text-[var(--tinta-3)]">{descricao}</p>
          )}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

/* ── Sinalização ────────────────────────────────────────────────────────── */

/**
 * Etiqueta de estado.
 *
 * `bom` / `atencao` / `critico` usam a paleta de status, que é fixa e nunca
 * tematizada — e sempre acompanhada do rótulo, porque cor sozinha não carrega
 * estado para quem não a distingue.
 */
export function Etiqueta({
  children,
  tom = "neutro",
}: {
  children: ReactNode;
  tom?: "neutro" | "bom" | "atencao" | "critico" | "marca";
}) {
  const paleta: Record<string, { fundo: string; texto: string }> = {
    neutro: {
      fundo: "color-mix(in oklab, var(--tinta-3) 12%, transparent)",
      texto: "var(--tinta-2)",
    },
    bom: {
      fundo: "color-mix(in oklab, var(--status-bom) 14%, transparent)",
      texto: "color-mix(in oklab, var(--status-bom) 78%, var(--tinta-1))",
    },
    atencao: {
      fundo: "color-mix(in oklab, var(--status-atencao) 20%, transparent)",
      texto: "color-mix(in oklab, var(--status-atencao) 55%, var(--tinta-1))",
    },
    critico: {
      fundo: "color-mix(in oklab, var(--status-critico) 14%, transparent)",
      texto: "color-mix(in oklab, var(--status-critico) 80%, var(--tinta-1))",
    },
    marca: {
      fundo: "var(--marca-suave)",
      texto: "var(--marca)",
    },
  };
  const cores = paleta[tom] ?? paleta.neutro;

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap"
      style={{ background: cores.fundo, color: cores.texto }}
    >
      {children}
    </span>
  );
}

/** Variação percentual. O sinal e a seta vêm junto — nunca só a cor. */
export function Delta({ valor }: { valor: number | null }) {
  if (valor === null) return null;
  const positivo = valor >= 0;
  return (
    <Etiqueta tom={positivo ? "bom" : "critico"}>
      {positivo ? "↑" : "↓"} {Math.abs(valor * 100).toFixed(1)}%
    </Etiqueta>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--traco-forte)] p-10 text-center text-[13.5px] leading-relaxed text-[var(--tinta-3)]">
      {children}
    </div>
  );
}

export function Aviso({
  children,
  tom = "atencao",
}: {
  children: ReactNode;
  tom?: "atencao" | "critico" | "neutro";
}) {
  const cor =
    tom === "critico"
      ? "var(--status-critico)"
      : tom === "neutro"
        ? "var(--tinta-3)"
        : "var(--status-atencao)";
  return (
    <div
      className="rounded-[var(--r-md)] px-4 py-3 text-[13px] leading-relaxed"
      style={{
        background: `color-mix(in oklab, ${cor} 9%, transparent)`,
        color: `color-mix(in oklab, ${cor} 45%, var(--tinta-1))`,
      }}
    >
      {children}
    </div>
  );
}

export function AvisoBanco() {
  return (
    <Aviso>
      <p className="font-semibold">Banco de dados ainda não migrado</p>
      <p className="mt-1">
        As tabelas não existem no Supabase. Acrescente{" "}
        <code className="rounded px-1 font-mono text-[12px]">DATABASE_URL</code> ao{" "}
        <code className="rounded px-1 font-mono text-[12px]">.env.local</code> e rode{" "}
        <code className="rounded px-1 font-mono text-[12px]">npm run db:reset</code>.
      </p>
    </Aviso>
  );
}

/* ── Tabela ─────────────────────────────────────────────────────────────── */

export function Tabela({ children }: { children: ReactNode }) {
  return (
    <div className="cartao overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">{children}</table>
      </div>
    </div>
  );
}

export function Cabecalho({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-[var(--traco)] text-left text-[12px] font-medium text-[var(--tinta-3)]">
        {children}
      </tr>
    </thead>
  );
}

export function Th({
  children,
  alinhar = "left",
}: {
  children?: ReactNode;
  alinhar?: "left" | "right";
}) {
  return (
    <th className={`px-4 py-2.5 font-medium ${alinhar === "right" ? "text-right" : ""}`}>
      {children}
    </th>
  );
}

export function Tr({ children }: { children: ReactNode }) {
  return (
    <tr className="border-b border-[var(--traco)] transition-colors last:border-0 hover:bg-[var(--superficie-2)]">
      {children}
    </tr>
  );
}

export function Td({
  children,
  alinhar = "left",
  forte = false,
}: {
  children?: ReactNode;
  alinhar?: "left" | "right";
  forte?: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 ${alinhar === "right" ? "text-right tabular-nums" : ""} ${
        forte ? "font-medium text-[var(--tinta-1)]" : "text-[var(--tinta-2)]"
      }`}
    >
      {children}
    </td>
  );
}
