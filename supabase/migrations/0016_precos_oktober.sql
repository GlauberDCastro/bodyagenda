-- 0016 · Preços — Oktober Body Fest
--
-- As peças trazem DOIS preços: o "DE:" (tabela cheia) e o "por" (campanha).
-- Guardar só o de campanha apagaria a informação de desconto, que é o que
-- permite medir depois se a promoção trouxe volume ou só corroeu margem.
--
-- `valor_sessao` = o que se cobra HOJE (campanha, se houver).
-- `valor_tabela` = o preço cheio, para comparação e para voltar ao normal.

begin;

alter table procedimento        add column if not exists valor_tabela numeric(12,2);
alter table procedimento_regiao add column if not exists valor_tabela numeric(12,2);

comment on column procedimento.valor_tabela is
  'Preço cheio. valor_sessao é o praticado; a diferença é o desconto de campanha.';

-- ── Regiões do Ultraformer conforme as peças ────────────────────────────────
-- "1/3" na minha carga inicial é o que a clínica chama de "terço".
update regiao set nome = 'Terço superior' where nome = '1/3 superior';
update regiao set nome = 'Terço inferior' where nome = '1/3 inferior';

insert into regiao (nome, grupo, ordem) values
  ('Pálpebra superior', 'Face', 12),
  ('Pálpebra inferior', 'Face', 14)
on conflict (nome) do nothing;

-- ── Corpo ───────────────────────────────────────────────────────────────────
-- R$ 799 é o PACOTE de 8 sessões (confirma D-11): R$ 99,88 por sessão.
-- Tratar 799 como preço de sessão inflaria a receita em 8x.
update procedimento set
  sessoes_padrao = 8,
  valor_sessao   = round(799.00 / 8, 2),
  valor_tabela   = round(1185.92 / 8, 2),
  duracao_min    = 30
where nome in ('CM Slim', 'Onda');

-- ── Facial ──────────────────────────────────────────────────────────────────
update procedimento set
  valor_sessao = 999.00, valor_tabela = 2381.00, duracao_min = 15, sessoes_padrao = 1
where nome = 'Fotona';

update procedimento set
  valor_sessao = 999.00, valor_tabela = 2381.00, duracao_min = 20, sessoes_padrao = 1
where nome = 'Melasma';

update procedimento set
  valor_sessao = 799.00, valor_tabela = 1405.00, duracao_min = 30, sessoes_padrao = 1
where nome = 'Toxina 50 UI';

-- ── Ultraformer: preço por região ───────────────────────────────────────────
-- É exatamente o caso que motivou o modelo de regiões: quatro preços e duas
-- durações no mesmo procedimento.
insert into procedimento_regiao
  (procedimento_id, regiao_id, duracao_min, sessoes_padrao, valor_sessao, valor_tabela, unidade)
select p.id, r.id, v.dur, 1, v.preco, v.tabela, 'sessao'::unidade_medida
from (values
  ('Terço superior',    40, 1390.00, 2691.00),
  ('Terço inferior',    40, 1390.00, 3013.92),
  ('Pálpebra superior', 20,  799.00, 1400.00),
  ('Pálpebra inferior', 20,  799.00, 1400.00)
) as v(reg, dur, preco, tabela)
join procedimento p on p.nome = 'Ultraformer'
join regiao r on r.nome = v.reg
on conflict (procedimento_id, regiao_id) do update set
  duracao_min  = excluded.duracao_min,
  valor_sessao = excluded.valor_sessao,
  valor_tabela = excluded.valor_tabela;

-- "Olhos" era um rótulo genérico da carga inicial; as peças mostram que a
-- clínica separa pálpebra superior de inferior, com preços iguais mas
-- protocolos distintos. A linha genérica sai.
delete from procedimento_regiao pr
 using procedimento p, regiao r
 where pr.procedimento_id = p.id and pr.regiao_id = r.id
   and p.nome = 'Ultraformer' and r.nome = 'Olhos';

-- O procedimento herda o preço mais baixo das regiões: agendamento sem região
-- informada não pode sair mais caro do que o cliente espera.
update procedimento set valor_sessao = 799.00, valor_tabela = 1400.00, duracao_min = 20
 where nome = 'Ultraformer';

commit;
