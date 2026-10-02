-- 0033 · Série de ocupação de um recurso só
--
-- A agenda passou a mostrar semana e mês de uma sala, um equipamento ou um
-- profissional específico. A barra de ocupação de cada dia precisa, então, da
-- capacidade só daquele recurso. `p_recurso` nulo mantém o total do tipo.
--
-- Parâmetro novo muda a assinatura: a função é recriada, nunca sobrecarregada.

drop function if exists serie_ocupacao(tipo_recurso, date, date);

create function serie_ocupacao(
  p_tipo tipo_recurso, p_inicio date, p_fim date, p_recurso uuid default null
) returns table (dia date, capacidade_h numeric, realizadas_h numeric)
language sql stable security invoker as $$
  with dias as (
    select d::date as dia,
           timezone(tz_clinica(), d::timestamp) as ini,
           timezone(tz_clinica(), (d + interval '1 day')::timestamp) as fim
      from generate_series(p_inicio, p_fim, interval '1 day') d
  ),
  recursos as (
    select id from (
      select id from sala where p_tipo = 'sala' and ativo
      union all select id from equipamento where p_tipo = 'equipamento' and ativo
      union all select id from profissional where p_tipo = 'profissional' and ativo
    ) t
    where p_recurso is null or id = p_recurso
  )
  select d.dia,
         round(coalesce((
           select sum(extract(epoch from capacidade_recurso(p_tipo, r.id, d.ini, d.fim)))
             from recursos r), 0) / 3600.0, 2),
         round(coalesce((
           select sum(extract(epoch from (upper(x) - lower(x))))
             from reserva rs
             join agendamento a on a.id = rs.agendamento_id and a.status = 'realizado'
             cross join lateral (select rs.periodo * tstzrange(d.ini, d.fim, '[)') as x) y
            where rs.recurso_tipo = p_tipo and rs.ativo
              and (p_recurso is null or rs.recurso_id = p_recurso)
              and rs.periodo && tstzrange(d.ini, d.fim, '[)')), 0) / 3600.0, 2)
    from dias d
   order by d.dia
$$;

revoke execute on function serie_ocupacao(tipo_recurso, date, date, uuid) from public, anon;
grant execute on function serie_ocupacao(tipo_recurso, date, date, uuid) to authenticated;
