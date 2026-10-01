-- 0032 · Requisito de sala e de profissional (RF-33) e recusas por gargalo (RF-78)
--
-- RF-33 · além do aparelho por modelo, o procedimento pode exigir uma sala
-- específica ou N profissionais (ex.: preenchimento com duas pessoas). Exigir
-- profissional não nomeia ninguém — quem é habilitado já vem da habilitação —,
-- então a regra "precisa de alvo" passa a aceitar profissional só com quantidade.
--
-- RF-78 · o alerta de gargalo dizia que o aparelho está cheio, mas não quanto
-- isso custa. Cada agendamento que o banco recusa (conflito ou fora da janela)
-- fica registrado; o gargalo conta as recusas que envolviam aquele modelo.

alter table procedimento_requisito drop constraint requisito_precisa_de_alvo;
alter table procedimento_requisito add constraint requisito_precisa_de_alvo
  check (recurso_tipo = 'profissional' or recurso_id is not null or modelo is not null);

create table agendamento_recusa (
  id              bigserial primary key,
  criado_em       timestamptz not null default now(),
  usuario_id      uuid references usuario(id) default auth.uid(),
  procedimento_id uuid references procedimento(id) on delete cascade,
  inicio          timestamptz not null,
  sala_id         uuid,
  equipamentos    uuid[] not null default '{}',
  profissionais   uuid[] not null default '{}',
  -- 23P01 = recurso já reservado; 23514 = fora do expediente ou bloqueado.
  codigo          text not null check (codigo in ('23P01', '23514'))
);
create index on agendamento_recusa (inicio);

alter table agendamento_recusa enable row level security;

-- Quem agenda registra a própria recusa; só a gestão lê o histórico.
create policy recusa_registra on agendamento_recusa for insert
  with check (auth.uid() is not null and usuario_id = auth.uid());
create policy recusa_leitura on agendamento_recusa for select
  using (perfil_atual() in ('admin', 'gestao'));

-- Retorno muda (coluna nova): a função é recriada, nunca sobrecarregada.
drop function if exists gargalos_equipamento(timestamptz, timestamptz, numeric);

create function gargalos_equipamento(
  p_inicio timestamptz, p_fim timestamptz, p_limiar numeric default 0.75
) returns table (modelo text, unidades integer, procedimentos integer, taxa_media numeric,
                 horas_livres numeric, recusas integer)
language sql stable as $$
  with por_modelo as (
    select e.modelo, count(*)::int as unidades, array_agg(e.id) as ids
    from equipamento e where e.ativo group by e.modelo
  ),
  usos as (
    select pm.modelo,
           avg(po.taxa_agendada) as taxa,
           sum(po.capacidade_h - po.agendadas_h) as livres
    from por_modelo pm
    join lateral (
      select * from painel_ocupacao('equipamento', p_inicio, p_fim) x
      where x.recurso_id = any (pm.ids)
    ) po on true
    group by pm.modelo
  ),
  procs as (
    select pr.modelo, count(distinct pr.procedimento_id)::int as n
    from procedimento_requisito pr
    where pr.recurso_tipo = 'equipamento' and pr.modelo is not null
    group by pr.modelo
  ),
  recusadas as (
    select pm.modelo, count(*)::int as n
      from por_modelo pm
      join agendamento_recusa r
        on r.codigo = '23P01'
       and r.equipamentos && pm.ids
       and r.inicio >= p_inicio and r.inicio < p_fim
     group by pm.modelo
  )
  select pm.modelo, pm.unidades, coalesce(pc.n, 0),
         round(coalesce(u.taxa, 0), 4), round(coalesce(u.livres, 0), 2),
         coalesce(rc.n, 0)
  from por_modelo pm
  left join usos u on u.modelo = pm.modelo
  left join procs pc on pc.modelo = pm.modelo
  left join recusadas rc on rc.modelo = pm.modelo
  where coalesce(pc.n, 0) > 1 and coalesce(u.taxa, 0) >= p_limiar
  order by u.taxa desc;
$$;

revoke execute on function gargalos_equipamento(timestamptz, timestamptz, numeric) from public, anon;
grant execute on function gargalos_equipamento(timestamptz, timestamptz, numeric) to authenticated;
