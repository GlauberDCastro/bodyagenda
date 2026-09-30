-- 0013 · Exclusão segura de recurso
--
-- O princípio P5 diz que nada é apagado fisicamente, e existe por um motivo
-- concreto: relatório de ocupação e financeiro de meses passados dependem de
-- a sala e o aparelho continuarem existindo. Apagar uma sala com histórico não
-- "limpa o cadastro" — quebra o passado.
--
-- Mas recurso cadastrado por engano, que nunca foi usado, não tem histórico a
-- proteger, e forçar a inativação enche a tela de lixo permanente.
--
-- Então o banco decide: sem nenhuma referência, apaga de verdade; com
-- qualquer uma, recusa, e a aplicação oferece inativar em vez disso.

/**
 * Referências que impedem a exclusão, com a contagem de cada uma — a
 * aplicação usa isto para explicar POR QUE não deu.
 */
create or replace function referencias_recurso(p_tipo tipo_recurso, p_id uuid)
returns table (origem text, quantidade bigint)
language sql stable as $$
  -- Histórico de agenda (qualquer status, inclusive cancelado)
  select 'agendamento(s)'::text, count(*)::bigint
    from reserva where recurso_tipo = p_tipo and recurso_id = p_id
   having count(*) > 0

  union all
  select 'bloqueio(s)', count(*)::bigint
    from recurso_bloqueio where recurso_tipo = p_tipo and recurso_id = p_id
   having count(*) > 0

  -- Sala com procedimento dedicado: apagá-la deixaria o procedimento sem casa
  union all
  select 'procedimento dedicado', count(*)::bigint
    from sala
   where p_tipo = 'sala' and id = p_id and procedimento_fixo_id is not null
   having count(*) > 0

  -- Sala que abriga equipamento fixo
  union all
  select 'equipamento(s) fixo(s) nela', count(*)::bigint
    from equipamento where p_tipo = 'sala' and sala_id = p_id
   having count(*) > 0

  -- Comissão apurada é registro financeiro
  union all
  select 'comissao(oes)', count(*)::bigint
    from comissao where p_tipo = 'profissional' and profissional_id = p_id
   having count(*) > 0

  -- Profissional com login vinculado
  union all
  select 'usuario vinculado', count(*)::bigint
    from profissional
   where p_tipo = 'profissional' and id = p_id and usuario_id is not null
   having count(*) > 0;
$$;

/**
 * Apaga se estiver livre; recusa com detalhe se estiver em uso.
 *
 * SECURITY INVOKER: a exclusão respeita o RLS do usuário, então recepção e
 * profissional não apagam recurso nenhum.
 */
create or replace function excluir_recurso(p_tipo tipo_recurso, p_id uuid)
returns void language plpgsql security invoker as $$
declare
  v_total   bigint;
  v_detalhe text;
begin
  select coalesce(sum(quantidade), 0),
         string_agg(quantidade || ' ' || origem, ', ')
    into v_total, v_detalhe
    from referencias_recurso(p_tipo, p_id);

  if coalesce(v_total, 0) > 0 then
    raise exception
      'Recurso em uso (%). Inative-o para preservar o historico.', v_detalhe
      using errcode = '23503';
  end if;

  -- Disponibilidade e habilitação são configuração do próprio recurso, não
  -- histórico: caem junto sem perda de informação.
  delete from recurso_disponibilidade where recurso_tipo = p_tipo and recurso_id = p_id;

  if p_tipo = 'sala' then
    delete from sala where id = p_id;
  elsif p_tipo = 'equipamento' then
    delete from equipamento_custo where equipamento_id = p_id;
    delete from equipamento where id = p_id;
  elsif p_tipo = 'profissional' then
    delete from profissional_habilitacao where profissional_id = p_id;
    delete from profissional_remuneracao where profissional_id = p_id;
    delete from profissional where id = p_id;
  end if;
end $$;
