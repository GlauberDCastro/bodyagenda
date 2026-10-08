-- Preço parcelado. A clínica cobra mais na venda parcelada; nas vendas de
-- outubro/2026 a regra foi à vista ÷ 0,85 (999 → 1.175,30). Cada procedimento
-- (e cada região, quando o preço dela difere) guarda os dois preços; a venda
-- com mais de uma parcela usa o parcelado.

alter table procedimento add column valor_parcelado numeric(12,2) check (valor_parcelado >= 0);
alter table procedimento_regiao add column valor_parcelado numeric(12,2) check (valor_parcelado >= 0);

-- Ponto de partida pela regra das planilhas; a clínica ajusta o que diferir.
update procedimento set valor_parcelado = round(valor_sessao / 0.85, 2) where valor_sessao > 0; -- centavo: ver 0051
update procedimento_regiao set valor_parcelado = round(valor_sessao / 0.85, 2)
 where valor_sessao is not null and valor_sessao > 0;
