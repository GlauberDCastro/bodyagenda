-- 0021 · Uma só criar_agendamento
--
-- A 0012 acrescentou p_regiao e p_quantidade com `create or replace`. Como a
-- assinatura mudou, o Postgres NÃO substituiu a função: criou uma segunda.
-- Com as duas existindo, qualquer chamada que omita os parâmetros novos casa
-- com ambas, e o PostgREST recusa com PGRST203 ("Could not choose the best
-- candidate function"). Na prática a agenda não conseguia criar agendamento.
--
-- A versão de 11 parâmetros cobre a antiga: os dois parâmetros novos têm
-- default null e, sem região, o comportamento é o mesmo da 0009.

drop function if exists criar_agendamento(
  uuid, uuid, timestamptz, uuid, uuid[], uuid[], uuid, text, numeric
);
