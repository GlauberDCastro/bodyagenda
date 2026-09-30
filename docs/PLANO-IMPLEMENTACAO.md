# Plano de Implementação
### Painel de Gestão de Ocupação e Agenda — Body Prime

| | |
|---|---|
| **Versão** | 1.0 · 30/09/2026 |
| **Deriva de** | [PRD v1.3](PRD.md) · [SPEC v1.0](SPEC.md) |
| **Alvo** | Vercel `LINKEED` / `bodyprime-ocupacao` · Supabase `sa-east-1` |

---

## Princípio de sequenciamento

O plano é ordenado por **risco técnico decrescente**, não por facilidade. O item mais arriscado do sistema — a garantia anti-duplo-booking sob concorrência — é atacado no **M1**, antes de qualquer tela. Se o `EXCLUDE USING gist` não se comportar como esperado, o custo de descobrir isso na semana 1 é uma tarde; na semana 6, com agenda e painel construídos em cima, é uma reescrita.

A segunda decisão: **deploy funcionando no M0**, com página vazia. Ambiente que só é montado no fim concentra no pior momento todos os problemas de variável de ambiente, região, RLS e migração.

---

## M0 — Fundação e deploy vazio
**Entrega:** aplicação no ar na Vercel, com login funcionando e nenhuma tela além dele.

| # | Tarefa | Referência |
|---|---|---|
| 0.1 | `git init`, repositório no GitHub | — |
| 0.2 | `create-next-app` — TypeScript strict, Tailwind, App Router | SPEC §1.2 |
| 0.3 | shadcn/ui, Zod, date-fns-tz, Vitest | SPEC §1.2 |
| 0.4 | Criar Supabase `bodyprime-prod` e `bodyprime-staging`, ambos `sa-east-1` | SPEC §7.1 |
| 0.5 | Criar projeto Vercel `bodyprime-ocupacao` no time LINKEED, região `gru1` | SPEC §7.2 |
| 0.6 | Variáveis de ambiente nos dois escopos; `service_role` como sensitive | SPEC §7.3 |
| 0.7 | Clientes Supabase (server/client/middleware) + guarda de sessão | SPEC §6 |
| 0.8 | Tabela `usuario`, enum `perfil_usuario`, RLS, helpers `perfil_atual()` | SPEC §5.1 |
| 0.9 | Tela de login e logout | RF-01, RF-05 |
| 0.10 | Deploy em produção e **verificação de que preview aponta para staging** | SPEC §7.1 |

**Critério de saída:** o admin faz login em `bodyprime-ocupacao.vercel.app`, e um PR de teste gera preview que escreve no staging — comprovado abrindo um PR descartável.

---

## M1 — Motor de reserva *(o marco crítico)*
**Entrega:** nenhuma interface. Schema, triggers, funções e a prova de que o conflito é impossível.

| # | Tarefa | Referência |
|---|---|---|
| 1.1 | Migração: extensões, enums, tabelas de recurso com vigência | SPEC §3.1–3.2 |
| 1.2 | `recurso_disponibilidade`, `recurso_bloqueio` | RF-24 a RF-26 |
| 1.3 | `procedimento`, `procedimento_custo`, `procedimento_requisito`, `buffer_min` | RF-30 a RF-33 |
| 1.4 | `agendamento` + N:N de equipamento e profissional | RF-42 |
| 1.5 | **`reserva` com `EXCLUDE USING gist`** | RNF-05, SPEC §3.5 |
| 1.6 | `rebuild_reservas()` + triggers nas três tabelas | SPEC §3.5 |
| 1.7 | Trigger de validação contra disponibilidade e bloqueio | RF-47 |
| 1.8 | `capacidade_recurso()` com vigência | RN-02, RN-10 |
| 1.9 | `ocupacao_recurso()` — agendada e efetiva | RN-03 |
| 1.10 | RPC transacional `criar_agendamento()` | SPEC §6.1 |
| 1.11 | **Teste de concorrência: N transações paralelas no mesmo recurso** | **CA-13** |
| 1.12 | Testes de CA-01 a CA-03, CA-08, CA-09, CA-14, CA-15 | PRD §10 |
| 1.13 | `seed.sql` com o Anexo A: 8 salas, 9 procedimentos, equipamentos | PRD Anexo A |

**Critério de saída:** a suíte prova que duas transações concorrentes disputando o mesmo Ultraformer resultam em exatamente uma reserva, e que cadastrar um aparelho hoje não altera a ocupação do mês passado.

> Este marco não produz nada visível. É deliberado: se algo aqui estiver errado, ainda não há tela construída em cima para refazer.

---

## M2 — Painel de configuração
**Entrega:** o administrador monta a clínica inteira pela tela.

| # | Tarefa | Referência |
|---|---|---|
| 2.1 | CRUD de salas, com dedicada/flexível e vigência | RF-20, RF-20a/b |
| 2.2 | CRUD de equipamentos, múltiplas unidades por modelo, fixo/móvel | RF-21, RF-21a/22 |
| 2.3 | CRUD de profissionais + habilitação por procedimento | RF-23, RF-23a |
| 2.4 | Duplicar recurso, copiando atributos e disponibilidade | RF-19b |
| 2.5 | Editor de disponibilidade semanal, múltiplas faixas por dia | RF-24 |
| 2.6 | Bloqueios, com alerta de agendamentos futuros afetados | RF-25, RF-27 |
| 2.7 | Catálogo de procedimentos + tabela de custos com margem em tempo real | RF-30 a RF-32, RF-35 |
| 2.8 | CRUD de usuários e perfis | RF-03, RF-04 |
| 2.9 | Auditoria de escrita | RF-06, RNF-10 |

**Critério de saída:** CA-16, CA-17 e CA-18 passam. A clínica é reconfigurável de 8 para 20 salas sem tocar em código.

---

## M3 — Pacientes e vendas

| # | Tarefa | Referência |
|---|---|---|
| 3.1 | CRUD de pacientes, CPF validado, busca, consentimento LGPD | RF-10 a RF-15 |
| 3.2 | Venda de pacote e de sessão avulsa | RF-60, RF-61 |
| 3.3 | Saldo `sessão 3 de 10`, bloqueio sem saldo | RF-62, RF-63 |
| 3.4 | Ficha do paciente: histórico, pacotes, situação financeira | RF-13 |
| 3.5 | Cancelamento de pacote com saldo | RF-65 |

**Critério de saída:** CA-04 e CA-12 passam.

---

## M4 — Agenda *(o marco de maior valor percebido)*

| # | Tarefa | Referência |
|---|---|---|
| 4.1 | **Timeline por recurso** — colunas de recursos, linhas de horário | RF-41 |
| 4.2 | Visões dia, semana e mês, com filtros | RF-40 |
| 4.3 | Criar agendamento: multi-equipamento e multi-profissional | RF-42, RF-44 |
| 4.4 | Pré-seleção por `procedimento_requisito`; sala travada em equipamento fixo | RF-44, RF-45 |
| 4.5 | **Mensagem de conflito legível** a partir do `23P01` | RF-46, SPEC §6.2 |
| 4.6 | Busca de horário livre com todos os recursos simultaneamente disponíveis | RF-48 |
| 4.7 | Remarcar por arrastar-e-soltar, revalidando conflito | RF-49 |
| 4.8 | Transições de status; baixa de sessão ao realizar | RF-50 a RF-52 |
| 4.9 | Alerta de carência entre sessões, sem bloquear | RF-53 |

**Critério de saída:** CA-01 a CA-08 passam pela interface. **A clínica já pode operar a agenda inteira aqui — fim da Fase 1 do PRD.**

---

## M5 — Painel de ocupação

| # | Tarefa | Referência |
|---|---|---|
| 5.1 | Cartões: ocupação média, horas ociosas, no-show, receita/hora | RF-76 |
| 5.2 | Ocupação agendada × efetiva, por sala, equipamento e profissional | RF-70, RF-71 |
| 5.3 | Filtros de período na URL | RF-72 |
| 5.4 | Mapa de calor dia × faixa horária | RF-73 |
| 5.5 | Ranking de recursos e série temporal comparativa | RF-74, RF-75 |
| 5.6 | Drill-down de todo número até a lista de agendamentos | RF-77 |
| 5.7 | **Alerta de gargalo** — modelo com múltiplos procedimentos acima do limiar | RF-78 |
| 5.8 | Relatórios de ocupação, exportáveis | RF-90 a RF-93, RF-102 |

**Critério de saída:** RNF-04 verificado — painel de um mês carrega em menos de 2 s com dados reais.

---

## M6 — Financeiro

| # | Tarefa | Referência |
|---|---|---|
| 6.1 | Contas a receber e parcelamento na venda | RF-80 |
| 6.2 | Registro de recebimento, inclusive parcial; marcação de atraso | RF-81, RF-82 |
| 6.3 | Comissão ao realizar, com rateio entre profissionais | RF-83, RF-84, RN-05 |
| 6.4 | Fechamento e pagamento por competência | RF-85 |
| 6.5 | Margem por sessão e por procedimento | RN-04, RF-96 |
| 6.6 | Relatórios financeiros | RF-94 a RF-98 |
| 6.7 | **Cruzados: receita por hora disponível e retorno por equipamento** | RF-100, RF-101, RN-08 |
| 6.8 | Verificação do bloqueio de acesso da recepção | RF-88, CA-10 |

**Critério de saída:** CA-06, CA-07, CA-10 e CA-11 passam. O Anexo B do PRD deixa de ser estimativa e passa a ser número apurado.

---

## M7 — Resultado consolidado

| # | Tarefa | Referência |
|---|---|---|
| 7.1 | Lançamento de despesas fixas com recorrência | RF-86 |
| 7.2 | Rateio e custo/hora de estrutura | RF-87, RN-07 |
| 7.3 | DRE simplificado | RF-99 |
| 7.4 | Exportações CSV e XLSX em todos os relatórios | RF-102 |

> Marco isolado de propósito, conforme a ressalva do PRD §9: extrapola a "gestão financeira mínima" e pode ser adiado sem afetar M0–M6.

---

## M8 — Endurecimento e go-live

| # | Tarefa | Referência |
|---|---|---|
| 8.1 | Auditoria de RLS: nenhuma tabela sem `rowsecurity` | SPEC §7.5 |
| 8.2 | Revisão de índices e plano das queries do painel | RNF-04 |
| 8.3 | E2E Playwright dos fluxos críticos | SPEC §8 |
| 8.4 | PITR e retenção de 30 dias | RNF-07 |
| 8.5 | Repetir o teste de concorrência **contra produção** | CA-13 |
| 8.6 | Carga real: salas, aparelhos, profissionais, catálogo, custos | Anexo A |
| 8.7 | Treinamento da recepção e período de operação em paralelo | — |

---

## Ordem de dependência

```
M0 ──► M1 ──┬──► M2 ──┬──► M4 ──┬──► M5 ──► M8
            │         │         │
            └──► M3 ──┘         └──► M6 ──► M7
```

M2 e M3 podem correr em paralelo depois do M1. M5 e M6 podem correr em paralelo depois do M4.

---

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| `EXCLUDE` com enum exigir ajuste no `btree_gist` | Alto — é a base de tudo | Validado no M1.5, antes de qualquer tela. Alternativa pronta: `recurso_tipo` como `text` |
| Multirange (`range_agg`, subtração) indisponível na versão do Postgres | Médio | Exige PG 14+. Confirmar na criação do projeto Supabase (M0.4) |
| Preview escrevendo em produção | **Crítico** | Projeto Supabase separado desde o M0, verificado com PR de teste |
| Painel acima de 2 s | Médio | Medir no M5 com volume real; se necessário, tabela de agregação diária |
| Falta do tempo de preparo (A-09) | Médio | `buffer_min` já existe; só depende do dado da clínica |
| Custos não preenchidos | Alto para M6 | Sem eles a margem não existe. Levantar durante o M2 |

---

## O que preciso de você

| # | Item | Quando |
|---|---|---|
| 1 | Acesso ao Supabase (ou autorização para criar os projetos) | M0 |
| 2 | Confirmação do nome `bodyprime-ocupacao` no time LINKEED | M0 |
| 3 | Repositório GitHub — criar novo ou indicar existente | M0 |
| 4 | Horário de funcionamento de cada sala, aparelho e profissional | M2 |
| 5 | **Tempo de preparo/limpeza entre pacientes** (A-09) | M2 |
| 6 | **Custo de insumo por sessão dos 9 procedimentos** e custo/hora dos aparelhos | M2 |
| 7 | Preço e nº de sessões do Melasma (A-06) | M2 |
| 8 | Quantas unidades de Fotona (A-08) | M2 |
| 9 | Regra de comissão por profissional | M6 |

Itens 1 a 3 bloqueiam o M0. Os demais são dados de cadastro e podem ser preenchidos enquanto o desenvolvimento avança.
