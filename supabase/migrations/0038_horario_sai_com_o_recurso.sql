-- 0038 · Horário e bloqueio saem junto com o recurso
--
-- recurso_disponibilidade e recurso_bloqueio apontam para sala, equipamento
-- ou profissional pelo par (tipo, id) — sem chave estrangeira, porque o alvo
-- muda de tabela. Apagar o recurso deixava o horário para trás: havia 200
-- linhas de 40 profissionais que já não existiam (rastro de testes), e elas
-- travavam qualquer atualização em massa do horário.
--
-- O gatilho faz o papel do ON DELETE CASCADE que a chave não pode ter.

create or replace function trg_apagar_agenda_do_recurso() returns trigger
language plpgsql as $$
begin
  delete from recurso_disponibilidade where recurso_id = old.id;
  delete from recurso_bloqueio        where recurso_id = old.id;
  return old;
end $$;

create trigger sala_apaga_agenda         after delete on sala
  for each row execute function trg_apagar_agenda_do_recurso();
create trigger equipamento_apaga_agenda  after delete on equipamento
  for each row execute function trg_apagar_agenda_do_recurso();
create trigger profissional_apaga_agenda after delete on profissional
  for each row execute function trg_apagar_agenda_do_recurso();

-- Limpa os órfãos que já existem.
delete from recurso_disponibilidade d
 where not exists (select 1 from sala s where s.id = d.recurso_id)
   and not exists (select 1 from equipamento e where e.id = d.recurso_id)
   and not exists (select 1 from profissional p where p.id = d.recurso_id);
delete from recurso_bloqueio b
 where not exists (select 1 from sala s where s.id = b.recurso_id)
   and not exists (select 1 from equipamento e where e.id = b.recurso_id)
   and not exists (select 1 from profissional p where p.id = b.recurso_id);
