-- Carga inicial · PRD Anexo A (operação October Fast)
-- Tudo aqui é EDITÁVEL PELO PAINEL (princípio P3). O seed existe para que o
-- sistema nasça utilizável, não para fixar a configuração da clínica.
--
-- Preços e durações conforme a tabela fornecida pela Body Prime.
-- Pendências marcadas como TODO são dados que a clínica ainda não definiu.

begin;

-- ── Procedimentos ────────────────────────────────────────────────────────────
-- buffer_min = 0 em todos: pendência A-09 (tempo de preparo/limpeza).
-- Ajustar no painel assim que a clínica informar.
insert into procedimento (id, nome, duracao_min, buffer_min, sessoes_padrao, valor_sessao)
values
  ('a0000001-0000-4000-8000-000000000001','Toxina 50 UI',              15, 0, 1,  799.00),
  ('a0000001-0000-4000-8000-000000000002','Ultraformer Olhos',         20, 0, 1,  799.00),
  ('a0000001-0000-4000-8000-000000000003','Ultraformer Papada',        20, 0, 1,  799.00),
  -- R$ 799 é o PACOTE FECHADO de 8 sessões → R$ 99,88 por sessão (D-11)
  ('a0000001-0000-4000-8000-000000000004','CM Slim',                   30, 0, 8,   99.88),
  ('a0000001-0000-4000-8000-000000000005','Onda Coolwaves',            30, 0, 8,   99.88),
  ('a0000001-0000-4000-8000-000000000006','Fotona',                    15, 0, 1,  999.00),
  ('a0000001-0000-4000-8000-000000000007','Ultraformer 1/3 superior',  40, 0, 1, 1390.00),
  ('a0000001-0000-4000-8000-000000000008','Ultraformer 1/3 inferior',  40, 0, 1, 1390.00),
  -- TODO A-06: preço e nº de sessões do protocolo ainda não definidos
  ('a0000001-0000-4000-8000-000000000009','Melasma',                   20, 0, 1,    0.00);

-- ── Salas ────────────────────────────────────────────────────────────────────
-- Salas 1 a 8 dedicadas conforme o mapa do October Fast (D-09).
-- O Melasma roda em sala flexível (D-13) — a sala 9 nasce sem procedimento fixo.
insert into sala (numero, nome, tipo_alocacao, procedimento_fixo_id)
values
  (1,'Sala 1','dedicada','a0000001-0000-4000-8000-000000000001'),
  (2,'Sala 2','dedicada','a0000001-0000-4000-8000-000000000002'),
  (3,'Sala 3','dedicada','a0000001-0000-4000-8000-000000000003'),
  (4,'Sala 4','dedicada','a0000001-0000-4000-8000-000000000004'),
  (5,'Sala 5','dedicada','a0000001-0000-4000-8000-000000000005'),
  (6,'Sala 6','dedicada','a0000001-0000-4000-8000-000000000006'),
  (7,'Sala 7','dedicada','a0000001-0000-4000-8000-000000000007'),
  (8,'Sala 8','dedicada','a0000001-0000-4000-8000-000000000008'),
  (9,'Sala 9','flexivel', null);

-- ── Equipamentos ─────────────────────────────────────────────────────────────
-- 4 Ultraformer (D-10) — móveis, pois as salas dedicadas não travam o aparelho.
-- Fotona móvel porque atende a sala 6 E o Melasma em sala flexível (D-13).
-- TODO A-08: confirmar quantas unidades de Fotona existem. Uma só = gargalo.
insert into equipamento (nome, modelo, tipo_alocacao)
values
  ('Ultraformer #1','Ultraformer','movel'),
  ('Ultraformer #2','Ultraformer','movel'),
  ('Ultraformer #3','Ultraformer','movel'),
  ('Ultraformer #4','Ultraformer','movel'),
  ('Fotona #1',     'Fotona',     'movel'),
  ('CM Slim #1',    'CM Slim',    'movel'),
  ('Coolwaves #1',  'Onda Coolwaves','movel');

-- Custo/hora zerado: TODO levantar com a clínica (bloqueia o cálculo de margem).
insert into equipamento_custo (equipamento_id, custo_hora)
select id, 0 from equipamento;

-- ── Requisitos de recurso por procedimento ───────────────────────────────────
-- Por MODELO, não por unidade: o sistema acha sozinho qual das 4 unidades de
-- Ultraformer está livre (RF-48). A Toxina não consome equipamento.
insert into procedimento_requisito (procedimento_id, recurso_tipo, modelo, quantidade)
values
  ('a0000001-0000-4000-8000-000000000002','equipamento','Ultraformer',1),
  ('a0000001-0000-4000-8000-000000000003','equipamento','Ultraformer',1),
  ('a0000001-0000-4000-8000-000000000004','equipamento','CM Slim',1),
  ('a0000001-0000-4000-8000-000000000005','equipamento','Onda Coolwaves',1),
  ('a0000001-0000-4000-8000-000000000006','equipamento','Fotona',1),
  ('a0000001-0000-4000-8000-000000000007','equipamento','Ultraformer',1),
  ('a0000001-0000-4000-8000-000000000008','equipamento','Ultraformer',1),
  ('a0000001-0000-4000-8000-000000000009','equipamento','Fotona',1);

-- ── Disponibilidade ──────────────────────────────────────────────────────────
-- Segunda a sexta, 08:00–18:00, para todas as salas e equipamentos.
-- TODO: horário real de cada recurso (item 4 da lista do plano). Sem
-- disponibilidade cadastrada o recurso não aceita agendamento algum.
insert into recurso_disponibilidade (recurso_tipo, recurso_id, dia_semana, hora_inicio, hora_fim)
select 'sala', id, d, '08:00', '18:00' from sala cross join generate_series(1,5) d;

insert into recurso_disponibilidade (recurso_tipo, recurso_id, dia_semana, hora_inicio, hora_fim)
select 'equipamento', id, d, '08:00', '18:00' from equipamento cross join generate_series(1,5) d;

commit;
