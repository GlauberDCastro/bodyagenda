-- 0046 · Vendas e funil da avaliação, para a Central de Gestão
--
-- Venda = pacote vendido (valor líquido, na data da venda) ou sessão avulsa
-- cobrada (valor da sessão, no dia em que foi agendada). Avaliação inicial
-- não é venda. Cancelados não contam.
--
-- Canal, pela origem da venda:
--   comercial — vendida por SDR ou closer (ou agendada pelo comercial)
--   clinica   — upsell no atendimento, ou pacote vendido pela profissional
--   recepcao  — o restante (recepção, admin, gestão)
--
-- SECURITY INVOKER: cada perfil vê o que o RLS já lhe mostra; a Central é
-- aberta para admin e gestão, que leem pacote, agendamento e usuário.

create function vendas_periodo(p_de date, p_ate date)
returns table (
  tipo text, id uuid, dia date, valor numeric,
  paciente_id uuid, paciente_nome text, procedimento_nome text,
  vendedor_id uuid, vendedor_nome text, vendedor_perfil text, canal text
) language sql stable security invoker as $$
  select 'pacote', pc.id, pc.data_venda, pc.valor_total - pc.desconto,
         pa.id, pa.nome, pr.nome,
         u.id, u.nome, u.perfil::text,
         case when u.perfil in ('sdr', 'closer') then 'comercial'
              when u.perfil = 'profissional' then 'clinica'
              else 'recepcao' end
    from pacote pc
    join paciente pa on pa.id = pc.paciente_id
    join procedimento pr on pr.id = pc.procedimento_id
    left join usuario u on u.id = pc.vendido_por
   where pc.status <> 'cancelado'
     and pc.data_venda between p_de and p_ate
  union all
  select 'avulsa', a.id, (a.created_at at time zone tz_clinica())::date, a.valor_avulso,
         pa.id, pa.nome, pr.nome,
         u.id, u.nome, u.perfil::text,
         case when a.origem = 'comercial' then 'comercial'
              when a.origem = 'upsell' then 'clinica'
              else 'recepcao' end
    from agendamento a
    join paciente pa on pa.id = a.paciente_id
    join procedimento pr on pr.id = a.procedimento_id
    left join usuario u on u.id = coalesce(a.vendido_por, a.criado_por)
   where a.pacote_id is null
     and coalesce(a.valor_avulso, 0) > 0
     and not pr.avaliacao
     and a.status <> 'cancelado'
     and (a.created_at at time zone tz_clinica())::date between p_de and p_ate
$$;

-- Funil: pacientes com avaliação realizada no período, quantos compraram
-- depois dela (pacote ou sessão avulsa paga, em qualquer data) e em quantos
-- dias, em média, da avaliação até a primeira compra.
create function funil_avaliacao(p_de date, p_ate date)
returns table (avaliados integer, compraram integer, dias_ate_compra numeric)
language sql stable security invoker as $$
  with avaliacao as (
    select a.paciente_id, min((a.inicio at time zone tz_clinica())::date) as dia
      from agendamento a
      join procedimento pr on pr.id = a.procedimento_id
     where pr.avaliacao and a.status = 'realizado'
       and (a.inicio at time zone tz_clinica())::date between p_de and p_ate
     group by a.paciente_id
  ),
  compras as (
    select pc.paciente_id, pc.data_venda as dia
      from pacote pc where pc.status <> 'cancelado'
    union all
    select a.paciente_id, (a.created_at at time zone tz_clinica())::date
      from agendamento a join procedimento pr on pr.id = a.procedimento_id
     where a.pacote_id is null and coalesce(a.valor_avulso, 0) > 0
       and not pr.avaliacao and a.status <> 'cancelado'
  ),
  primeira as (
    select av.paciente_id, av.dia as avaliado_em, min(c.dia) as comprou_em
      from avaliacao av
      left join compras c on c.paciente_id = av.paciente_id and c.dia >= av.dia
     group by av.paciente_id, av.dia
  )
  select count(*)::int,
         count(comprou_em)::int,
         round(avg(comprou_em - avaliado_em) filter (where comprou_em is not null), 1)
    from primeira
$$;

revoke execute on function vendas_periodo(date, date) from public, anon;
grant execute on function vendas_periodo(date, date) to authenticated;
revoke execute on function funil_avaliacao(date, date) from public, anon;
grant execute on function funil_avaliacao(date, date) to authenticated;
