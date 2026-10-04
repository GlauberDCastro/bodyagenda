"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Modal de cadastro.
 *
 * Usa o `<dialog>` nativo em vez de uma div posicionada: ele já entrega
 * armadilha de foco, fechar no ESC, fundo inerte para leitor de tela e
 * `::backdrop` — tudo isso teria que ser reimplementado à mão, e
 * normalmente é reimplementado errado.
 */
export function Modal({
  aberto,
  aoFechar,
  titulo,
  descricao,
  largura = "max-w-lg",
  topo,
  rodape,
  children,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: string;
  largura?: string;
  /** Linha sob o título, no cabeçalho fixo: status, atalhos. */
  topo?: ReactNode;
  /** Ações fixas no pé, fora da rolagem: sempre à vista. */
  rodape?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Um id por modal: com id fixo, vários modais na página se anunciavam
  // com o título do primeiro.
  const idTitulo = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) {
      d.showModal();
      // O foco vai para o próprio modal, não para o primeiro botão (o X):
      // assim ele não abre com o contorno de foco, e Tab segue a ordem.
      d.focus();
    }
    if (!aberto && d.open) d.close();
  }, [aberto]);

  // O ESC dispara `cancel` no próprio <dialog>; refletimos no estado do pai
  // para que os dois não saiam de sincronia.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const aoCancelar = (e: Event) => {
      e.preventDefault();
      aoFechar();
    };
    d.addEventListener("cancel", aoCancelar);
    return () => d.removeEventListener("cancel", aoCancelar);
  }, [aoFechar]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      onClick={(e) => {
        // Clique no backdrop fecha; clique dentro do cartão não.
        if (e.target === ref.current) aoFechar();
      }}
      tabIndex={-1}
      className={`w-[calc(100vw-2rem)] ${largura} flex-col overflow-hidden rounded-[var(--r-xl)] border border-[var(--traco)] bg-[var(--superficie)] p-0
        text-[var(--tinta-1)] shadow-[0_24px_64px_-16px_oklch(0.15_0.02_285/0.45)] outline-none focus-visible:outline-none
        backdrop:bg-[oklch(0.12_0.02_285_/_0.58)] backdrop:backdrop-blur-[3px]
        open:flex open:animate-[surgir_160ms_ease-out]`}
    >
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--traco)] px-6 pb-4 pt-5">
        <div className="min-w-0 flex-1">
          <h2 id={idTitulo} className="titulo-lg">
            {titulo}
          </h2>
          {descricao && (
            <p className="mt-1 text-[13.5px] leading-snug text-[var(--tinta-2)]">{descricao}</p>
          )}
          {topo && <div className="mt-3">{topo}</div>}
        </div>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar"
          className="-mr-1.5 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-[var(--tinta-2)] transition-colors hover:bg-[var(--superficie-2)] hover:text-[var(--tinta-1)]"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {/* O corpo rola sozinho: formulário longo não pode empurrar os botões
          para fora da tela em notebook de tela baixa. */}
      <div className="max-h-[calc(100dvh-12rem)] min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {children}
      </div>
      {rodape && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--traco)] bg-[var(--superficie-2)] px-6 py-3.5">
          {rodape}
        </div>
      )}
    </dialog>
  );
}

/**
 * Botão que abre um modal de cadastro.
 *
 * Evita repetir o par botão + estado + modal em cada formulário. O filho
 * recebe `fechar` para chamar depois de salvar com sucesso.
 */
export function GatilhoModal({
  rotulo,
  titulo,
  descricao,
  largura,
  aberto,
  aoMudar,
  children,
  variante = "primario",
  desabilitado,
}: {
  rotulo: string;
  titulo: string;
  descricao?: string;
  largura?: string;
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  children: ReactNode;
  variante?: "primario" | "secundario";
  desabilitado?: boolean;
}) {
  const estilo =
    variante === "primario"
      ? "bg-[var(--superficie-inversa)] text-[var(--tinta-inversa)] shadow-[var(--sombra-1)] hover:opacity-90"
      : "bg-[var(--superficie)] text-[var(--tinta-1)] border border-[var(--traco)] shadow-[var(--sombra-1)] hover:bg-[var(--superficie-2)]";

  return (
    <>
      <button
        type="button"
        disabled={desabilitado}
        onClick={() => aoMudar(true)}
        className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[13.5px]
          font-medium transition-all duration-150 active:scale-[0.985]
          disabled:pointer-events-none disabled:opacity-45 ${estilo}`}
      >
        {rotulo}
      </button>

      <Modal
        aberto={aberto}
        aoFechar={() => aoMudar(false)}
        titulo={titulo}
        descricao={descricao}
        largura={largura}
      >
        {children}
      </Modal>
    </>
  );
}

/**
 * Rodapé padrão dos formulários em modal: gruda no pé da área que rola, então
 * Salvar e Cancelar ficam à vista mesmo num formulário longo.
 */
export function AcoesModal({
  children,
  aoCancelar,
}: {
  children: ReactNode;
  aoCancelar: () => void;
}) {
  return (
    <div className="sticky -bottom-5 z-10 -mx-6 -mb-5 mt-6 flex justify-end gap-2 border-t border-[var(--traco)] bg-[var(--superficie-2)] px-6 py-3.5">
      <button
        type="button"
        onClick={aoCancelar}
        className="rounded-full border border-[var(--traco-forte)] bg-[var(--superficie)] px-4 py-2.5 text-[13.5px] font-medium text-[var(--tinta-1)] transition-colors hover:bg-[var(--superficie-2)]"
      >
        Cancelar
      </button>
      {children}
    </div>
  );
}
