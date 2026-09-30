import type { ComponentProps, ReactNode } from "react";

const base =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none " +
  "focus:border-slate-900 disabled:opacity-50 " +
  "dark:border-slate-700 dark:bg-slate-900 dark:focus:border-slate-400";

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
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {dica && !erro && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{dica}</p>
      )}
      {erro && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {erro}
        </p>
      )}
    </div>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${base} ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`${base} ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${base} ${props.className ?? ""}`} />;
}

export function Botao({
  variante = "primario",
  ...props
}: ComponentProps<"button"> & { variante?: "primario" | "secundario" | "perigo" }) {
  const estilos = {
    primario:
      "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white",
    secundario:
      "border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800",
    perigo:
      "border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950",
  }[variante];

  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${estilos} ${props.className ?? ""}`}
    />
  );
}

export function Etiqueta({
  children,
  tom = "neutro",
}: {
  children: ReactNode;
  tom?: "neutro" | "verde" | "ambar";
}) {
  const estilos = {
    neutro: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    verde: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    ambar: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  }[tom];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${estilos}`}>
      {children}
    </span>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
      {children}
    </div>
  );
}

export function AvisoBanco() {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40">
      <p className="font-medium text-amber-900 dark:text-amber-200">
        Banco de dados ainda não migrado
      </p>
      <p className="mt-1 text-amber-800 dark:text-amber-300">
        As tabelas não existem no Supabase. Acrescente{" "}
        <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">DATABASE_URL</code> ou{" "}
        <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">SUPABASE_ACCESS_TOKEN</code>{" "}
        ao <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">.env.local</code> e rode{" "}
        <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">npm run db:reset</code>.
      </p>
    </div>
  );
}
