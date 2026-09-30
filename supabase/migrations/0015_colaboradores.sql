-- 0015 · Colaboradores e correção do catálogo
--
-- CORREÇÃO DA 0014
-- Eu havia inativado "CM Slim" e "Toxina 50 UI" inferindo do mapa de salas.
-- A inferência estava errada: aquele mapa diz onde cada procedimento acontece,
-- não qual é o catálogo. A lista de colaboradores mostra quatro profissionais
-- habilitadas em CM Slim e duas em toxinas — os dois continuam em linha.

begin;

update procedimento set ativo = true
 where nome in ('CM Slim', 'Toxina 50 UI');

update equipamento set ativo = true where nome = 'CM Slim';

-- Toxina e preenchedor são os dois pilares da harmonização e se medem
-- diferente: toxina em UI, preenchedor em ml/seringa. Como procedimento
-- separado, cada um carrega o próprio custo de insumo — que é a maior parte
-- do custo e difere muito entre eles.
insert into procedimento (nome, duracao_min, buffer_min, sessoes_padrao, valor_sessao)
values ('Preenchedores', 40, 0, 1, 0)
on conflict do nothing;

insert into procedimento_regiao
  (procedimento_id, regiao_id, unidade, quantidade_padrao, sessoes_padrao)
select p.id, r.id, 'ml'::unidade_medida, 1, 1
from procedimento p, regiao r
where p.nome = 'Preenchedores'
  and r.nome in ('Lábios', 'Malar', 'Mento', 'Sulco nasogeniano', 'Glabela')
on conflict (procedimento_id, regiao_id) do nothing;

insert into procedimento_regiao
  (procedimento_id, regiao_id, unidade, quantidade_padrao, sessoes_padrao)
select p.id, r.id, 'ui'::unidade_medida, 20, 1
from procedimento p, regiao r
where p.nome = 'Toxina 50 UI'
  and r.nome in ('Testa', 'Glabela', 'Periorbital', 'Mento')
on conflict (procedimento_id, regiao_id) do nothing;

-- ── Colaboradores ───────────────────────────────────────────────────────────
-- As cores da agenda saem da paleta categórica validada, na ordem fixa dos
-- slots. É identidade — cada profissional é uma categoria distinta na
-- timeline — e a ordem fixa garante que filtrar a agenda não repinte quem
-- sobrou. Por isso NÃO usa o azul da marca.
insert into profissional (nome, cor_agenda, especialidade)
values
  ('Gabrielle Victoria A. Gustavo',      '#2a78d6', 'Corporal e depilação'),
  ('Elaine Cristina de Souza Campos',    '#eb6834', 'Corporal e depilação'),
  ('Fabiana Silva de Oliveira Souza',    '#1baf7a', 'Corporal e depilação'),
  ('Maria Alice da Silva e Souza',       '#eda100', 'Corporal e depilação'),
  ('Lívia Bobins Sigmaringa Silva',      '#e87ba4', 'Facial e injetáveis'),
  ('Isabella Gomes Cantamessa',          '#008300', 'Facial e injetáveis'),
  ('Rosemeire da Silva Camargo Morais',  '#4a3aa7', 'Tricologia')
on conflict do nothing;

insert into profissional_remuneracao (profissional_id, custo_hora, comissao_tipo, comissao_valor)
select id, 0, 'nenhuma', 0 from profissional
on conflict (profissional_id) do nothing;

-- Seg a sex, 08:00–18:00. TODO: horário real de cada uma.
insert into recurso_disponibilidade (recurso_tipo, recurso_id, dia_semana, hora_inicio, hora_fim)
select 'profissional', p.id, d, '08:00', '18:00'
from profissional p cross join generate_series(1,5) d
where not exists (
  select 1 from recurso_disponibilidade rd
   where rd.recurso_tipo = 'profissional' and rd.recurso_id = p.id and rd.dia_semana = d
);

-- ── Habilitações ────────────────────────────────────────────────────────────
-- A agenda só oferece profissional habilitado para o procedimento escolhido
-- (RF-23a). Sem isto, a recepção pode marcar depilação com a tricologista.
insert into profissional_habilitacao (profissional_id, procedimento_id)
select pf.id, pr.id
from (values
  -- Corporal e depilação
  ('Gabrielle Victoria A. Gustavo',     'Depilação a laser'),
  ('Gabrielle Victoria A. Gustavo',     'Onda'),
  ('Gabrielle Victoria A. Gustavo',     'CM Slim'),
  ('Elaine Cristina de Souza Campos',   'Depilação a laser'),
  ('Elaine Cristina de Souza Campos',   'Onda'),
  ('Elaine Cristina de Souza Campos',   'CM Slim'),
  ('Fabiana Silva de Oliveira Souza',   'Depilação a laser'),
  ('Fabiana Silva de Oliveira Souza',   'Onda'),
  ('Fabiana Silva de Oliveira Souza',   'CM Slim'),
  ('Maria Alice da Silva e Souza',      'Depilação a laser'),
  ('Maria Alice da Silva e Souza',      'Onda'),
  ('Maria Alice da Silva e Souza',      'CM Slim'),

  -- Facial e injetáveis. "Fotona NX" e "Fotona SW" na lista do Dr. Leopoldo
  -- são os APARELHOS; no catálogo correspondem a Fotona (sala 1) e Melasma
  -- (sala 2), que é o procedimento feito no SW.
  ('Lívia Bobins Sigmaringa Silva',     'Fotona'),
  ('Lívia Bobins Sigmaringa Silva',     'Melasma'),
  ('Lívia Bobins Sigmaringa Silva',     'Toxina 50 UI'),
  ('Lívia Bobins Sigmaringa Silva',     'Preenchedores'),
  ('Isabella Gomes Cantamessa',         'Fotona'),
  ('Isabella Gomes Cantamessa',         'Melasma'),
  ('Isabella Gomes Cantamessa',         'Toxina 50 UI'),
  ('Isabella Gomes Cantamessa',         'Preenchedores'),

  -- "Tratamento capilar" é o que o catálogo chama de Tricologia (sala 9).
  ('Rosemeire da Silva Camargo Morais', 'Tricologia')
) as v(profissional, procedimento)
join profissional pf on pf.nome = v.profissional
join procedimento pr on pr.nome = v.procedimento
on conflict (profissional_id, procedimento_id) do nothing;

commit;
