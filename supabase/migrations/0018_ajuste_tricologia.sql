-- 0018 · Tricologia sem equipamento vinculado
--
-- Eu havia vinculado Tricologia ao Fotona SW por suposição. Com o Fotona SW
-- agora FIXO na sala 2, e a tricologia acontecendo na sala 9, o requisito
-- descreveria uma situação impossível: a agenda reservaria um aparelho que
-- não está na sala do atendimento.
--
-- Sem informação sobre qual aparelho a tricologia usa (se usa), o correto é
-- não inventar: fica sem requisito até a clínica informar.

delete from procedimento_requisito pr
 using procedimento p
 where pr.procedimento_id = p.id and p.nome = 'Tricologia';
