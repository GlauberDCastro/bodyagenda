-- As vendas de outubro arredondam o centavo para cima (1.390 ÷ 0,85 = 1.635,294
-- → 1.635,30; 999 ÷ 0,85 → 1.175,30). Só corrige o que ainda é o valor
-- calculado pela 0050, sem tocar no que a clínica já ajustou.
update procedimento set valor_parcelado = ceil(valor_sessao / 0.85 * 100) / 100
 where valor_sessao > 0 and valor_parcelado = round(valor_sessao / 0.85, 2);
update procedimento_regiao set valor_parcelado = ceil(valor_sessao / 0.85 * 100) / 100
 where valor_sessao > 0 and valor_parcelado = round(valor_sessao / 0.85, 2);
