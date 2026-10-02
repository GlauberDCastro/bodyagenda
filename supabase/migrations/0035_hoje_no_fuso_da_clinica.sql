-- 0035 · "Hoje" é o dia da clínica, não o do servidor
--
-- O banco roda em UTC. `current_date` vira o dia seguinte às 21h em São Paulo:
-- um pacote vendido às 22h saía com data de venda de amanhã, e uma sala
-- cadastrada à noite só passava a valer no dia seguinte. O caixa (0028) já
-- usava o dia da clínica; aqui o resto passa a usar também.

alter table pacote       alter column data_venda      set default (now() at time zone tz_clinica())::date;
alter table sala         alter column vigencia_inicio set default (now() at time zone tz_clinica())::date;
alter table equipamento  alter column vigencia_inicio set default (now() at time zone tz_clinica())::date;
alter table profissional alter column vigencia_inicio set default (now() at time zone tz_clinica())::date;

-- criar_agendamento recusa pacote vencido comparando com `current_date`. A
-- função é recriada com o mesmo corpo e só essa comparação trocada; a
-- checagem abaixo garante que a troca aconteceu exatamente uma vez.
do $$
declare
  v_def  text := pg_get_functiondef(
    'criar_agendamento(uuid, uuid, timestamptz, uuid, uuid[], uuid[], uuid, text, numeric, uuid, numeric, integer)'::regprocedure);
  v_novo text := replace(v_def, 'validade < current_date',
                         'validade < (now() at time zone tz_clinica())::date');
begin
  if (length(v_def) - length(replace(v_def, 'current_date', ''))) / length('current_date') <> 1
     or v_novo = v_def then
    raise exception 'criar_agendamento mudou: revise esta migração';
  end if;
  execute v_novo;
end $$;
