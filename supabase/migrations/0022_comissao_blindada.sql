-- 0022 · gerar_comissoes à prova de chamada direta
--
-- gerar_comissoes é SECURITY DEFINER (precisa gravar em `comissao` mesmo
-- quando quem realizou a sessão é a recepção, que não escreve lá). Mas toda
-- função em `public` vira endpoint do PostgREST, e o Supabase concede EXECUTE
-- a anon e authenticated por padrão. A auditoria de RLS (M8.1) provou que:
--
--   1. Um visitante SEM LOGIN conseguia chamá-la.
--   2. Chamada direta gerava comissão de sessão ainda não realizada,
--      violando a RN-06 — só o trigger checava o status.
--   3. Chamada direta recalculava comissão JÁ PAGA, reescrevendo o valor
--      que saiu do caixa.
--
-- Não dá para tirar o EXECUTE de authenticated: o trigger que a chama roda
-- com os privilégios de quem atualizou o agendamento. Então a própria função
-- passa a garantir as regras, venha a chamada de onde vier.

create or replace function gerar_comissoes(p_agendamento uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_receita numeric;
  v_n       int;
  v_comp    text;
begin
  -- RN-06: só sessão realizada gera comissão.
  if not exists (
    select 1 from agendamento where id = p_agendamento and status = 'realizado'
  ) then
    return;
  end if;

  select count(*) into v_n
    from agendamento_profissional where agendamento_id = p_agendamento;
  if v_n = 0 then return; end if;

  v_receita := receita_sessao(p_agendamento);
  select to_char(inicio at time zone tz_clinica(), 'YYYY-MM') into v_comp
    from agendamento where id = p_agendamento;

  insert into comissao (agendamento_id, profissional_id, base_calculo,
                        percentual, valor, status, competencia)
  select
    p_agendamento,
    ap.profissional_id,
    round(v_receita / v_n, 2),
    case when pr.comissao_tipo = 'percentual' then pr.comissao_valor end,
    case pr.comissao_tipo
      when 'percentual' then round(v_receita / v_n * pr.comissao_valor / 100, 2)
      when 'valor_fixo' then pr.comissao_valor
      else 0
    end,
    'prevista',
    v_comp
  from agendamento_profissional ap
  join profissional_remuneracao pr on pr.profissional_id = ap.profissional_id
  where ap.agendamento_id = p_agendamento
    and pr.comissao_tipo <> 'nenhuma'
  on conflict (agendamento_id, profissional_id) do update
    set base_calculo = excluded.base_calculo,
        valor        = excluded.valor,
        competencia  = excluded.competencia
    -- Comissão paga já saiu do caixa; estorno é decisão humana (RN-05).
    where comissao.status <> 'paga';
end $$;

-- Visitante sem sessão não tem por que chamar nenhuma das duas. rebuild_reservas
-- é idempotente (reconstrói a partir do agendamento), mas também é interna.
revoke execute on function gerar_comissoes(uuid)  from public, anon;
revoke execute on function rebuild_reservas(uuid) from public, anon;
grant  execute on function gerar_comissoes(uuid)  to authenticated;
grant  execute on function rebuild_reservas(uuid) to authenticated;
