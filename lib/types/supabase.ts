export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      _migracao_aplicada: {
        Row: {
          aplicada_em: string;
          nome: string;
        };
        Insert: {
          aplicada_em?: string;
          nome: string;
        };
        Update: {
          aplicada_em?: string;
          nome?: string;
        };
        Relationships: [];
      };
      agendamento: {
        Row: {
          created_at: string;
          criado_por: string | null;
          fim: string;
          id: string;
          inicio: string;
          motivo_cancelamento: string | null;
          numero_sessao: number | null;
          observacoes: string | null;
          paciente_id: string;
          pacote_id: string | null;
          procedimento_id: string;
          sala_id: string;
          status: Database["public"]["Enums"]["status_agendamento"];
          updated_at: string;
          valor_avulso: number | null;
        };
        Insert: {
          created_at?: string;
          criado_por?: string | null;
          fim: string;
          id?: string;
          inicio: string;
          motivo_cancelamento?: string | null;
          numero_sessao?: number | null;
          observacoes?: string | null;
          paciente_id: string;
          pacote_id?: string | null;
          procedimento_id: string;
          sala_id: string;
          status?: Database["public"]["Enums"]["status_agendamento"];
          updated_at?: string;
          valor_avulso?: number | null;
        };
        Update: {
          created_at?: string;
          criado_por?: string | null;
          fim?: string;
          id?: string;
          inicio?: string;
          motivo_cancelamento?: string | null;
          numero_sessao?: number | null;
          observacoes?: string | null;
          paciente_id?: string;
          pacote_id?: string | null;
          procedimento_id?: string;
          sala_id?: string;
          status?: Database["public"]["Enums"]["status_agendamento"];
          updated_at?: string;
          valor_avulso?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "agendamento_criado_por_fkey";
            columns: ["criado_por"];
            isOneToOne: false;
            referencedRelation: "usuario";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agendamento_paciente_id_fkey";
            columns: ["paciente_id"];
            isOneToOne: false;
            referencedRelation: "paciente";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agendamento_pacote_id_fkey";
            columns: ["pacote_id"];
            isOneToOne: false;
            referencedRelation: "pacote";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agendamento_procedimento_id_fkey";
            columns: ["procedimento_id"];
            isOneToOne: false;
            referencedRelation: "procedimento";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agendamento_sala_id_fkey";
            columns: ["sala_id"];
            isOneToOne: false;
            referencedRelation: "sala";
            referencedColumns: ["id"];
          },
        ];
      };
      agendamento_equipamento: {
        Row: {
          agendamento_id: string;
          equipamento_id: string;
        };
        Insert: {
          agendamento_id: string;
          equipamento_id: string;
        };
        Update: {
          agendamento_id?: string;
          equipamento_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agendamento_equipamento_agendamento_id_fkey";
            columns: ["agendamento_id"];
            isOneToOne: false;
            referencedRelation: "agendamento";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agendamento_equipamento_equipamento_id_fkey";
            columns: ["equipamento_id"];
            isOneToOne: false;
            referencedRelation: "equipamento";
            referencedColumns: ["id"];
          },
        ];
      };
      agendamento_profissional: {
        Row: {
          agendamento_id: string;
          papel: string | null;
          profissional_id: string;
        };
        Insert: {
          agendamento_id: string;
          papel?: string | null;
          profissional_id: string;
        };
        Update: {
          agendamento_id?: string;
          papel?: string | null;
          profissional_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agendamento_profissional_agendamento_id_fkey";
            columns: ["agendamento_id"];
            isOneToOne: false;
            referencedRelation: "agendamento";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agendamento_profissional_profissional_id_fkey";
            columns: ["profissional_id"];
            isOneToOne: false;
            referencedRelation: "profissional";
            referencedColumns: ["id"];
          },
        ];
      };
      auditoria: {
        Row: {
          acao: string;
          created_at: string;
          dados_anteriores: Json | null;
          dados_novos: Json | null;
          entidade: string;
          entidade_id: string | null;
          id: number;
          usuario_id: string | null;
        };
        Insert: {
          acao: string;
          created_at?: string;
          dados_anteriores?: Json | null;
          dados_novos?: Json | null;
          entidade: string;
          entidade_id?: string | null;
          id?: number;
          usuario_id?: string | null;
        };
        Update: {
          acao?: string;
          created_at?: string;
          dados_anteriores?: Json | null;
          dados_novos?: Json | null;
          entidade?: string;
          entidade_id?: string | null;
          id?: number;
          usuario_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "auditoria_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "usuario";
            referencedColumns: ["id"];
          },
        ];
      };
      equipamento: {
        Row: {
          ativo: boolean;
          created_at: string;
          custo_aquisicao: number | null;
          id: string;
          modelo: string;
          nome: string;
          numero_serie: string | null;
          sala_id: string | null;
          tipo_alocacao: Database["public"]["Enums"]["alocacao_equipamento"];
          updated_at: string;
          vigencia_fim: string | null;
          vigencia_inicio: string;
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          custo_aquisicao?: number | null;
          id?: string;
          modelo: string;
          nome: string;
          numero_serie?: string | null;
          sala_id?: string | null;
          tipo_alocacao?: Database["public"]["Enums"]["alocacao_equipamento"];
          updated_at?: string;
          vigencia_fim?: string | null;
          vigencia_inicio?: string;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          custo_aquisicao?: number | null;
          id?: string;
          modelo?: string;
          nome?: string;
          numero_serie?: string | null;
          sala_id?: string | null;
          tipo_alocacao?: Database["public"]["Enums"]["alocacao_equipamento"];
          updated_at?: string;
          vigencia_fim?: string | null;
          vigencia_inicio?: string;
        };
        Relationships: [
          {
            foreignKeyName: "equipamento_sala_id_fkey";
            columns: ["sala_id"];
            isOneToOne: false;
            referencedRelation: "sala";
            referencedColumns: ["id"];
          },
        ];
      };
      equipamento_custo: {
        Row: {
          custo_hora: number;
          equipamento_id: string;
        };
        Insert: {
          custo_hora?: number;
          equipamento_id: string;
        };
        Update: {
          custo_hora?: number;
          equipamento_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "equipamento_custo_equipamento_id_fkey";
            columns: ["equipamento_id"];
            isOneToOne: true;
            referencedRelation: "equipamento";
            referencedColumns: ["id"];
          },
        ];
      };
      paciente: {
        Row: {
          ativo: boolean;
          consentimento_em: string | null;
          consentimento_lgpd: boolean;
          cpf: string | null;
          created_at: string;
          data_nascimento: string | null;
          email: string | null;
          endereco: string | null;
          id: string;
          nome: string;
          observacoes: string | null;
          telefone: string | null;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          consentimento_em?: string | null;
          consentimento_lgpd?: boolean;
          cpf?: string | null;
          created_at?: string;
          data_nascimento?: string | null;
          email?: string | null;
          endereco?: string | null;
          id?: string;
          nome: string;
          observacoes?: string | null;
          telefone?: string | null;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          consentimento_em?: string | null;
          consentimento_lgpd?: boolean;
          cpf?: string | null;
          created_at?: string;
          data_nascimento?: string | null;
          email?: string | null;
          endereco?: string | null;
          id?: string;
          nome?: string;
          observacoes?: string | null;
          telefone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      pacote: {
        Row: {
          created_at: string;
          data_venda: string;
          desconto: number;
          id: string;
          paciente_id: string;
          procedimento_id: string;
          quantidade_sessoes: number;
          status: Database["public"]["Enums"]["status_pacote"];
          validade: string | null;
          valor_total: number;
          vendido_por: string | null;
        };
        Insert: {
          created_at?: string;
          data_venda?: string;
          desconto?: number;
          id?: string;
          paciente_id: string;
          procedimento_id: string;
          quantidade_sessoes: number;
          status?: Database["public"]["Enums"]["status_pacote"];
          validade?: string | null;
          valor_total: number;
          vendido_por?: string | null;
        };
        Update: {
          created_at?: string;
          data_venda?: string;
          desconto?: number;
          id?: string;
          paciente_id?: string;
          procedimento_id?: string;
          quantidade_sessoes?: number;
          status?: Database["public"]["Enums"]["status_pacote"];
          validade?: string | null;
          valor_total?: number;
          vendido_por?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pacote_paciente_id_fkey";
            columns: ["paciente_id"];
            isOneToOne: false;
            referencedRelation: "paciente";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pacote_procedimento_id_fkey";
            columns: ["procedimento_id"];
            isOneToOne: false;
            referencedRelation: "procedimento";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pacote_vendido_por_fkey";
            columns: ["vendido_por"];
            isOneToOne: false;
            referencedRelation: "usuario";
            referencedColumns: ["id"];
          },
        ];
      };
      procedimento: {
        Row: {
          ativo: boolean;
          buffer_min: number;
          created_at: string;
          descricao: string | null;
          duracao_min: number;
          id: string;
          intervalo_min_dias: number;
          nome: string;
          sessoes_padrao: number;
          updated_at: string;
          valor_sessao: number;
        };
        Insert: {
          ativo?: boolean;
          buffer_min?: number;
          created_at?: string;
          descricao?: string | null;
          duracao_min: number;
          id?: string;
          intervalo_min_dias?: number;
          nome: string;
          sessoes_padrao?: number;
          updated_at?: string;
          valor_sessao: number;
        };
        Update: {
          ativo?: boolean;
          buffer_min?: number;
          created_at?: string;
          descricao?: string | null;
          duracao_min?: number;
          id?: string;
          intervalo_min_dias?: number;
          nome?: string;
          sessoes_padrao?: number;
          updated_at?: string;
          valor_sessao?: number;
        };
        Relationships: [];
      };
      procedimento_custo: {
        Row: {
          descricao: string;
          id: string;
          procedimento_id: string;
          quantidade: number;
          tipo: Database["public"]["Enums"]["tipo_custo"];
          valor_unitario: number;
        };
        Insert: {
          descricao: string;
          id?: string;
          procedimento_id: string;
          quantidade?: number;
          tipo: Database["public"]["Enums"]["tipo_custo"];
          valor_unitario: number;
        };
        Update: {
          descricao?: string;
          id?: string;
          procedimento_id?: string;
          quantidade?: number;
          tipo?: Database["public"]["Enums"]["tipo_custo"];
          valor_unitario?: number;
        };
        Relationships: [
          {
            foreignKeyName: "procedimento_custo_procedimento_id_fkey";
            columns: ["procedimento_id"];
            isOneToOne: false;
            referencedRelation: "procedimento";
            referencedColumns: ["id"];
          },
        ];
      };
      procedimento_requisito: {
        Row: {
          id: string;
          modelo: string | null;
          obrigatorio: boolean;
          procedimento_id: string;
          quantidade: number;
          recurso_id: string | null;
          recurso_tipo: Database["public"]["Enums"]["tipo_recurso"];
        };
        Insert: {
          id?: string;
          modelo?: string | null;
          obrigatorio?: boolean;
          procedimento_id: string;
          quantidade?: number;
          recurso_id?: string | null;
          recurso_tipo: Database["public"]["Enums"]["tipo_recurso"];
        };
        Update: {
          id?: string;
          modelo?: string | null;
          obrigatorio?: boolean;
          procedimento_id?: string;
          quantidade?: number;
          recurso_id?: string | null;
          recurso_tipo?: Database["public"]["Enums"]["tipo_recurso"];
        };
        Relationships: [
          {
            foreignKeyName: "procedimento_requisito_procedimento_id_fkey";
            columns: ["procedimento_id"];
            isOneToOne: false;
            referencedRelation: "procedimento";
            referencedColumns: ["id"];
          },
        ];
      };
      profissional: {
        Row: {
          ativo: boolean;
          cor_agenda: string;
          cpf: string | null;
          created_at: string;
          especialidade: string | null;
          id: string;
          nome: string;
          updated_at: string;
          usuario_id: string | null;
          vigencia_fim: string | null;
          vigencia_inicio: string;
        };
        Insert: {
          ativo?: boolean;
          cor_agenda?: string;
          cpf?: string | null;
          created_at?: string;
          especialidade?: string | null;
          id?: string;
          nome: string;
          updated_at?: string;
          usuario_id?: string | null;
          vigencia_fim?: string | null;
          vigencia_inicio?: string;
        };
        Update: {
          ativo?: boolean;
          cor_agenda?: string;
          cpf?: string | null;
          created_at?: string;
          especialidade?: string | null;
          id?: string;
          nome?: string;
          updated_at?: string;
          usuario_id?: string | null;
          vigencia_fim?: string | null;
          vigencia_inicio?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profissional_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: true;
            referencedRelation: "usuario";
            referencedColumns: ["id"];
          },
        ];
      };
      profissional_habilitacao: {
        Row: {
          procedimento_id: string;
          profissional_id: string;
        };
        Insert: {
          procedimento_id: string;
          profissional_id: string;
        };
        Update: {
          procedimento_id?: string;
          profissional_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profissional_habilitacao_procedimento_id_fkey";
            columns: ["procedimento_id"];
            isOneToOne: false;
            referencedRelation: "procedimento";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profissional_habilitacao_profissional_id_fkey";
            columns: ["profissional_id"];
            isOneToOne: false;
            referencedRelation: "profissional";
            referencedColumns: ["id"];
          },
        ];
      };
      profissional_remuneracao: {
        Row: {
          comissao_tipo: Database["public"]["Enums"]["tipo_comissao"];
          comissao_valor: number;
          custo_hora: number;
          profissional_id: string;
        };
        Insert: {
          comissao_tipo?: Database["public"]["Enums"]["tipo_comissao"];
          comissao_valor?: number;
          custo_hora?: number;
          profissional_id: string;
        };
        Update: {
          comissao_tipo?: Database["public"]["Enums"]["tipo_comissao"];
          comissao_valor?: number;
          custo_hora?: number;
          profissional_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profissional_remuneracao_profissional_id_fkey";
            columns: ["profissional_id"];
            isOneToOne: true;
            referencedRelation: "profissional";
            referencedColumns: ["id"];
          },
        ];
      };
      recurso_bloqueio: {
        Row: {
          fim: string;
          id: string;
          inicio: string;
          motivo: Database["public"]["Enums"]["motivo_bloqueio"];
          observacao: string | null;
          periodo: unknown;
          recurso_id: string;
          recurso_tipo: Database["public"]["Enums"]["tipo_recurso"];
        };
        Insert: {
          fim: string;
          id?: string;
          inicio: string;
          motivo?: Database["public"]["Enums"]["motivo_bloqueio"];
          observacao?: string | null;
          periodo?: never;
          recurso_id: string;
          recurso_tipo: Database["public"]["Enums"]["tipo_recurso"];
        };
        Update: {
          fim?: string;
          id?: string;
          inicio?: string;
          motivo?: Database["public"]["Enums"]["motivo_bloqueio"];
          observacao?: string | null;
          periodo?: never;
          recurso_id?: string;
          recurso_tipo?: Database["public"]["Enums"]["tipo_recurso"];
        };
        Relationships: [];
      };
      recurso_disponibilidade: {
        Row: {
          dia_semana: number;
          hora_fim: string;
          hora_inicio: string;
          id: string;
          recurso_id: string;
          recurso_tipo: Database["public"]["Enums"]["tipo_recurso"];
        };
        Insert: {
          dia_semana: number;
          hora_fim: string;
          hora_inicio: string;
          id?: string;
          recurso_id: string;
          recurso_tipo: Database["public"]["Enums"]["tipo_recurso"];
        };
        Update: {
          dia_semana?: number;
          hora_fim?: string;
          hora_inicio?: string;
          id?: string;
          recurso_id?: string;
          recurso_tipo?: Database["public"]["Enums"]["tipo_recurso"];
        };
        Relationships: [];
      };
      reserva: {
        Row: {
          agendamento_id: string;
          ativo: boolean;
          id: string;
          periodo: unknown;
          recurso_id: string;
          recurso_tipo: Database["public"]["Enums"]["tipo_recurso"];
        };
        Insert: {
          agendamento_id: string;
          ativo?: boolean;
          id?: string;
          periodo: unknown;
          recurso_id: string;
          recurso_tipo: Database["public"]["Enums"]["tipo_recurso"];
        };
        Update: {
          agendamento_id?: string;
          ativo?: boolean;
          id?: string;
          periodo?: unknown;
          recurso_id?: string;
          recurso_tipo?: Database["public"]["Enums"]["tipo_recurso"];
        };
        Relationships: [
          {
            foreignKeyName: "reserva_agendamento_id_fkey";
            columns: ["agendamento_id"];
            isOneToOne: false;
            referencedRelation: "agendamento";
            referencedColumns: ["id"];
          },
        ];
      };
      sala: {
        Row: {
          ativo: boolean;
          created_at: string;
          descricao: string | null;
          id: string;
          nome: string;
          numero: number;
          procedimento_fixo_id: string | null;
          tipo_alocacao: Database["public"]["Enums"]["alocacao_sala"];
          updated_at: string;
          vigencia_fim: string | null;
          vigencia_inicio: string;
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          descricao?: string | null;
          id?: string;
          nome: string;
          numero: number;
          procedimento_fixo_id?: string | null;
          tipo_alocacao?: Database["public"]["Enums"]["alocacao_sala"];
          updated_at?: string;
          vigencia_fim?: string | null;
          vigencia_inicio?: string;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          descricao?: string | null;
          id?: string;
          nome?: string;
          numero?: number;
          procedimento_fixo_id?: string | null;
          tipo_alocacao?: Database["public"]["Enums"]["alocacao_sala"];
          updated_at?: string;
          vigencia_fim?: string | null;
          vigencia_inicio?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sala_procedimento_fixo_id_fkey";
            columns: ["procedimento_fixo_id"];
            isOneToOne: false;
            referencedRelation: "procedimento";
            referencedColumns: ["id"];
          },
        ];
      };
      usuario: {
        Row: {
          ativo: boolean;
          created_at: string;
          email: string;
          id: string;
          nome: string;
          perfil: Database["public"]["Enums"]["perfil_usuario"];
          ultimo_acesso: string | null;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          email: string;
          id: string;
          nome: string;
          perfil?: Database["public"]["Enums"]["perfil_usuario"];
          ultimo_acesso?: string | null;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          email?: string;
          id?: string;
          nome?: string;
          perfil?: Database["public"]["Enums"]["perfil_usuario"];
          ultimo_acesso?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      bloqueio_multirange: {
        Args: {
          p_fim: string;
          p_id: string;
          p_inicio: string;
          p_tipo: Database["public"]["Enums"]["tipo_recurso"];
        };
        Returns: unknown;
      };
      capacidade_recurso: {
        Args: {
          p_fim: string;
          p_id: string;
          p_inicio: string;
          p_tipo: Database["public"]["Enums"]["tipo_recurso"];
        };
        Returns: string;
      };
      criar_agendamento: {
        Args: {
          p_equipamentos?: string[];
          p_inicio: string;
          p_observacoes?: string;
          p_paciente: string;
          p_pacote?: string;
          p_procedimento: string;
          p_profissionais?: string[];
          p_sala: string;
          p_valor_avulso?: number;
        };
        Returns: string;
      };
      custo_direto_procedimento: { Args: { p_procedimento: string }; Returns: number };
      detalhar_conflito: {
        Args: {
          p_equipamentos?: string[];
          p_fim: string;
          p_inicio: string;
          p_profissionais?: string[];
          p_sala: string;
        };
        Returns: {
          conflito_com: string;
          fim: string;
          inicio: string;
          recurso_nome: string;
          recurso_tipo: Database["public"]["Enums"]["tipo_recurso"];
        }[];
      };
      disponibilidade_multirange: {
        Args: {
          p_fim: string;
          p_id: string;
          p_inicio: string;
          p_tipo: Database["public"]["Enums"]["tipo_recurso"];
        };
        Returns: unknown;
      };
      e_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      horarios_livres: {
        Args: {
          p_ate: string;
          p_de: string;
          p_equipamentos?: string[];
          p_passo_min?: number;
          p_procedimento: string;
          p_profissionais?: string[];
          p_sala?: string;
        };
        Returns: {
          fim: string;
          inicio: string;
        }[];
      };
      janela_util_multirange: {
        Args: {
          p_fim: string;
          p_id: string;
          p_inicio: string;
          p_tipo: Database["public"]["Enums"]["tipo_recurso"];
        };
        Returns: unknown;
      };
      ocupacao_recurso: {
        Args: {
          p_fim: string;
          p_id: string;
          p_inicio: string;
          p_tipo: Database["public"]["Enums"]["tipo_recurso"];
        };
        Returns: {
          agendadas: string;
          capacidade: string;
          realizadas: string;
          taxa_agendada: number;
          taxa_efetiva: number;
        }[];
      };
      perfil_atual: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["perfil_usuario"];
      };
      profissional_atual: { Args: Record<PropertyKey, never>; Returns: string };
      rebuild_reservas: { Args: { p_agendamento: string }; Returns: undefined };
      recurso_vigencia: {
        Args: { p_id: string; p_tipo: Database["public"]["Enums"]["tipo_recurso"] };
        Returns: {
          vf: string;
          vi: string;
        }[];
      };
      tz_clinica: { Args: Record<PropertyKey, never>; Returns: string };
    };
    Enums: {
      alocacao_equipamento: "fixo" | "movel";
      alocacao_sala: "dedicada" | "flexivel";
      motivo_bloqueio: "manutencao" | "ferias" | "folga" | "outro";
      perfil_usuario: "admin" | "recepcao" | "profissional";
      status_agendamento:
        | "agendado"
        | "confirmado"
        | "em_atendimento"
        | "realizado"
        | "falta"
        | "cancelado";
      status_comissao: "prevista" | "apurada" | "paga";
      status_lancamento: "pendente" | "pago" | "atrasado" | "cancelado";
      status_pacote: "ativo" | "concluido" | "cancelado" | "expirado";
      tipo_comissao: "percentual" | "valor_fixo" | "nenhuma";
      tipo_custo: "insumo" | "mao_de_obra" | "equipamento" | "outro";
      tipo_lancamento: "receita" | "despesa";
      tipo_recurso: "sala" | "equipamento" | "profissional";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      alocacao_equipamento: ["fixo", "movel"],
      alocacao_sala: ["dedicada", "flexivel"],
      motivo_bloqueio: ["manutencao", "ferias", "folga", "outro"],
      perfil_usuario: ["admin", "recepcao", "profissional"],
      status_agendamento: [
        "agendado",
        "confirmado",
        "em_atendimento",
        "realizado",
        "falta",
        "cancelado",
      ],
      status_comissao: ["prevista", "apurada", "paga"],
      status_lancamento: ["pendente", "pago", "atrasado", "cancelado"],
      status_pacote: ["ativo", "concluido", "cancelado", "expirado"],
      tipo_comissao: ["percentual", "valor_fixo", "nenhuma"],
      tipo_custo: ["insumo", "mao_de_obra", "equipamento", "outro"],
      tipo_lancamento: ["receita", "despesa"],
      tipo_recurso: ["sala", "equipamento", "profissional"],
    },
  },
} as const;
