# PRD — Painel de Gestão de Ocupação e Agenda
### Body Prime · Clínica de Procedimentos Estéticos

| | |
|---|---|
| **Versão** | 1.3 — parque 100% configurável pelo painel, com vigência de recursos |
| **Data** | 30/09/2026 |
| **Status** | Aprovado para desenvolvimento |
| **Origem** | Workshop de descoberta (3 rodadas de decisão) |
| **Stack definida** | Next.js (App Router) + TypeScript + Supabase (Postgres + Auth) + Tailwind |

---

## 1. Contexto e Problema

A Body Prime opera procedimentos estéticos que consomem, simultaneamente, três recursos escassos: **salas de atendimento**, **equipamentos** e **profissionais**. Hoje não existe visibilidade sobre quanto desses recursos está efetivamente sendo usado, nem sobre quanto cada sessão realmente dá de resultado depois de descontar insumos, comissão e estrutura.

Isso produz três perdas concretas:

1. **Ociosidade invisível** — aparelhos caros parados em horários que ninguém enxerga como vagos.
2. **Conflito de recursos** — dois agendamentos marcados para o mesmo aparelho ou a mesma sala, descobertos só no dia.
3. **Margem desconhecida** — não se sabe quais procedimentos pagam a estrutura e quais são vendidos no prejuízo.

## 2. Objetivo do Produto

Entregar um sistema web onde a operação da clínica agenda sessões sem conflito de recursos, e a gestão enxerga, em um único painel, **quanto da capacidade instalada está sendo usada** e **quanto de resultado cada hora de operação gera**.

### 2.1 Métricas de sucesso

| Métrica | Alvo |
|---|---|
| Taxa de ocupação média de equipamentos | Visível diariamente; meta de elevação definida pela gestão após 1º mês de baseline |
| Conflitos de agenda (duplo booking) | Zero — impedidos pelo sistema |
| Tempo para agendar uma sessão | < 60 segundos |
| Procedimentos com margem calculada | 100% do catálogo |
| Fechamento financeiro mensal | Gerado pelo sistema, sem planilha paralela |

## 3. Escopo

### 3.1 Dentro do escopo (MVP + fases)

- Autenticação com login e senha, com perfis de acesso
- Cadastro básico de pacientes
- Cadastro de recursos: salas, equipamentos e profissionais, cada um com agenda própria de disponibilidade e bloqueios
- Catálogo de procedimentos com tabela de custos, valor de cobrança, quantidade de sessões e duração
- Venda de pacotes de sessões e sessões avulsas
- Agenda com reserva simultânea de sala + N equipamentos + N profissionais, com bloqueio de conflito
- Painel de taxa de ocupação
- Gestão financeira: margem por sessão, recebimentos e parcelas, comissão de profissional, despesas fixas e rateio
- Relatórios de ocupação e financeiros

### 3.2 Fora do escopo (v1)

- Prontuário clínico, anamnese, fotos antes/depois e termos de consentimento de procedimento
- Emissão de nota fiscal e integração com contabilidade
- Integração com gateway de pagamento / maquininha
- App mobile nativo (a interface web será responsiva)
- Agendamento self-service pelo paciente
- Múltiplas unidades (decidido: **uma unidade**; modelo de dados não terá `unidade_id`)
- CRM, campanhas de marketing e automação de WhatsApp

> **Nota de arquitetura:** a decisão por unidade única é do MVP. Para não inviabilizar expansão futura, todas as tabelas de recurso e movimento nascerão com `created_at`/`updated_at` e chaves próprias, permitindo adicionar `unidade_id` em migração posterior sem reescrita do domínio.

---

## 4. Personas e Perfis de Acesso

| Perfil | Quem é | O que faz |
|---|---|---|
| **Administrador** | Sócio / gestor | Acesso total. Cadastra usuários, procedimentos e custos, vê todos os relatórios financeiros e de ocupação. |
| **Recepção** | Atendente | Cadastra pacientes, vende pacotes, agenda, registra recebimentos e marca presença/falta. **Não** vê custos, margens, comissões e DRE. |
| **Profissional** | Esteticista / operador | Vê a própria agenda, marca sessão como realizada, consulta o próprio extrato de comissão. **Não** vê agenda de terceiros nem dados financeiros da clínica. |

> **Premissa a validar:** os três perfis acima foram propostos, não decididos em workshop. Se a Body Prime operar com um único login compartilhado hoje, a granularidade pode ser reduzida na implementação sem impacto no modelo de dados.

Um **profissional** pode existir no sistema **sem** ter usuário de login (ex: operador que só aparece na agenda de terceiros). O vínculo `profissional.usuario_id` é opcional.

---

## 5. Modelo de Domínio

### 5.1 Conceito central: Recurso

Sala, equipamento e profissional são tratados de forma uniforme como **Recurso**. Todo recurso tem:

- uma **agenda de disponibilidade** (regras semanais recorrentes);
- **bloqueios** (exceções pontuais: manutenção, férias, folga);
- **reservas** (geradas pelos agendamentos).

Isso é o que permite calcular taxa de ocupação e detectar conflito com a mesma lógica para os três tipos.

**Decisão de workshop:** a capacidade é definida pela **agenda individual de cada recurso**, não por um horário global da clínica. Um aparelho disponível só de terça a quinta não é penalizado como ocioso nos demais dias.

### 5.2 Entidades

#### Acesso
| Entidade | Campos principais |
|---|---|
| `usuario` | id, nome, email (único), senha_hash, perfil (`admin`\|`recepcao`\|`profissional`), ativo, ultimo_acesso |
| `auditoria` | id, usuario_id, entidade, entidade_id, acao (`criar`\|`editar`\|`excluir`), dados_anteriores (jsonb), criado_em |

#### Recursos
| Entidade | Campos principais |
|---|---|
| `sala` | id, numero, nome, descricao, **tipo_alocacao** (`dedicada`\|`flexivel`), **procedimento_fixo_id** (obrigatório se `dedicada`), **vigencia_inicio**, **vigencia_fim**, ativo |
| `equipamento` | id, nome, **modelo**, numero_serie, **tipo_alocacao** (`fixo`\|`movel`), sala_id (obrigatório se `fixo`, nulo se `movel`), custo_aquisicao, **custo_hora**, **vigencia_inicio** (aquisição), **vigencia_fim** (baixa), ativo |
| `profissional` | id, usuario_id (opcional), nome, cpf, especialidade, cor_agenda, **comissao_tipo** (`percentual`\|`valor_fixo`\|`nenhuma`), **comissao_valor**, **custo_hora**, **vigencia_inicio** (admissão), **vigencia_fim** (desligamento), ativo |
| `recurso_disponibilidade` | id, recurso_tipo (`sala`\|`equipamento`\|`profissional`), recurso_id, dia_semana (0–6), hora_inicio, hora_fim |
| `recurso_bloqueio` | id, recurso_tipo, recurso_id, inicio (timestamp), fim (timestamp), motivo (`manutencao`\|`ferias`\|`folga`\|`outro`), observacao |

> **Equipamentos mistos:** decisão de workshop. `tipo_alocacao = fixo` faz o sistema selecionar a sala automaticamente ao escolher o equipamento; `movel` permite combinar livremente equipamento e sala.

> **Salas mistas:** decisão de workshop. Salas com aparelho pesado são **dedicadas** a um procedimento (escolher o procedimento já define a sala e o equipamento, sem escolha manual); as demais são **flexíveis** e recebem qualquer procedimento compatível conforme a demanda do dia. O mapa de salas do Anexo A é o estado inicial do cadastro.

#### Paciente
| Entidade | Campos principais |
|---|---|
| `paciente` | id, nome, cpf, data_nascimento, telefone, email, endereco, observacoes, **consentimento_lgpd** (bool + data), ativo, criado_em |

Cadastro deliberadamente **básico**: identificação, contato e observações livres. Sem dados de saúde — o que mantém o sistema fora do regime de dado sensível da LGPD nesta versão.

#### Catálogo e custos
| Entidade | Campos principais |
|---|---|
| `procedimento` | id, nome, descricao, **duracao_min**, **sessoes_padrao**, **valor_sessao**, intervalo_min_dias (carência entre sessões), ativo |
| `procedimento_custo` | id, procedimento_id, tipo (`insumo`\|`mao_de_obra`\|`equipamento`\|`outro`), descricao, valor_unitario, quantidade |
| `procedimento_requisito` | id, procedimento_id, recurso_tipo, recurso_id (recurso específico) **ou** categoria, quantidade, obrigatorio (bool) |

`procedimento_requisito` é o que faz a agenda saber, ao escolher "Criolipólise", quais aparelhos e quantos profissionais aquele procedimento exige.

#### Venda e execução
| Entidade | Campos principais |
|---|---|
| `pacote` | id, paciente_id, procedimento_id, quantidade_sessoes, valor_total, desconto, status (`ativo`\|`concluido`\|`cancelado`\|`expirado`), data_venda, validade, vendido_por |
| `agendamento` | id, paciente_id, procedimento_id, pacote_id (nulo = avulso), sala_id, inicio, fim, **status**, numero_sessao, observacoes, criado_por |
| `agendamento_equipamento` | agendamento_id, equipamento_id *(N:N)* |
| `agendamento_profissional` | agendamento_id, profissional_id, papel *(N:N)* |

**Decisão de workshop:** um agendamento reserva **1 sala + N equipamentos + N profissionais**. Cada recurso da lista é validado contra conflito individualmente.

**Status do agendamento:** `agendado` → `confirmado` → `em_atendimento` → `realizado` | `falta` | `cancelado`

#### Financeiro
| Entidade | Campos principais |
|---|---|
| `lancamento` | id, tipo (`receita`\|`despesa`), origem_tipo (`pacote`\|`agendamento`\|`despesa_fixa`), origem_id, categoria, valor, vencimento, data_pagamento, forma_pagamento, status (`pendente`\|`pago`\|`atrasado`\|`cancelado`), parcela_num, parcela_total |
| `comissao` | id, agendamento_id, profissional_id, base_calculo, percentual, valor, status (`prevista`\|`apurada`\|`paga`), competencia (AAAA-MM) |
| `despesa_fixa` | id, descricao, categoria, valor, competencia (AAAA-MM), recorrente (bool) |

---

## 6. Requisitos Funcionais

### 6.1 Autenticação e Usuários

| ID | Requisito |
|---|---|
| RF-01 | O sistema deve autenticar usuários por e-mail e senha. |
| RF-02 | Senhas devem ser armazenadas com hash (bcrypt/argon2 via Supabase Auth), nunca em texto claro. |
| RF-03 | O administrador deve cadastrar, editar, desativar e redefinir senha de usuários. |
| RF-04 | Cada usuário tem exatamente um perfil, que determina o que ele vê e pode fazer. |
| RF-05 | A sessão deve expirar por inatividade (padrão: 8 horas) e oferecer logout explícito. |
| RF-06 | Toda criação, edição e exclusão de registro deve gravar autor e timestamp em `auditoria`. |

### 6.2 Cadastro de Pacientes

| ID | Requisito |
|---|---|
| RF-10 | Cadastrar paciente com nome, CPF, nascimento, telefone, e-mail, endereço e observações. |
| RF-11 | CPF deve ser validado (dígito verificador) e ser único; o sistema alerta sobre duplicidade por nome+nascimento. |
| RF-12 | Busca de paciente por nome, CPF ou telefone, com resultado em até 1 segundo. |
| RF-13 | A ficha do paciente exibe histórico de agendamentos, pacotes ativos com saldo de sessões e situação financeira. |
| RF-14 | Registrar o aceite de consentimento LGPD com data. |
| RF-15 | Paciente é **inativado**, nunca excluído fisicamente, preservando o histórico financeiro. |

### 6.3 Painel de Configuração — Cadastro de Recursos

> **Princípio do produto:** a Body Prime muda de parque com frequência — compra aparelho, abre sala, contrata e desliga profissional. Toda essa configuração é **operação de painel feita pelo administrador**, jamais alteração de código ou banco. O sistema não conhece nenhum número fixo: opera com 8 salas ou 30, com 1 Fotona ou 5, com 2 profissionais ou 40.

| ID | Requisito |
|---|---|
| RF-19 | O painel de configuração deve permitir ao administrador **criar, editar, ativar e inativar** salas, equipamentos, profissionais e procedimentos, **sem limite de quantidade e sem qualquer intervenção técnica**. |
| RF-19a | Não pode haver quantidade máxima de recursos fixada no código. Interface, agenda, painel e relatórios devem funcionar corretamente com qualquer número de salas, equipamentos e profissionais. |
| RF-19b | Permitir **duplicar** um recurso existente, copiando atributos e agenda de disponibilidade — cadastrar o 5º Ultraformer não deve exigir refazer tudo do zero. |
| RF-19c | Registrar a **vigência** de cada recurso: data de entrada em operação e, quando houver, data de saída (baixa do aparelho, fechamento da sala, desligamento do profissional). |
| RF-19d | Alterar o parque **nunca reescreve o histórico**: a capacidade de um período passado é calculada apenas com os recursos vigentes naquele período (RN-10). |
| RF-20 | Cadastrar salas com número, nome e descrição. |
| RF-20a | Marcar sala como `dedicada` (vinculada a um procedimento fixo) ou `flexivel`. |
| RF-20b | Em sala `dedicada`, selecionar o procedimento na agenda preenche sala e equipamento automaticamente, sem escolha manual. |
| RF-21 | Cadastrar equipamentos com nome, modelo, nº de série, custo de aquisição e **custo/hora**. |
| RF-21a | Cadastrar **múltiplas unidades do mesmo modelo** (ex: 4 Ultraformer), cada uma com identificação própria, agenda e bloqueios independentes. |
| RF-21b | A validação de conflito e o cálculo de capacidade devem derivar **integralmente do cadastro**. Nenhuma quantidade de aparelho, sala, profissional ou procedimento pode estar fixada no código. |
| RF-21c | Relatórios devem permitir agregação por **modelo** de equipamento (ex: ocupação consolidada dos 4 Ultraformer) além da visão por unidade. |
| RF-22 | Marcar equipamento como `fixo` (vinculado a uma sala) ou `movel`. |
| RF-23 | Cadastrar profissionais com especialidade, cor na agenda, regra de comissão e custo/hora, **em qualquer quantidade**. |
| RF-23a | Definir quais procedimentos cada profissional está habilitado a executar; a agenda só oferece profissionais habilitados para o procedimento escolhido. |
| RF-24 | Definir, para cada recurso, a disponibilidade semanal (dia da semana + faixa horária), com múltiplas faixas por dia. |
| RF-25 | Registrar bloqueios pontuais por recurso (manutenção, férias, folga), com data/hora de início e fim e motivo. |
| RF-26 | Bloqueio impede novos agendamentos no período e **reduz a capacidade** no cálculo de ocupação. |
| RF-27 | Ao inativar um recurso, o sistema alerta sobre agendamentos futuros que o utilizam. |

### 6.4 Catálogo de Procedimentos e Tabela de Custos

| ID | Requisito |
|---|---|
| RF-30 | Cadastrar procedimento com nome, **duração em minutos**, **quantidade de sessões padrão**, **valor de cobrança por sessão** e carência mínima entre sessões. |
| RF-31 | Cadastrar, por procedimento, N linhas de custo (insumo, mão de obra, equipamento, outro) com valor unitário e quantidade. |
| RF-32 | O sistema calcula e exibe, em tempo real na tela de cadastro, o **custo direto por sessão**, a **margem de contribuição** e o **percentual de margem**. |
| RF-33 | Definir quais recursos o procedimento exige (`procedimento_requisito`), com quantidade e obrigatoriedade. |
| RF-34 | Alterações de valor e custo **não** alteram retroativamente pacotes já vendidos nem agendamentos já realizados. |
| RF-35 | O catálogo exibe ranking de procedimentos por margem e por margem por hora. |

### 6.5 Agenda

| ID | Requisito |
|---|---|
| RF-40 | Exibir agenda em visão **dia**, **semana** e **mês**, com filtro por sala, equipamento e profissional. |
| RF-41 | Oferecer visão em **linha do tempo por recurso** (colunas = recursos, linhas = horários), que é a visão operacional principal. |
| RF-42 | Ao criar um agendamento, selecionar paciente, procedimento, data/hora, sala, **um ou mais equipamentos** e **um ou mais profissionais**. |
| RF-43 | A duração do agendamento é preenchida automaticamente pela duração do procedimento, permitindo ajuste manual. |
| RF-44 | Os recursos exigidos pelo procedimento são pré-selecionados conforme `procedimento_requisito`. |
| RF-45 | Se o equipamento escolhido for `fixo`, a sala é definida automaticamente e travada. |
| RF-46 | O sistema **impede salvar** agendamento com qualquer recurso em conflito (RN-01), indicando qual recurso e qual agendamento conflitante. |
| RF-47 | O sistema **impede salvar** agendamento fora da janela de disponibilidade ou sobre bloqueio de qualquer recurso envolvido. |
| RF-48 | Oferecer busca de horário livre: dado um procedimento e uma janela de datas, listar os horários em que **todos** os recursos exigidos estão simultaneamente livres. |
| RF-49 | Permitir remarcar por arrastar-e-soltar, revalidando todos os conflitos. |
| RF-50 | Alterar status do agendamento: confirmar, iniciar, concluir (`realizado`), marcar `falta` ou `cancelar` com motivo. |
| RF-51 | Ao marcar `realizado`, o sistema baixa a sessão do pacote e gera o registro de comissão. |
| RF-52 | Ao marcar `falta`, o sistema registra a ocorrência e aplica a política de consumo de sessão (RN-06). |
| RF-53 | Exibir alerta visual quando a carência mínima entre sessões do procedimento não for respeitada — sem bloquear. |

### 6.6 Pacotes e Sessões

| ID | Requisito |
|---|---|
| RF-60 | Vender pacote a um paciente: procedimento, quantidade de sessões, valor total, desconto e validade. |
| RF-61 | Vender sessão **avulsa**, sem pacote, com valor próprio. |
| RF-62 | Exibir saldo do pacote no formato `sessão 3 de 10`, com sessões consumidas, agendadas e restantes. |
| RF-63 | Impedir agendar sessão de pacote sem saldo disponível ou com pacote vencido/cancelado. |
| RF-64 | Concluir o pacote automaticamente quando a última sessão for marcada como realizada. |
| RF-65 | Cancelar pacote com saldo, registrando o valor a estornar ou creditar. |
| RF-66 | Listar pacotes ativos com sessões pendentes de execução (passivo de entrega — ver RF-95). |

### 6.7 Painel de Ocupação

| ID | Requisito |
|---|---|
| RF-70 | Painel inicial com taxa de ocupação consolidada do período, segmentada por **salas**, **equipamentos** e **profissionais**. |
| RF-71 | Exibir simultaneamente **ocupação agendada** e **ocupação efetiva** (RN-03). |
| RF-72 | Filtro de período: hoje, semana, mês, intervalo personalizado. |
| RF-73 | Mapa de calor dia × faixa horária, revelando os vales de ociosidade. |
| RF-74 | Ranking de recursos por taxa de ocupação, do mais ao menos utilizado. |
| RF-75 | Série temporal da ocupação, permitindo comparar com o período anterior. |
| RF-76 | Cartões de destaque: ocupação média, horas ociosas no período, taxa de no-show e receita por hora disponível. |
| RF-77 | Todo número do painel deve ser clicável até a lista de agendamentos que o compõe. |
| RF-78 | **Alerta de gargalo:** quando um modelo de equipamento atender mais de um procedimento e suas unidades cadastradas atingirem ocupação acima do limiar configurado, o painel destaca o recurso como gargalo e informa quantos agendamentos foram recusados por indisponibilidade dele. |

### 6.8 Financeiro

| ID | Requisito |
|---|---|
| RF-80 | Gerar contas a receber ao vender um pacote, à vista ou parcelado em N parcelas com vencimentos. |
| RF-81 | Registrar recebimento com data, valor e forma de pagamento; suportar pagamento parcial. |
| RF-82 | Marcar automaticamente como `atrasado` todo lançamento pendente após o vencimento. |
| RF-83 | Calcular a comissão do profissional ao marcar a sessão como realizada (RN-04). |
| RF-84 | Ratear a comissão entre os profissionais quando o agendamento tiver mais de um (RN-05). |
| RF-85 | Fechar comissões por competência mensal e registrar o pagamento. |
| RF-86 | Lançar despesas fixas por competência, com opção de recorrência mensal. |
| RF-87 | Ratear despesas fixas por hora de capacidade para obter o custo de estrutura por sessão (RN-07). |
| RF-88 | Recepção não acessa custos, margens, comissões nem despesas. |

### 6.9 Relatórios

**Ocupação**

| ID | Relatório |
|---|---|
| RF-90 | Taxa de ocupação por recurso e por período, com capacidade, horas ocupadas e ociosidade em horas e em %. |
| RF-91 | Horários vagos: janelas livres por recurso, ordenadas por tamanho — insumo direto para ação comercial. |
| RF-92 | No-show e cancelamentos: volume, taxa e ranking de pacientes faltantes. |
| RF-93 | Produtividade por profissional: sessões realizadas, horas trabalhadas e taxa de ocupação da agenda. |

**Financeiro**

| ID | Relatório |
|---|---|
| RF-94 | Receita realizada x prevista no período, por procedimento e por forma de pagamento. |
| RF-95 | **Passivo de entrega**: sessões vendidas e não executadas, em quantidade e em valor. |
| RF-96 | Rentabilidade por procedimento: receita, custo direto, comissão, margem de contribuição e margem por hora. |
| RF-97 | Contas a receber e inadimplência por paciente, com aging (a vencer, 1–30, 31–60, 60+ dias). |
| RF-98 | Comissões por profissional e competência, com detalhamento por sessão. |
| RF-99 | DRE simplificado: receita − custos diretos − comissões − despesas fixas = resultado. |

**Cruzado (ocupação × financeiro)**

| ID | Relatório |
|---|---|
| RF-100 | **Receita por hora disponível** por sala e por equipamento — mede quanto cada hora de capacidade instalada gera, e não apenas se ela foi preenchida. |
| RF-101 | Retorno do equipamento: receita e margem gerada por aparelho no período, confrontada com seu custo de aquisição. |
| RF-102 | Todo relatório deve exportar para CSV e XLSX. |

---

## 7. Regras de Negócio

### RN-01 — Conflito de recurso
Um recurso está em conflito se existir outro agendamento, com status diferente de `cancelado`, que use o **mesmo recurso** e cujo intervalo `[inicio, fim)` se sobreponha ao novo. A validação roda para a sala e para **cada** equipamento e **cada** profissional da lista. Basta um recurso em conflito para bloquear o salvamento.

Intervalos são tratados como **semiabertos**: um atendimento que termina às 10:00 não conflita com outro que começa às 10:00.

### RN-02 — Capacidade de um recurso
```
capacidade(recurso, período) =
    Σ (janelas de recurso_disponibilidade ∩ período ∩ vigência do recurso)
  − Σ (bloqueios do recurso ∩ período ∩ janelas de disponibilidade)
```
Bloqueio fora da janela de disponibilidade não subtrai nada (não se pode perder capacidade que não existia).

### RN-10 — Vigência do recurso e integridade do histórico
Um recurso só contribui para a capacidade **dentro da sua janela de vigência** (`vigencia_inicio` a `vigencia_fim`). Fora dela, sua capacidade é zero.

Essa regra existe para impedir um erro silencioso e grave: **cadastrar um novo aparelho não pode piorar a ocupação do mês passado.** Sem vigência, adicionar o 5º Ultraformer hoje aumentaria retroativamente a capacidade de todos os meses anteriores, derrubando os índices históricos e invalidando qualquer comparação de período. O mesmo vale ao contrário — dar baixa num aparelho não pode inflar a ocupação passada.

Consequência prática: o sistema deve recalcular indicadores sempre a partir da vigência, nunca a partir do estado atual do cadastro.

### RN-03 — Taxa de ocupação
```
horas_agendadas  = Σ duração dos agendamentos em {agendado, confirmado, em_atendimento, realizado, falta}
horas_realizadas = Σ duração dos agendamentos em {realizado}

ocupação_agendada = horas_agendadas  / capacidade
ocupação_efetiva  = horas_realizadas / capacidade
ociosidade        = 1 − ocupação_efetiva
```
A distinção é deliberada: a diferença entre as duas taxas **é** o custo do no-show, e precisa ficar visível. Agendamentos `cancelados` não contam em nenhuma das duas — a capacidade voltou a ficar disponível.

### RN-04 — Margem por sessão
```
receita_sessão  = pacote ? (valor_total − desconto) / quantidade_sessoes : valor_avulso
custo_direto    = Σ procedimento_custo
                + (equipamento.custo_hora × duração_h)      ▸ somado para cada equipamento do agendamento
                + (profissional.custo_hora × duração_h)     ▸ somado para cada profissional do agendamento
comissão        = ver RN-05
margem_contrib  = receita_sessão − custo_direto − comissão
margem_%        = margem_contrib / receita_sessão
margem_por_hora = margem_contrib / duração_h
```
`margem_por_hora` é o indicador correto para comparar procedimentos de durações diferentes: um procedimento de margem menor que ocupa metade do tempo pode ser mais rentável por hora de sala.

### RN-05 — Comissão
Gerada no momento em que o agendamento passa a `realizado`.

- `comissao_tipo = percentual` → `valor = receita_sessão × comissao_valor / 100`
- `comissao_tipo = valor_fixo` → `valor = comissao_valor`
- `comissao_tipo = nenhuma` → sem lançamento

Com **mais de um profissional** no agendamento, a comissão é calculada individualmente pela regra de cada um sobre a **base rateada** `receita_sessão / nº de profissionais`. Cancelar ou reverter o `realizado` cancela as comissões ainda não pagas; comissão já `paga` exige estorno manual e fica registrada na auditoria.

### RN-06 — Falta (no-show)
Falta **consome** a sessão do pacote (é o comportamento padrão de mercado e o incentivo correto ao paciente), mas **não** gera comissão. O administrador pode reverter o consumo caso a caso — ação registrada em auditoria. Para efeito de ocupação, a falta conta em `horas_agendadas` e não em `horas_realizadas`, que é justamente o que torna o prejuízo mensurável.

### RN-07 — Rateio de despesas fixas
```
custo_hora_estrutura = Σ despesas_fixas(mês) / Σ capacidade de todas as SALAS no mês
resultado_sessão     = margem_contrib − (custo_hora_estrutura × duração_h)
```
O denominador usa capacidade de **salas**, não de equipamentos nem de profissionais, para evitar dupla contagem da mesma hora física. Em meses sem despesa lançada, o custo de estrutura é zero e o sistema sinaliza a ausência do lançamento no relatório.

### RN-08 — Receita por hora disponível
```
receita_por_hora_disponível = receita_realizada(recurso, período) / capacidade(recurso, período)
```
Difere da taxa de ocupação por responder à pergunta financeira, e não à operacional: uma sala 90% ocupada com procedimentos baratos pode render menos que uma sala 60% ocupada com procedimentos caros.

### RN-09 — Imutabilidade de preços
Pacote vendido congela `valor_total`, e agendamento realizado congela o custo apurado no momento da realização. Reajustar a tabela nunca reescreve o histórico — caso contrário, todo relatório retroativo mudaria a cada mudança de preço.

---

## 8. Requisitos Não Funcionais

| ID | Requisito |
|---|---|
| RNF-01 | Aplicação web responsiva, funcional em desktop e tablet (uso de recepção). |
| RNF-02 | Stack: Next.js (App Router) + TypeScript + Tailwind; Supabase para Postgres e Auth; deploy na Vercel. |
| RNF-03 | Autorização por perfil aplicada **no servidor** (Row Level Security no Postgres), nunca apenas na interface. |
| RNF-04 | Carregamento do painel de ocupação em até 2 segundos para um período de 1 mês. |
| RNF-05 | Validação de conflito executada em **transação** no banco, com constraint de exclusão, impedindo duplo booking em requisições concorrentes. |
| RNF-06 | Interface integralmente em português do Brasil; valores em BRL; datas em DD/MM/AAAA; fuso `America/Sao_Paulo`. |
| RNF-07 | Backup diário automático do banco, com retenção mínima de 30 dias. |
| RNF-08 | Conformidade LGPD: consentimento registrado, dados pessoais exportáveis e anonimizáveis a pedido do titular. |
| RNF-09 | Nenhuma exclusão física de paciente, pacote, agendamento ou lançamento — apenas inativação ou cancelamento. |
| RNF-10 | Trilha de auditoria para toda operação de escrita em entidades financeiras e de agenda. |

> **RNF-05 é crítico e frequentemente subestimado:** validar conflito apenas na aplicação deixa passar duplo booking quando duas recepcionistas salvam ao mesmo tempo. A garantia precisa estar no banco, via `EXCLUDE USING gist` sobre o intervalo de tempo por recurso.

---

## 9. Roadmap de Entrega

### Fase 1 — Fundação operacional (MVP)
Autenticação e perfis · Cadastro de pacientes · **Painel de configuração: salas, equipamentos e profissionais em quantidade livre, com duplicação e vigência** · Disponibilidade e bloqueios · Catálogo de procedimentos com custos · Venda de pacotes e avulsos · Agenda com validação de conflito multi-recurso · Busca de horário livre

**Critério de saída:** a clínica consegue operar a agenda inteira no sistema, sem planilha paralela e sem conflito de recursos.

### Fase 2 — Visibilidade de ocupação
Painel de ocupação · Mapa de calor · Ranking e série temporal · Relatórios RF-90 a RF-93

**Critério de saída:** a gestão tem baseline de ocupação e enxerga onde está a ociosidade.

### Fase 3 — Financeiro
Contas a receber e parcelas · Recebimentos · Comissões · Margem por sessão e por procedimento · Relatórios RF-94 a RF-98 e RF-100/101

**Critério de saída:** margem conhecida por procedimento e comissões fechadas pelo sistema.

### Fase 4 — Resultado consolidado
Despesas fixas · Rateio e custo de estrutura · DRE simplificado (RF-99) · Exportações

**Critério de saída:** fechamento mensal completo gerado pelo sistema.

> **Ressalva registrada no workshop:** a Fase 4 foi solicitada junto com o restante do financeiro, mas extrapola o conceito de "gestão financeira mínima" — exige disciplina de lançamento contábil mensal para produzir número confiável. Está especificada por completo e isolada em fase própria justamente para que possa ser adiada ou cortada sem impacto nas anteriores.

---

## 10. Critérios de Aceite (amostra de cenários)

| # | Cenário | Resultado esperado |
|---|---|---|
| CA-01 | Agendar procedimento cujo equipamento já está reservado no horário | Salvamento bloqueado, com indicação do equipamento e do agendamento conflitante |
| CA-02 | Agendar em horário fora da disponibilidade do profissional | Salvamento bloqueado |
| CA-03 | Agendar sobre bloqueio de manutenção do aparelho | Salvamento bloqueado |
| CA-04 | Agendar sessão de pacote sem saldo | Salvamento bloqueado com aviso de saldo esgotado |
| CA-05 | Agendamento com 2 equipamentos e 2 profissionais | Os 4 recursos aparecem ocupados na agenda e na taxa de ocupação |
| CA-06 | Marcar sessão como realizada | Saldo do pacote decrementa e comissão é gerada para cada profissional |
| CA-07 | Marcar falta | Saldo decrementa, comissão **não** é gerada, ocupação efetiva não sobe |
| CA-08 | Cancelar agendamento | Horário volta a ficar disponível e sai das duas taxas de ocupação |
| CA-09 | Bloquear equipamento por 3 dias | Capacidade do mês reduz e a taxa de ocupação sobe proporcionalmente |
| CA-10 | Usuário `recepcao` abre o painel | Indicadores de ocupação visíveis; custos, margens e comissões ocultos |
| CA-11 | Usuário `profissional` abre a agenda | Vê apenas os próprios agendamentos |
| CA-12 | Alterar valor de um procedimento | Pacotes já vendidos mantêm o valor original |
| CA-13 | Duas sessões simultâneas de salvamento no mesmo recurso | Apenas uma persiste; a outra recebe erro de conflito |
| CA-14 | Administrador cadastra o 5º Ultraformer hoje | Ele entra na capacidade a partir de hoje; a taxa de ocupação dos meses anteriores **não se altera** |
| CA-15 | Administrador dá baixa em um aparelho | Capacidade futura reduz; histórico permanece intacto |
| CA-16 | Clínica passa de 8 para 20 salas e de 3 para 15 profissionais | Agenda, painel e relatórios seguem funcionando, sem ajuste de código |
| CA-17 | Duplicar um equipamento existente | Nova unidade criada com os mesmos atributos e a mesma agenda de disponibilidade, com série e identificação próprias |
| CA-18 | Agendar procedimento e abrir a lista de profissionais | Apenas profissionais habilitados para aquele procedimento aparecem |

---

## 11. Decisões Registradas no Workshop

| # | Decisão |
|---|---|
| D-01 | Agendamento reserva sala + equipamento + profissional, todos com checagem de conflito |
| D-02 | Um agendamento pode ter **vários** equipamentos e **vários** profissionais (N:N) |
| D-03 | Equipamentos podem ser fixos por sala ou móveis (modelo misto) |
| D-04 | Capacidade calculada pela **agenda individual de cada recurso**, sem horário global da clínica |
| D-05 | Venda suporta pacote fechado **e** sessão avulsa |
| D-06 | Financeiro inclui margem, recebimentos/parcelas, comissão e despesas fixas com rateio |
| D-07 | Uma única unidade; sem multi-tenant no MVP |
| D-08 | Stack: Next.js + Supabase (Postgres + Auth) |
| D-09 | Salas seguem modelo misto: dedicadas (aparelho pesado) ou flexíveis |
| D-10 | A clínica possui **4 aparelhos Ultraformer** — as salas 2, 3, 7 e 8 operam em paralelo sem conflito de equipamento |
| D-11 | "R$ 799 / 8 sessões" é **pacote fechado**: R$ 799 no total, R$ 99,88 por sessão |
| D-12 | Catálogo inicial: 8 procedimentos mapeados (Anexo A) + Melasma |
| D-13 | **Melasma** usa o **Fotona**, dura **20 min**, roda em **sala flexível** e é vendido como **protocolo de várias sessões** |
| D-14 | **Todo o parque é configurável pelo painel** — quantidade de **salas, equipamentos, profissionais**, procedimentos e custos é cadastro, nunca código, e sem limite de quantidade (RF-19 a RF-19d) |

## 12. Decisões em Aberto

| # | Questão | Proposta padrão | Impacto se mudar |
|---|---|---|---|
| A-01 | Os três perfis (admin/recepção/profissional) refletem a operação real? | Sim, três perfis | Baixo — apenas políticas de acesso |
| A-02 | Falta consome a sessão do pacote? | Sim, com reversão pelo admin | Médio — muda RN-06 e o relatório de no-show |
| A-03 | Profissionais têm `custo_hora` apurado ou apenas comissão? | Ambos, `custo_hora` opcional | Médio — altera o custo direto em RN-04 |
| A-04 | Pacote tem validade obrigatória? | Opcional, alerta ao vencer | Baixo |
| A-05 | Haverá lembrete de agendamento por WhatsApp/e-mail? | Fora do escopo v1 | Alto se entrar — exige integração externa |
| A-06 | **Melasma:** falta definir **preço** e **quantidade de sessões** do protocolo | Cadastrar o procedimento com duração 20 min e Fotona; preço e nº de sessões preenchidos pelo admin antes da primeira venda | Baixo — é preenchimento de cadastro, não mudança de modelo |
| A-08 | **Quantas unidades de Fotona existem?** | Administrador cadastra no painel (RF-21a); o sistema opera corretamente com qualquer quantidade | Nenhum no código. Operacionalmente **alto**: com 1 unidade, Fotona e Melasma disputam o aparelho e ele vira o gargalo da clínica |
| A-09 | Há tempo de preparo/limpeza entre pacientes não contabilizado nas durações do Anexo A? | Durações cadastradas conforme informado, sem buffer | **Alto** — sem buffer a agenda encaixa sessões coladas que a operação não cumpre, e a taxa de ocupação fica superestimada |
| A-07 | O sistema deve modelar **campanhas** (como o October Fast) como entidade própria? | Não no MVP: preço promocional entra via `desconto` do pacote | Médio — sem entidade de campanha não há relatório de "quanto o October Fast rendeu" isoladamente |

---

## Anexo A — Catálogo Inicial (base para o cadastro)

Mapa de salas e procedimentos conforme operação **October Fast** (8 salas a 100% de ocupação).

| Sala | Procedimento | Duração | Preço | Sessões | Equipamento |
|---|---|---|---|---|---|
| 1 | Toxina 50 UI | 15 min | R$ 799 | 1 | — (insumo injetável) |
| 2 | Ultraformer Olhos | 20 min | R$ 799 | 1 | Ultraformer #1 |
| 3 | Ultraformer Papada | 20 min | R$ 799 | 1 | Ultraformer #2 |
| 4 | CM Slim | 30 min | R$ 799 (pacote) | 8 | CM Slim |
| 5 | Onda Coolwaves | 30 min | R$ 799 (pacote) | 8 | Coolwaves |
| 6 | Fotona | 15 min | R$ 999 | 1 | Fotona |
| 7 | Ultraformer 1/3 superior | 40 min | R$ 1.390 | 1 | Ultraformer #3 |
| 8 | Ultraformer 1/3 inferior | 40 min | R$ 1.390 | 1 | Ultraformer #4 |
| flexível | **Melasma** | 20 min | *a definir* | Protocolo, nº *a definir* | **Fotona** |

**Inventário de equipamentos (carga inicial, totalmente editável no painel):** 4 × Ultraformer, 1 × CM Slim, 1 × Onda Coolwaves e **Fotona em quantidade a confirmar** pelo administrador. A Toxina não consome equipamento — ocupa sala e profissional apenas, e seu custo é integralmente de insumo.

> **O Fotona é o único recurso com disputa entre procedimentos.** Ele atende tanto o procedimento *Fotona* (sala 6, 15 min) quanto o *Melasma* (sala flexível, 20 min). Com **1 unidade cadastrada**, os dois nunca rodam simultaneamente e o Fotona se torna o gargalo do parque; com **2 unidades**, a disputa desaparece. O sistema não presume nenhum dos cenários: ele bloqueia conflito com base na quantidade que estiver cadastrada, e o painel sinaliza o gargalo quando ele existir (RF-78).
>
> Como o Melasma roda em **sala flexível**, o Fotona precisa estar cadastrado como equipamento `movel` para circular entre a sala 6 e a sala do melasma.

**Observação sobre a duração:** os tempos acima são de procedimento. Se houver tempo de preparo, limpeza ou intervalo entre pacientes, ele precisa entrar na duração cadastrada ou ser adicionado como *buffer* — caso contrário a agenda encaixa sessões coladas que a operação não consegue cumprir, e a taxa de ocupação fica superestimada.

---

## Anexo B — Leitura Inicial dos Dados

Receita **bruta** por hora de sala, calculada a partir do Anexo A (`preço ÷ duração`, com pacote dividido por sessão):

| Sala | Procedimento | Receita por sessão | Receita / hora |
|---|---|---|---|
| 6 | Fotona | R$ 999,00 | **R$ 3.996** |
| 1 | Toxina 50 UI | R$ 799,00 | R$ 3.196 |
| 2 · 3 | Ultraformer Olhos / Papada | R$ 799,00 | R$ 2.397 |
| 7 · 8 | Ultraformer 1/3 sup. / inf. | R$ 1.390,00 | R$ 2.085 |
| 4 · 5 | CM Slim / Onda Coolwaves | R$ 99,88 | **R$ 200** |

### O que isso demonstra

**1. Taxa de ocupação sozinha esconde o essencial.** No October Fast as 8 salas marcam 100%. As salas 4 e 5 geram cerca de **R$ 200/hora**; a sala 6 gera **R$ 3.996/hora** — quase **20× mais**. No painel de ocupação pura as três são idênticas. É precisamente isso que a **RN-08 (receita por hora disponível)** e o **RF-100** existem para corrigir, e este dado real valida a métrica antes mesmo da primeira linha de código.

**2. Receita não é margem.** O ranking acima é bruto. A Toxina 50 UI carrega custo de insumo relevante por sessão, enquanto Fotona e Ultraformer têm insumo próximo de zero e custo concentrado na amortização do aparelho. O ranking de **margem de contribuição** (RN-04) provavelmente será diferente deste. Nenhuma decisão de portfólio, preço ou campanha deve ser tomada sobre o Anexo B — apenas depois de preencher a tabela de custos (RF-31) para os 9 procedimentos.

**3. O Fotona é o recurso a vigiar.** Ele é o único aparelho que atende dois procedimentos, e é também o de maior receita por hora da casa (R$ 3.996). Se houver apenas uma unidade, **cada Melasma agendado desloca um slot de Fotona** — e a decisão de qual dos dois ocupa o aparelho passa a ser uma escolha econômica, não uma escolha de agenda. O **RF-78 (alerta de gargalo)** existe para que essa escolha seja feita com o número à vista, e não por ordem de chegada na recepção. O preço do Melasma (A-06) é o dado que falta para fechar essa conta.

**4. O pacote de 8 sessões é um passivo de entrega pesado.** Cada venda de CM Slim ou Coolwaves a R$ 799 compromete **4 horas** de sala (8 × 30 min) por um caixa único e antecipado. Em volume, esses pacotes podem consumir a capacidade que os procedimentos de alta receita/hora precisariam. É o cenário que o **RF-95 (passivo de entrega)** foi desenhado para tornar visível.

---

*Documento gerado a partir do workshop de descoberta conduzido em 30/09/2026, com catálogo real incorporado na mesma data. Próximo passo: validação deste PRD e início da Fase 1.*
