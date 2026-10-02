"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

/**
 * O que o formulário já sabe ao abrir: no clique num horário vazio, quando e
 * em qual recurso; na edição, o atendimento inteiro.
 */
export interface PresetAgendamento {
  /** "2026-10-06T09:15", no horário da clínica. */
  inicio?: string;
  /** "10:30": fim do intervalo arrastado na grade. Só informativo. */
  fim?: string;
  sala_id?: string;
  equipamentos?: string[];
  profissionais?: string[];
  /** Ficha do paciente e "agendar próxima sessão" já chegam com o paciente. */
  paciente?: { id: string; nome: string };
  procedimento_id?: string;
  pacote_id?: string;
  duracao_min?: number | null;
  observacoes?: string | null;
  valor_avulso?: number | null;
  /** Presente = editar este atendimento em vez de criar outro. */
  edicao?: {
    id: string;
    /** "Ultraformer MPT · sessão 2 de 3", ou ausente quando é avulsa. */
    pacote?: string;
  };
}

interface Contexto {
  aberto: boolean;
  preset: PresetAgendamento;
  /** Muda a cada abertura: remonta o formulário com os valores novos. */
  versao: number;
  abrir: (preset?: PresetAgendamento) => void;
  fechar: () => void;
}

const ContextoAgendamento = createContext<Contexto | null>(null);

/**
 * Liga o botão "Novo agendamento" do cabeçalho ao clique na grade da agenda:
 * os dois abrem o mesmo formulário, o segundo já preenchido.
 */
export function ProvedorAgendamento({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const [preset, setPreset] = useState<PresetAgendamento>({});
  const [versao, setVersao] = useState(0);

  const abrir = useCallback((p: PresetAgendamento = {}) => {
    setPreset(p);
    setVersao((v) => v + 1);
    setAberto(true);
  }, []);
  const fechar = useCallback(() => setAberto(false), []);

  return (
    <ContextoAgendamento.Provider value={{ aberto, preset, versao, abrir, fechar }}>
      {children}
    </ContextoAgendamento.Provider>
  );
}

export function useAgendamento(): Contexto {
  const c = useContext(ContextoAgendamento);
  if (!c) throw new Error("useAgendamento fora do ProvedorAgendamento");
  return c;
}
