-- 0044 · Upsell marcado na criação, não num update depois
--
-- A 0041 criava o atendimento e depois fazia update para marcar origem,
-- atendimento de origem e vendedor. Para a profissional, esse update esbarra
-- na regra da 0023 ("profissional só altera status") e o upsell dela falhava
-- (o teste de RLS pegou). Agora a marca entra no próprio insert: o
-- registrar_upsell avisa por uma configuração da transação, e o gatilho de
-- origem a aplica. A regra da 0023 continua valendo para todo o resto.

create or replace function trg_origem_do_agendamento() returns trigger
language plpgsql as $$
declare
  v_upsell text := nullif(current_setting('app.upsell_origem', true), '');
begin
  if v_upsell is not null then
    new.origem := 'upsell';
    new.atendimento_origem_id := v_upsell::uuid;
    new.vendido_por := auth.uid();
  elsif new.origem = 'agenda' and perfil_atual() in ('sdr', 'closer') then
    new.origem := 'comercial';
    new.vendido_por := coalesce(new.vendido_por, auth.uid());
  end if;
  return new;
end $$;

create or replace function registrar_upsell(
  p_origem        uuid,
  p_procedimento  uuid,
  p_inicio        timestamptz,
  p_sala          uuid,
  p_equipamentos  uuid[] default '{}',
  p_profissionais uuid[] default '{}',
  p_pacote        uuid default null,
  p_observacoes   text default null,
  p_valor_avulso  numeric default null,
  p_duracao       integer default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_origem agendamento%rowtype;
  v_id     uuid;
begin
  select * into v_origem from agendamento where id = p_origem;
  if not found or v_origem.status = 'cancelado' then
    raise exception 'Atendimento de origem não encontrado' using errcode = '23503';
  end if;

  if not (
    perfil_atual() = 'admin' or e_atendimento()
    or (perfil_atual() = 'profissional' and exists (
          select 1 from agendamento_profissional ap
            join profissional p on p.id = ap.profissional_id
           where ap.agendamento_id = p_origem and p.usuario_id = auth.uid()))
  ) then
    raise exception 'Sem permissão para registrar upsell neste atendimento' using errcode = '42501';
  end if;

  -- O gatilho de origem lê isto no insert do criar_agendamento.
  perform set_config('app.upsell_origem', p_origem::text, true);
  v_id := criar_agendamento(v_origem.paciente_id, p_procedimento, p_inicio, p_sala,
                            p_equipamentos, p_profissionais, p_pacote, p_observacoes,
                            p_valor_avulso, null, null, p_duracao);
  perform set_config('app.upsell_origem', '', true);
  return v_id;
end $$;
