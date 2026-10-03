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
      agendamento_recusa: {
        Row: {
          codigo: string;
          criado_em: string;
          equipamentos: string[];
          id: number;
          inicio: string;
          procedimento_id: string | null;
          profissionais: string[];
          sala_id: string | null;
          usuario_id: string | null;
        };
        Insert: {
          codigo: string;
          criado_em?: string;
          equipamentos?: string[];
          id?: number;
          inicio: string;
          procedimento_id?: string | null;
          profissionais?: string[];
          sala_id?: string | null;
          usuario_id?: string | null;
        };
        Update: {
          codigo?: string;
          criado_em?: string;
          equipamentos?: string[];
          id?: number;
          inicio?: string;
          procedimento_id?: string | null;
          profissionais?: string[];
          sala_id?: string | null;
          usuario_id?: string | null;
        };
        Relationships: [];
      };
      agendamento_regiao: {
        Row: {
          agendamento_id: string;
          quantidade: number;
          regiao_id: string;
          unidade: Database["public"]["Enums"]["unidade_medida"];
        };
        Insert: {
          agendamento_id: string;
          quantidade?: number;
          regiao_id: string;
          unidade?: Database["public"]["Enums"]["unidade_medida"];
        };
        Update: {
          agendamento_id?: string;
          quantidade?: number;
          regiao_id?: string;
          unidade?: Database["public"]["Enums"]["unidade_medida"];
        };
        Relationships: [
          {
            foreignKeyName: "agendamento_regiao_agendamento_id_fkey";
            columns: ["agendamento_id"];
            isOneToOne: false;
            referencedRelation: "agendamento";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agendamento_regiao_regiao_id_fkey";
            columns: ["regiao_id"];
            isOneToOne: false;
            referencedRelation: "regiao";
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
      comissao: {
        Row: {
          agendamento_id: string;
          base_calculo: number;
          competencia: string;
          created_at: string;
          id: string;
          percentual: number | null;
          profissional_id: string;
          status: Database["public"]["Enums"]["status_comissao"];
          valor: number;
        };
        Insert: {
          agendamento_id: string;
          base_calculo: number;
          competencia: string;
          created_at?: string;
          id?: string;
          percentual?: number | null;
          profissional_id: string;
          status?: Database["public"]["Enums"]["status_comissao"];
          valor: number;
        };
        Update: {
          agendamento_id?: string;
          base_calculo?: number;
          competencia?: string;
          created_at?: string;
          id?: string;
          percentual?: number | null;
          profissional_id?: string;
          status?: Database["public"]["Enums"]["status_comissao"];
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "comissao_agendamento_id_fkey";
            columns: ["agendamento_id"];
            isOneToOne: false;
            referencedRelation: "agendamento";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comissao_profissional_id_fkey";
            columns: ["profissional_id"];
            isOneToOne: false;
            referencedRelation: "profissional";
            referencedColumns: ["id"];
          },
        ];
      };
      despesa_fixa: {
        Row: {
          categoria: string | null;
          competencia: string;
          created_at: string;
          descricao: string;
          id: string;
          recorrente: boolean;
          valor: number;
        };
        Insert: {
          categoria?: string | null;
          competencia: string;
          created_at?: string;
          descricao: string;
          id?: string;
          recorrente?: boolean;
          valor: number;
        };
        Update: {
          categoria?: string | null;
          competencia?: string;
          created_at?: string;
          descricao?: string;
          id?: string;
          recorrente?: boolean;
          valor?: number;
        };
        Relationships: [];
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
      lancamento: {
        Row: {
          categoria: string | null;
          created_at: string;
          data_pagamento: string | null;
          descricao: string | null;
          forma_pagamento: string | null;
          id: string;
          origem_id: string | null;
          origem_tipo: string;
          parcela_num: number | null;
          parcela_total: number | null;
          status: Database["public"]["Enums"]["status_lancamento"];
          tipo: Database["public"]["Enums"]["tipo_lancamento"];
          valor: number;
          vencimento: string;
        };
        Insert: {
          categoria?: string | null;
          created_at?: string;
          data_pagamento?: string | null;
          descricao?: string | null;
          forma_pagamento?: string | null;
          id?: string;
          origem_id?: string | null;
          origem_tipo: string;
          parcela_num?: number | null;
          parcela_total?: number | null;
          status?: Database["public"]["Enums"]["status_lancamento"];
          tipo: Database["public"]["Enums"]["tipo_lancamento"];
          valor: number;
          vencimento: string;
        };
        Update: {
          categoria?: string | null;
          created_at?: string;
          data_pagamento?: string | null;
          descricao?: string | null;
          forma_pagamento?: string | null;
          id?: string;
          origem_id?: string | null;
          origem_tipo?: string;
          parcela_num?: number | null;
          parcela_total?: number | null;
          status?: Database["public"]["Enums"]["status_lancamento"];
          tipo?: Database["public"]["Enums"]["tipo_lancamento"];
          valor?: number;
          vencimento?: string;
        };
        Relationships: [];
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
          regiao_id: string | null;
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
          regiao_id?: string | null;
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
          regiao_id?: string | null;
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
            foreignKeyName: "pacote_regiao_id_fkey";
            columns: ["regiao_id"];
            isOneToOne: false;
            referencedRelation: "regiao";
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
          valor_tabela: number | null;
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
          valor_tabela?: number | null;
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
          valor_tabela?: number | null;
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
      procedimento_regiao: {
        Row: {
          ativo: boolean;
          duracao_min: number | null;
          id: string;
          intervalo_min_dias: number | null;
          observacoes: string | null;
          procedimento_id: string;
          quantidade_padrao: number;
          regiao_id: string;
          sessoes_padrao: number | null;
          unidade: Database["public"]["Enums"]["unidade_medida"];
          valor_sessao: number | null;
          valor_tabela: number | null;
        };
        Insert: {
          ativo?: boolean;
          duracao_min?: number | null;
          id?: string;
          intervalo_min_dias?: number | null;
          observacoes?: string | null;
          procedimento_id: string;
          quantidade_padrao?: number;
          regiao_id: string;
          sessoes_padrao?: number | null;
          unidade?: Database["public"]["Enums"]["unidade_medida"];
          valor_sessao?: number | null;
          valor_tabela?: number | null;
        };
        Update: {
          ativo?: boolean;
          duracao_min?: number | null;
          id?: string;
          intervalo_min_dias?: number | null;
          observacoes?: string | null;
          procedimento_id?: string;
          quantidade_padrao?: number;
          regiao_id?: string;
          sessoes_padrao?: number | null;
          unidade?: Database["public"]["Enums"]["unidade_medida"];
          valor_sessao?: number | null;
          valor_tabela?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "procedimento_regiao_procedimento_id_fkey";
            columns: ["procedimento_id"];
            isOneToOne: false;
            referencedRelation: "procedimento";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "procedimento_regiao_regiao_id_fkey";
            columns: ["regiao_id"];
            isOneToOne: false;
            referencedRelation: "regiao";
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
      clinica: {
        Row: { id: string; unica: boolean; nome: string; updated_at: string };
        Insert: { id?: string; unica?: boolean; nome: string; updated_at?: string };
        Update: { id?: string; unica?: boolean; nome?: string; updated_at?: string };
        Relationships: [];
      };
      convite_profissional: {
        Row: {
          id: string;
          profissional_id: string;
          token_hash: string;
          criado_por: string | null;
          criado_em: string;
          expira_em: string;
          usado_em: string | null;
          revogado_em: string | null;
          usuario_id: string | null;
        };
        Insert: {
          id?: string;
          profissional_id: string;
          token_hash: string;
          criado_por?: string | null;
          criado_em?: string;
          expira_em?: string;
          usado_em?: string | null;
          revogado_em?: string | null;
          usuario_id?: string | null;
        };
        Update: {
          id?: string;
          profissional_id?: string;
          token_hash?: string;
          criado_por?: string | null;
          criado_em?: string;
          expira_em?: string;
          usado_em?: string | null;
          revogado_em?: string | null;
          usuario_id?: string | null;
        };
        Relationships: [];
      };
      profissional: {
        Row: {
          ativo: boolean;
          cor_agenda: string;
          cpf: string | null;
          telefone: string | null;
          data_nascimento: string | null;
          registro_conselho: string | null;
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
          telefone?: string | null;
          data_nascimento?: string | null;
          registro_conselho?: string | null;
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
          telefone?: string | null;
          data_nascimento?: string | null;
          registro_conselho?: string | null;
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
      regiao: {
        Row: {
          ativo: boolean;
          grupo: string | null;
          id: string;
          nome: string;
          ordem: number;
        };
        Insert: {
          ativo?: boolean;
          grupo?: string | null;
          id?: string;
          nome: string;
          ordem?: number;
        };
        Update: {
          ativo?: boolean;
          grupo?: string | null;
          id?: string;
          nome?: string;
          ordem?: number;
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
          p_duracao?: number;
          p_equipamentos?: string[];
          p_inicio: string;
          p_observacoes?: string;
          p_paciente: string;
          p_pacote?: string;
          p_procedimento: string;
          p_profissionais?: string[];
          p_quantidade?: number;
          p_regiao?: string;
          p_sala: string;
          p_valor_avulso?: number;
        };
        Returns: string;
      };
      custo_direto_procedimento: { Args: { p_procedimento: string }; Returns: number };
      custo_direto_sessao: { Args: { p_agendamento: string }; Returns: number };
      cancelar_pacote: { Args: { p_pacote: string }; Returns: Json };
      cobrancas: {
        Args: { p_paciente?: string };
        Returns: {
          id: string;
          tipo: Database["public"]["Enums"]["tipo_lancamento"];
          origem_tipo: string;
          origem_id: string | null;
          categoria: string | null;
          descricao: string | null;
          valor: number;
          vencimento: string;
          data_pagamento: string | null;
          forma_pagamento: string | null;
          status: Database["public"]["Enums"]["status_lancamento"];
          parcela_num: number | null;
          parcela_total: number | null;
          paciente_id: string | null;
          paciente_nome: string | null;
        }[];
      };
      custo_hora_estrutura: { Args: { p_competencia: string }; Returns: number };
      definir_horarios: { Args: { p_janelas: Json; p_recursos: Json }; Returns: number };
      marcar_atrasados: { Args: Record<PropertyKey, never>; Returns: number };
      receita_periodo: {
        Args: { p_de: string; p_ate: string };
        Returns: { forma: string; prevista: number; realizada: number }[];
      };
      registrar_recebimento: {
        Args: { p_data: string; p_forma: string; p_lancamento: string; p_valor: number };
        Returns: string;
      };
      vender_pacote: {
        Args: {
          p_desconto: number;
          p_forma: string;
          p_paciente: string;
          p_parcelas: number;
          p_primeira_paga: boolean;
          p_primeiro_vencimento: string;
          p_procedimento: string;
          p_regiao: string | null;
          p_sessoes: number;
          p_validade: string | null;
          p_valor_total: number;
        };
        Returns: string;
      };
      pacientes_resumo: {
        Args: { p_termo?: string };
        Returns: {
          id: string;
          nome: string;
          cpf: string | null;
          telefone: string | null;
          data_nascimento: string | null;
          ativo: boolean;
          consentimento_lgpd: boolean;
          ultima_visita: string | null;
          proximo_inicio: string | null;
          proximo_procedimento: string | null;
          pacotes_ativos: number;
          faltas: number;
          em_atraso: number;
        }[];
      };
      editar_agendamento: {
        Args: {
          p_agendamento: string;
          p_duracao?: number;
          p_equipamentos?: string[];
          p_inicio: string;
          p_observacoes?: string;
          p_procedimento: string;
          p_profissionais?: string[];
          p_sala: string;
          p_valor_avulso?: number;
        };
        Returns: undefined;
      };
      detalhar_conflito: {
        Args: {
          p_equipamentos?: string[];
          p_fim: string;
          p_ignorar?: string;
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
      dre_competencia: {
        Args: { p_competencia: string };
        Returns: {
          comissoes: number;
          custo_hora_estr: number;
          custos_diretos: number;
          despesas_fixas: number;
          margem_contrib: number;
          receita_realizada: number;
          resultado: number;
        }[];
      };
      e_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      e_gestao: { Args: Record<PropertyKey, never>; Returns: boolean };
      excluir_recurso: {
        Args: { p_id: string; p_tipo: Database["public"]["Enums"]["tipo_recurso"] };
        Returns: undefined;
      };
      gargalos_equipamento: {
        Args: { p_fim: string; p_inicio: string; p_limiar?: number };
        Returns: {
          horas_livres: number;
          modelo: string;
          procedimentos: number;
          taxa_media: number;
          unidades: number;
          recusas: number;
        }[];
      };
      gerar_comissoes: { Args: { p_agendamento: string }; Returns: undefined };
      horarios_livres: {
        Args: {
          p_ate: string;
          p_de: string;
          p_equipamentos?: string[];
          p_duracao?: number;
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
      janelas_vagas: {
        Args: {
          p_fim: string;
          p_id: string;
          p_inicio: string;
          p_min_minutos?: number;
          p_tipo: Database["public"]["Enums"]["tipo_recurso"];
        };
        Returns: {
          fim: string;
          inicio: string;
          minutos: number;
        }[];
      };
      mapa_calor_ocupacao: {
        Args: {
          p_fim: string;
          p_inicio: string;
          p_tipo: Database["public"]["Enums"]["tipo_recurso"];
        };
        Returns: {
          atendimentos: number;
          dia_semana: number;
          hora: number;
          horas: number;
        }[];
      };
      margem_sessao: {
        Args: { p_agendamento: string };
        Returns: {
          comissao: number;
          custo_direto: number;
          margem_contrib: number;
          margem_pct: number;
          margem_por_hora: number;
          receita: number;
        }[];
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
      pacotes_pendentes: {
        Args: Record<PropertyKey, never>;
        Returns: {
          pacote_id: string;
          paciente_id: string;
          paciente: string;
          procedimento: string;
          sessoes: number;
          realizadas: number;
          agendadas: number;
          pendentes: number;
          valor_devido: number;
          validade: string | null;
        }[];
      };
      painel_ocupacao: {
        Args: {
          p_fim: string;
          p_inicio: string;
          p_tipo: Database["public"]["Enums"]["tipo_recurso"];
        };
        Returns: {
          agendadas_h: number;
          agrupador: string;
          atendimentos: number;
          capacidade_h: number;
          faltas: number;
          nome: string;
          ociosidade_h: number;
          realizadas_h: number;
          receita: number;
          receita_por_hora: number;
          recurso_id: string;
          taxa_agendada: number;
          taxa_efetiva: number;
        }[];
      };
      passivo_entrega: {
        Args: Record<PropertyKey, never>;
        Returns: {
          horas_devidas: number;
          nome: string;
          pacotes: number;
          procedimento_id: string;
          sessoes_devidas: number;
          valor_devido: number;
        }[];
      };
      perfil_atual: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["perfil_usuario"];
      };
      profissional_atual: { Args: Record<PropertyKey, never>; Returns: string };
      protocolo_efetivo: {
        Args: { p_procedimento: string; p_regiao?: string };
        Returns: {
          buffer_min: number;
          duracao_min: number;
          intervalo_min_dias: number;
          quantidade_padrao: number;
          sessoes_padrao: number;
          unidade: Database["public"]["Enums"]["unidade_medida"];
          valor_sessao: number;
        }[];
      };
      rebuild_reservas: { Args: { p_agendamento: string }; Returns: undefined };
      receita_sessao: { Args: { p_agendamento: string }; Returns: number };
      recurso_vigencia: {
        Args: { p_id: string; p_tipo: Database["public"]["Enums"]["tipo_recurso"] };
        Returns: {
          vf: string;
          vi: string;
        }[];
      };
      referencias_recurso: {
        Args: { p_id: string; p_tipo: Database["public"]["Enums"]["tipo_recurso"] };
        Returns: {
          origem: string;
          quantidade: number;
        }[];
      };
      remarcar_trocando_recurso: {
        Args: {
          p_agendamento: string;
          p_de: string;
          p_inicio: string;
          p_para: string;
          p_tipo: Database["public"]["Enums"]["tipo_recurso"];
        };
        Returns: undefined;
      };
      retorno_equipamentos: {
        Args: { p_fim: string; p_inicio: string };
        Returns: {
          equipamento_id: string;
          nome: string;
          modelo: string;
          sessoes: number;
          horas: number;
          receita: number;
          custo_uso: number;
          margem: number;
          custo_aquisicao: number | null;
          pct_aquisicao: number | null;
        }[];
      };
      rentabilidade_procedimentos: {
        Args: { p_fim: string; p_inicio: string };
        Returns: {
          comissao: number;
          custo_direto: number;
          horas: number;
          margem: number;
          margem_pct: number;
          margem_por_hora: number;
          nome: string;
          procedimento_id: string;
          receita: number;
          sessoes: number;
        }[];
      };
      reservas_suspensas: { Args: Record<PropertyKey, never>; Returns: boolean };
      serie_ocupacao: {
        Args: {
          p_fim: string;
          p_inicio: string;
          p_recurso?: string;
          p_tipo: Database["public"]["Enums"]["tipo_recurso"];
        };
        Returns: { dia: string; capacidade_h: number; realizadas_h: number }[];
      };
      tz_clinica: { Args: Record<PropertyKey, never>; Returns: string };
      ve_financeiro: { Args: Record<PropertyKey, never>; Returns: boolean };
    };
    Enums: {
      alocacao_equipamento: "fixo" | "movel";
      alocacao_sala: "dedicada" | "flexivel";
      motivo_bloqueio: "manutencao" | "ferias" | "folga" | "outro";
      perfil_usuario: "admin" | "recepcao" | "profissional" | "gestao" | "financeiro";
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
      unidade_medida: "sessao" | "ui" | "ml" | "seringa" | "flash" | "aplicacao";
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
      perfil_usuario: ["admin", "recepcao", "profissional", "gestao", "financeiro"],
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
      unidade_medida: ["sessao", "ui", "ml", "seringa", "flash", "aplicacao"],
    },
  },
} as const;
