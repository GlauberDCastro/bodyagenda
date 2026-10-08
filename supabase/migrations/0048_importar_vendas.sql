-- Importação de vendas do sistema anterior ("Relatório de Planos").
--
-- Cada serviço de um plano vira um pacote, na data da venda original e no
-- nome de quem vendeu: conta nas metas e no relatório de vendas como venda
-- feita aqui. As vendas importadas já vieram pagas, então o financeiro nasce
-- com um único lançamento recebido, sem conta a receber.

-- Chave do sistema anterior (plano + serviço): reimportar o mesmo relatório
-- não duplica nada.
alter table pacote add column id_externo text unique;
alter table pacote add column observacoes text;

-- ── Catálogo: o que o sistema anterior vende e ainda não existia aqui ─────
insert into procedimento (nome, descricao, duracao_min, valor_sessao, sessoes_padrao)
select v.nome, v.descricao, v.duracao, 0, 1
  from (values
    ('Retorno de toxina', 'Retorno gratuito incluído na venda da toxina. Não conta como venda de toxina.', 30),
    ('Quantum', 'Cadastrado na importação de vendas. Complete valor, duração e aparelho.', 60),
    ('Scizer', 'Cadastrado na importação de vendas. Complete valor, duração e aparelho.', 60),
    ('Sculptra', 'Cadastrado na importação de vendas. Complete valor e duração.', 60)
  ) as v(nome, descricao, duracao)
 where not exists (select 1 from procedimento p where p.nome = v.nome);

-- ── Gravação de uma venda importada ─────────────────────────────────────────
-- Admin e gestão importam. Devolve o id do pacote, ou null se aquela chave
-- já foi importada antes.
create or replace function importar_venda(
  p_id_externo   text,
  p_paciente     uuid,
  p_procedimento uuid,
  p_regiao       uuid,
  p_sessoes      integer,
  p_valor        numeric,
  p_data_venda   date,
  p_validade     date,
  p_vendedor     uuid,
  p_forma        text,
  p_observacoes  text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_pacote uuid;
  v_nome   text;
begin
  if not e_gestao() then
    raise exception 'Só administração e gestão importam vendas' using errcode = '42501';
  end if;

  insert into pacote (paciente_id, procedimento_id, quantidade_sessoes, valor_total, desconto,
                      data_venda, validade, regiao_id, vendido_por, id_externo, observacoes)
  values (p_paciente, p_procedimento, p_sessoes, p_valor, 0,
          p_data_venda, p_validade, p_regiao, p_vendedor, p_id_externo, p_observacoes)
  on conflict (id_externo) do nothing
  returning id into v_pacote;

  if v_pacote is null then
    return null;
  end if;

  if p_valor > 0 then
    select nome into v_nome from procedimento where id = p_procedimento;
    insert into lancamento (tipo, origem_tipo, origem_id, categoria, descricao, valor,
                            vencimento, data_pagamento, forma_pagamento, status)
    values ('receita', 'pacote', v_pacote, 'pacote',
            format('Pacote %s — importado (pago)', v_nome), p_valor,
            p_data_venda, p_data_venda, nullif(trim(p_forma), ''), 'pago');
  end if;

  return v_pacote;
end $$;

revoke execute on function importar_venda(text, uuid, uuid, uuid, integer, numeric, date, date, uuid, text, text) from public, anon;
grant execute on function importar_venda(text, uuid, uuid, uuid, integer, numeric, date, date, uuid, text, text) to authenticated;
