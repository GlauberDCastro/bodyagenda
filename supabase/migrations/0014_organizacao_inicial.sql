-- 0014 · Organização inicial da clínica (Dr. Leopoldo)
--
-- Substitui o mapa do October Fast pela operação do dia a dia.
--
-- Nada é apagado à toa: procedimentos que saem de linha são INATIVADOS, não
-- excluídos — reativar é um clique, e o histórico continua íntegro. Só os
-- equipamentos sem nenhuma referência são removidos de fato.
--
-- MUDANÇA DE MODELAGEM
-- "Ultraformer Olhos", "Papada", "1/3 superior" e "1/3 inferior" eram quatro
-- procedimentos apenas porque não existia o conceito de região. Agora são UM
-- procedimento com quatro regiões, cada uma com sua duração e seu preço. Isso
-- elimina a duplicação de custo e de requisito de equipamento em cada cópia.

begin;

-- ── Regiões ─────────────────────────────────────────────────────────────────
insert into regiao (nome, grupo, ordem) values
  ('Olhos',           'Face', 10),
  ('Papada',          'Face', 20),
  ('1/3 superior',    'Face', 30),
  ('1/3 inferior',    'Face', 40),
  ('Face completa',   'Face', 50),
  ('Pescoço',         'Face', 60),
  ('Testa',           'Face', 70),
  ('Glabela',         'Face', 80),
  ('Periorbital',     'Face', 90),
  ('Malar',           'Face', 100),
  ('Mento',           'Face', 110),
  ('Lábios',          'Face', 120),
  ('Sulco nasogeniano','Face', 130),

  ('Abdômen',         'Corpo', 200),
  ('Flancos',         'Corpo', 210),
  ('Culote',          'Corpo', 220),
  ('Glúteos',         'Corpo', 230),
  ('Coxas',           'Corpo', 240),
  ('Braços',          'Corpo', 250),
  ('Panturrilhas',    'Corpo', 260),

  ('Axilas',          'Depilação', 300),
  ('Virilha',         'Depilação', 310),
  ('Pernas',          'Depilação', 320),
  ('Buço',            'Depilação', 330),
  ('Barba',           'Depilação', 340),
  ('Tórax',           'Depilação', 350),

  ('Couro cabeludo',  'Tricologia', 400),
  ('Entradas',        'Tricologia', 410),
  ('Coroa',           'Tricologia', 420)
on conflict (nome) do nothing;

-- ── Procedimentos ───────────────────────────────────────────────────────────
-- Os que continuam, renomeados/consolidados.
update procedimento set nome = 'Ultraformer'
 where nome = 'Ultraformer Olhos';

-- Saem de linha (inativados, não apagados).
update procedimento set ativo = false
 where nome in ('Ultraformer Papada', 'Ultraformer 1/3 superior',
                'Ultraformer 1/3 inferior', 'Toxina 50 UI', 'CM Slim');

-- Novos.
insert into procedimento (nome, duracao_min, buffer_min, sessoes_padrao, valor_sessao)
values
  ('Hipertrofia (SemiSlim)', 30, 0, 8,   0),
  ('Harmonização facial',    60, 0, 1,   0),
  ('Depilação a laser',      30, 0, 10,  0),
  ('Tricologia',             60, 0, 1,   0)
on conflict do nothing;

-- Onda Coolwaves vira só "Onda"; Fotona e Melasma permanecem.
update procedimento set nome = 'Onda' where nome = 'Onda Coolwaves';

-- ── Protocolo por região ────────────────────────────────────────────────────
-- Preserva a duração e o preço que cada "procedimento" tinha antes de virar
-- região. Os valores vieram da tabela do October Fast e devem ser revistos.
insert into procedimento_regiao
  (procedimento_id, regiao_id, duracao_min, sessoes_padrao, valor_sessao, unidade)
select p.id, r.id, v.dur, v.ses, v.val, 'sessao'::unidade_medida
from (values
  ('Ultraformer', 'Olhos',        20, 1,  799.00),
  ('Ultraformer', 'Papada',       20, 1,  799.00),
  ('Ultraformer', '1/3 superior', 40, 1, 1390.00),
  ('Ultraformer', '1/3 inferior', 40, 1, 1390.00)
) as v(proc, reg, dur, ses, val)
join procedimento p on p.nome = v.proc
join regiao r on r.nome = v.reg
on conflict (procedimento_id, regiao_id) do nothing;

-- Harmonização se mede em UNIDADES, não em sessão. É o caso que motivou o
-- campo `unidade`: "1 sessão de harmonização" não diz nada; "20 UI na
-- glabela" diz tudo.
insert into procedimento_regiao
  (procedimento_id, regiao_id, unidade, quantidade_padrao, sessoes_padrao)
select p.id, r.id, 'ui'::unidade_medida, 20, 1
from procedimento p, regiao r
where p.nome = 'Harmonização facial'
  and r.nome in ('Testa', 'Glabela', 'Periorbital', 'Malar', 'Mento')
on conflict (procedimento_id, regiao_id) do nothing;

insert into procedimento_regiao
  (procedimento_id, regiao_id, unidade, quantidade_padrao, sessoes_padrao)
select p.id, r.id, 'ml'::unidade_medida, 1, 1
from procedimento p, regiao r
where p.nome = 'Harmonização facial'
  and r.nome in ('Lábios', 'Sulco nasogeniano')
on conflict (procedimento_id, regiao_id) do nothing;

-- Depilação: por região, contada em flashes.
insert into procedimento_regiao
  (procedimento_id, regiao_id, duracao_min, sessoes_padrao, unidade)
select p.id, r.id, 30, 10, 'flash'::unidade_medida
from procedimento p, regiao r
where p.nome = 'Depilação a laser' and r.grupo = 'Depilação'
on conflict (procedimento_id, regiao_id) do nothing;

insert into procedimento_regiao (procedimento_id, regiao_id, duracao_min, sessoes_padrao)
select p.id, r.id, 60, 1
from procedimento p, regiao r
where p.nome = 'Tricologia' and r.grupo = 'Tricologia'
on conflict (procedimento_id, regiao_id) do nothing;

-- ── Equipamentos ────────────────────────────────────────────────────────────
-- Os 4 Ultraformer viram 1, agora FIXO na sala 3. As outras 3 unidades nunca
-- foram usadas, então saem de vez.
delete from equipamento_custo
 where equipamento_id in (select id from equipamento where nome in
   ('Ultraformer #2', 'Ultraformer #3', 'Ultraformer #4'));
delete from recurso_disponibilidade
 where recurso_tipo = 'equipamento'
   and recurso_id in (select id from equipamento where nome in
   ('Ultraformer #2', 'Ultraformer #3', 'Ultraformer #4'));
delete from equipamento where nome in
  ('Ultraformer #2', 'Ultraformer #3', 'Ultraformer #4');

update equipamento set nome = 'Ultraformer' where nome = 'Ultraformer #1';
update equipamento set nome = 'Fotona NX', modelo = 'Fotona NX' where nome = 'Fotona #1';
update equipamento set nome = 'CM Slim', modelo = 'CM Slim', ativo = false where nome = 'CM Slim #1';
update equipamento set nome = 'Onda', modelo = 'Onda' where nome = 'Coolwaves #1';

insert into equipamento (nome, modelo, tipo_alocacao)
values
  ('Fotona SW', 'Fotona SW', 'movel'),
  ('SemiSlim',  'SemiSlim',  'movel'),
  ('Acrus #1',  'Acrus',     'movel'),
  ('Acrus #2',  'Acrus',     'movel')
on conflict do nothing;

insert into equipamento_custo (equipamento_id, custo_hora)
select id, 0 from equipamento
on conflict (equipamento_id) do nothing;

insert into recurso_disponibilidade (recurso_tipo, recurso_id, dia_semana, hora_inicio, hora_fim)
select 'equipamento', e.id, d, '08:00', '18:00'
from equipamento e cross join generate_series(1,5) d
where not exists (
  select 1 from recurso_disponibilidade rd
  where rd.recurso_tipo = 'equipamento' and rd.recurso_id = e.id and rd.dia_semana = d
);

-- ── Salas: o mapa novo ──────────────────────────────────────────────────────
update sala s set
  nome = v.rotulo,
  tipo_alocacao = 'dedicada',
  procedimento_fixo_id = (select id from procedimento where nome = v.proc)
from (values
  (1, 'Fotona NX',          'Fotona'),
  (2, 'Melasma',            'Melasma'),
  (3, 'Ultraformer',        'Ultraformer'),
  (4, 'Hipertrofia',        'Hipertrofia (SemiSlim)'),
  (5, 'Onda',               'Onda'),
  (6, 'Harmonização',       'Harmonização facial'),
  (7, 'Depilação a laser',  'Depilação a laser'),
  (8, 'Depilação a laser',  'Depilação a laser'),
  (9, 'Tricologia',         'Tricologia')
) as v(num, rotulo, proc)
where s.numero = v.num;

-- Ultraformer passa a morar na sala 3.
update equipamento
   set tipo_alocacao = 'fixo',
       sala_id = (select id from sala where numero = 3)
 where nome = 'Ultraformer';

-- ── Requisitos de equipamento por procedimento ──────────────────────────────
delete from procedimento_requisito;

insert into procedimento_requisito (procedimento_id, recurso_tipo, modelo, quantidade)
select p.id, 'equipamento', v.modelo, 1
from (values
  ('Fotona',                 'Fotona NX'),
  ('Melasma',                'Fotona SW'),
  ('Ultraformer',            'Ultraformer'),
  ('Hipertrofia (SemiSlim)', 'SemiSlim'),
  ('Onda',                   'Onda'),
  ('Depilação a laser',      'Acrus'),
  ('Tricologia',             'Fotona SW')
) as v(proc, modelo)
join procedimento p on p.nome = v.proc;
-- Harmonização não consome equipamento: é aplicação, o custo é todo de insumo.

commit;
