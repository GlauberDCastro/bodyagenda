-- Ultraformer é um procedimento só ("Ultraformer MPT"), com preço e duração por
-- região. Os cadastros separados por região saem da agenda e da venda. Só
-- desativa: nenhum deles tem agendamento, pacote ou meta (conferido em
-- 08/10/2026), e o histórico de auditoria continua apontando para eles.
update procedimento p set ativo = false
 where p.nome in ('Ultraformer Palpebras Superior', 'Ultraformer Palpebras Inferior',
                  'Ultraformer Papada', 'Ultraformer 1/3 inferior', 'Ultraformer 1/3 superior')
   and not exists (select 1 from agendamento a where a.procedimento_id = p.id)
   and not exists (select 1 from pacote pc where pc.procedimento_id = p.id)
   and not exists (select 1 from meta_venda m where m.procedimento_id = p.id);
