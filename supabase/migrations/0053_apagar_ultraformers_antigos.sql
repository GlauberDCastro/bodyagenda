-- A clínica pediu para apagar (não só desativar) os Ultraformers separados por
-- região, unificados em "Ultraformer MPT" na 0052. Conferido em 08/10/2026:
-- nenhuma tabela referencia estes cinco. A condição repete a checagem para
-- nunca apagar um que ganhe uso.
delete from procedimento p
 where p.nome in ('Ultraformer Palpebras Superior', 'Ultraformer Palpebras Inferior',
                  'Ultraformer Papada', 'Ultraformer 1/3 inferior', 'Ultraformer 1/3 superior')
   and p.ativo = false
   and not exists (select 1 from agendamento a where a.procedimento_id = p.id)
   and not exists (select 1 from pacote pc where pc.procedimento_id = p.id)
   and not exists (select 1 from meta_venda m where m.procedimento_id = p.id);
