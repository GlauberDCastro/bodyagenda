-- 0045 · A profissional também vende pacote
--
-- Durante o atendimento a doutora indica e fecha o tratamento. Até aqui só
-- admin, recepção e comercial vendiam: o RLS de pacote e lançamento barrava a
-- profissional, que não grava nenhum dos dois.
--
-- vender_pacote passa a DEFINER com a checagem explícita: os mesmos perfis de
-- antes, mais a profissional para paciente que ela atende (tem atendimento
-- com ela). Ela continua sem gravar pacote ou lançamento por fora da função.
-- A venda registra quem vendeu (vendido_por), base do relatório de vendas.

create or replace function vender_pacote(
  p_paciente           uuid,
  p_procedimento       uuid,
  p_sessoes            integer,
  p_valor_total        numeric,
  p_desconto           numeric,
  p_validade           date,
  p_regiao             uuid,
  p_parcelas           integer,
  p_primeiro_vencimento date,
  p_forma              text,
  p_primeira_paga      boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_pacote  uuid;
  v_liquido numeric := p_valor_total - coalesce(p_desconto, 0);
  v_parcela numeric;
  v_nome    text;
  i         integer;
begin
  -- Quem vende: admin, recepção, SDR, closer (como antes, pelo RLS) e agora a
  -- profissional, para paciente que ela atende — a venda feita no consultório.
  if not (
    perfil_atual() = 'admin' or e_atendimento()
    or (perfil_atual() = 'profissional' and exists (
          select 1 from agendamento a
            join agendamento_profissional ap on ap.agendamento_id = a.id
            join profissional p on p.id = ap.profissional_id
           where a.paciente_id = p_paciente and a.status <> 'cancelado'
             and p.usuario_id = auth.uid()))
  ) then
    raise exception 'Sem permissão para vender pacote a este paciente' using errcode = '42501';
  end if;

  if p_parcelas < 1 or p_parcelas > 24 then
    raise exception 'Parcelas devem ficar entre 1 e 24' using errcode = '23514';
  end if;

  insert into pacote (paciente_id, procedimento_id, quantidade_sessoes, valor_total,
                      desconto, validade, regiao_id, vendido_por)
  values (p_paciente, p_procedimento, p_sessoes, p_valor_total,
          coalesce(p_desconto, 0), p_validade, p_regiao, auth.uid())
  returning id into v_pacote;

  select nome into v_nome from procedimento where id = p_procedimento;

  -- Centavos que não dividem por igual vão na última parcela.
  v_parcela := trunc(v_liquido / p_parcelas, 2);
  for i in 1 .. p_parcelas loop
    insert into lancamento (tipo, origem_tipo, origem_id, categoria, descricao, valor,
                            vencimento, parcela_num, parcela_total, forma_pagamento,
                            status, data_pagamento)
    values ('receita', 'pacote', v_pacote, 'pacote',
            format('Pacote %s — %s/%s', v_nome, i, p_parcelas),
            case when i = p_parcelas then v_liquido - v_parcela * (p_parcelas - 1)
                 else v_parcela end,
            (p_primeiro_vencimento + make_interval(months => i - 1))::date,
            i, p_parcelas, p_forma,
            case when i = 1 and p_primeira_paga then 'pago'::status_lancamento
                 else 'pendente'::status_lancamento end,
            case when i = 1 and p_primeira_paga then (now() at time zone tz_clinica())::date end);
  end loop;

  return v_pacote;
end $$;
