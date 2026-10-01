-- 0017 · Consolidação do catálogo
--
-- Alinha os nomes às peças de campanha, funde a duplicação SemiSlim/CM Slim e
-- fecha as lacunas de habilitação que impediam agendamento.

begin;

-- ── Nomes conforme as peças ─────────────────────────────────────────────────
-- O sistema deve chamar as coisas como a clínica chama, senão a recepção
-- precisa traduzir mentalmente entre a peça e a tela.
update procedimento set nome = 'Fotona 1D'                where nome = 'Fotona';
update procedimento set nome = 'Fotona Melasma'           where nome = 'Melasma';
update procedimento set nome = 'Onda Coolwaves'           where nome = 'Onda';
update procedimento set nome = 'Toxina Botulínica 50 UI'  where nome = 'Toxina 50 UI';
update procedimento set nome = 'Ultraformer MPT'          where nome = 'Ultraformer';

-- ── SemiSlim = CM Slim ──────────────────────────────────────────────────────
-- A peça do CM Slim diz "ganho de massa e perda de gordura", que é o que a
-- sala 4 chama de hipertrofia. "Hipertrofia (SemiSlim)" estava sem preço, sem
-- profissional e sem histórico; "CM Slim" tem os três e a campanha. Mantém-se
-- o CM Slim.
--
-- PARA DESFAZER: recriar o procedimento 'Hipertrofia (SemiSlim)' e o
-- equipamento 'SemiSlim', e reapontar a sala 4.
update sala set
  nome = 'CM Slim',
  procedimento_fixo_id = (select id from procedimento where nome = 'CM Slim')
where numero = 4;

delete from procedimento_requisito
 where procedimento_id in (select id from procedimento where nome = 'Hipertrofia (SemiSlim)');
delete from procedimento where nome = 'Hipertrofia (SemiSlim)';

delete from equipamento_custo
 where equipamento_id in (select id from equipamento where nome = 'SemiSlim');
delete from recurso_disponibilidade
 where recurso_tipo = 'equipamento'
   and recurso_id in (select id from equipamento where nome = 'SemiSlim');
delete from equipamento where nome = 'SemiSlim';

-- ── Harmonização: redundante ────────────────────────────────────────────────
-- Harmonização facial É toxina + preenchedor. Mantê-la como um terceiro
-- procedimento significaria a mesma aplicação podendo ser lançada de dois
-- jeitos, com custo e comissão divergindo entre eles. Inativada, não apagada.
update procedimento set ativo = false where nome = 'Harmonização facial';

update sala set
  nome = 'Injetáveis',
  procedimento_fixo_id = (select id from procedimento where nome = 'Toxina Botulínica 50 UI')
where numero = 6;

-- ── Habilitações que faltavam ───────────────────────────────────────────────
-- Ultraformer MPT é facial e injetável-adjacente: fica com a mesma dupla que
-- opera Fotona e toxinas. Sem isto a agenda não oferece ninguém e o
-- procedimento fica inagendável.
insert into profissional_habilitacao (profissional_id, procedimento_id)
select pf.id, pr.id
from profissional pf, procedimento pr
where pf.nome in ('Lívia Bobins Sigmaringa Silva', 'Isabella Gomes Cantamessa')
  and pr.nome = 'Ultraformer MPT'
on conflict do nothing;

-- ── Requisitos de equipamento, revisados ────────────────────────────────────
delete from procedimento_requisito;

insert into procedimento_requisito (procedimento_id, recurso_tipo, modelo, quantidade)
select p.id, 'equipamento', v.modelo, 1
from (values
  ('Fotona 1D',              'Fotona NX'),
  ('Fotona Melasma',         'Fotona SW'),
  ('Ultraformer MPT',        'Ultraformer'),
  ('CM Slim',                'CM Slim'),
  ('Onda Coolwaves',         'Onda'),
  ('Depilação a laser',      'Acrus'),
  ('Tricologia',             'Fotona SW')
) as v(proc, modelo)
join procedimento p on p.nome = v.proc;
-- Toxina e Preenchedores não consomem equipamento: o custo é todo de insumo.

-- ── Salas, mapa final ───────────────────────────────────────────────────────
update sala s set
  nome = v.rotulo,
  procedimento_fixo_id = (select id from procedimento where nome = v.proc)
from (values
  (1, 'Fotona NX',          'Fotona 1D'),
  (2, 'Fotona SW',          'Fotona Melasma'),
  (3, 'Ultraformer',        'Ultraformer MPT'),
  (4, 'CM Slim',            'CM Slim'),
  (5, 'Onda Coolwaves',     'Onda Coolwaves'),
  (6, 'Injetáveis',         'Toxina Botulínica 50 UI'),
  (7, 'Depilação a laser',  'Depilação a laser'),
  (8, 'Depilação a laser',  'Depilação a laser'),
  (9, 'Tricologia',         'Tricologia')
) as v(num, rotulo, proc)
where s.numero = v.num;

-- ── Equipamentos fixos na sala ──────────────────────────────────────────────
-- Cada aparelho mora na sua sala. Escolher o procedimento na agenda passa a
-- definir sala e equipamento sem clique adicional.
update equipamento e set tipo_alocacao = 'fixo', sala_id = s.id
from sala s, (values
  ('Fotona NX',   1),
  ('Fotona SW',   2),
  ('Ultraformer', 3),
  ('CM Slim',     4),
  ('Onda',        5),
  ('Acrus #1',    7),
  ('Acrus #2',    8)
) as v(equip, num)
where e.nome = v.equip and s.numero = v.num;

commit;
