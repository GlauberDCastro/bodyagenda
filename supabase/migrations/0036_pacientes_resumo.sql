-- 0036 · Lista de pacientes com o que a recepção decide na hora
--
-- A lista mostrava só nome, CPF e telefone. Para saber quem está sem retorno,
-- quem deve ou quem tem pacote, era preciso abrir ficha por ficha. Aqui cada
-- linha já vem com última visita, próximo atendimento, pacotes ativos,
-- faltas e valor em atraso — numa consulta só, em vez de uma por paciente.
--
-- A busca compara telefone e CPF só pelos dígitos: o telefone é gravado
-- formatado, "(11) 98765-4321", e buscar "98765" precisa achar.
--
-- SECURITY INVOKER: quem não lê o caixa recebe em_atraso = 0 pelo próprio RLS.

create function pacientes_resumo(p_termo text default '')
returns table (
  id uuid, nome text, cpf text, telefone text, data_nascimento date,
  ativo boolean, consentimento_lgpd boolean,
  ultima_visita timestamptz, proximo_inicio timestamptz, proximo_procedimento text,
  pacotes_ativos integer, faltas integer, em_atraso numeric
) language sql stable security invoker as $$
  with termo as (
    select trim(coalesce(p_termo, '')) as t,
           regexp_replace(coalesce(p_termo, ''), '\D', '', 'g') as dig
  ),
  base as (
    select p.*
      from paciente p, termo
     where termo.t = ''
        or p.nome ilike '%' || termo.t || '%'
        or (length(termo.dig) >= 3 and (
              p.cpf like '%' || termo.dig || '%'
           or regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g') like '%' || termo.dig || '%'))
  )
  select b.id, b.nome, b.cpf, b.telefone, b.data_nascimento, b.ativo,
         coalesce(b.consentimento_lgpd, false),
         (select max(a.inicio) from agendamento a
           where a.paciente_id = b.id and a.status = 'realizado'),
         prox.inicio, prox.nome,
         (select count(*) from pacote pc
           where pc.paciente_id = b.id and pc.status = 'ativo')::int,
         (select count(*) from agendamento a
           where a.paciente_id = b.id and a.status = 'falta')::int,
         coalesce((
           select sum(l.valor)
             from lancamento l
             left join pacote pc     on l.origem_tipo = 'pacote'      and pc.id = l.origem_id
             left join agendamento ag on l.origem_tipo = 'agendamento' and ag.id = l.origem_id
            where l.tipo = 'receita' and l.status = 'atrasado'
              and coalesce(pc.paciente_id, ag.paciente_id) = b.id), 0)
    from base b
    left join lateral (
      select a.inicio, pr.nome
        from agendamento a join procedimento pr on pr.id = a.procedimento_id
       where a.paciente_id = b.id and a.inicio >= now()
         and a.status in ('agendado', 'confirmado', 'em_atendimento')
       order by a.inicio limit 1
    ) prox on true
   order by b.nome
$$;

revoke execute on function pacientes_resumo(text) from public, anon;
grant execute on function pacientes_resumo(text) to authenticated;
