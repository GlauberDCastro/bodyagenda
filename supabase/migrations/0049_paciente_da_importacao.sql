-- Paciente de uma venda importada: o relatório do sistema anterior traz só o
-- nome. Usa o cadastro com o mesmo nome (sem diferença de maiúsculas e
-- espaços) ou cria um. Gestão importa vendas mas não cadastra paciente pelo
-- RLS; por isso a função, com a mesma checagem de importar_venda().
create or replace function paciente_da_importacao(p_nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_nome text := regexp_replace(trim(p_nome), '\s+', ' ', 'g');
  v_id   uuid;
begin
  if not e_gestao() then
    raise exception 'Só administração e gestão importam vendas' using errcode = '42501';
  end if;
  if length(v_nome) < 2 then
    raise exception 'Nome do paciente vazio' using errcode = '23514';
  end if;

  select id into v_id from paciente
   where lower(regexp_replace(trim(nome), '\s+', ' ', 'g')) = lower(v_nome)
   order by created_at limit 1;
  if v_id is null then
    insert into paciente (nome, observacoes)
    values (v_nome, 'Cadastrado pela importação de vendas do sistema anterior.')
    returning id into v_id;
  end if;
  return v_id;
end $$;

revoke execute on function paciente_da_importacao(text) from public, anon;
grant execute on function paciente_da_importacao(text) to authenticated;
