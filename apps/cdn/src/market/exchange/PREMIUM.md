# Premium Exchange

## Objetivo

Este módulo automatiza leitura, decisão e execução de troca no Mercado Premium.

O modelo do módulo é:

- taxa é observada por continente (`K`)
- execução é decidida por vila dentro do `K`
- a melhor troca global resulta do cruzamento entre:
  - taxa observada do `K`
  - capacidade real das vilas daquele `K`

## Estado Atual

Hoje já existe base para:

- leitura de `exchange_data`
- cálculo de taxa observada por recurso
- registro diário `min/max/current` por `K`
- configuração de compra/venda
- leitura de produção e trader

Ainda estamos formalizando o contrato do fluxo novo para:

- rodar em paralelo com outros runners
- decidir a melhor troca global
- só pausar outro runner quando houver execução real

## Contrato Geral

### Escopo de configuração

- a configuração é global para o módulo
- o ajuste fino de taxa é por `K`
- futuramente a configuração escolherá um `groupId`
- por enquanto o comportamento padrão considera todas as vilas (`groupId = 0`)

### Modos de operação

- `trade`
- `sprinter`
- `premium`

### Estratégias

- `buy.active`
- `sell.active`
- se uma direção estiver desativada, seus casos devem ser eliminados antes de qualquer probe

## Contrato de Requerimentos

### Objetivo

Precisamos de um resolvedor único de requerimentos para alimentar:

- `view`
- runners do CDN
- possível projeção enxuta para o `SW controller`

Esse resolvedor não deve executar side effects. Ele não:

- dispara `exchange_data`
- pausa runner
- executa troca
- muda configuração

Ele apenas responde, com base no contexto atual, se o módulo pode:

- existir na interface
- observar o universo
- montar lanes
- sondar `Ks`
- escolher candidata
- executar
- pedir preempção ao controller

### Princípios

- a resposta deve ser determinística para a mesma entrada
- a resposta deve aceitar entrada parcial
- a resposta deve explicar bloqueios por código, não só por texto
- a mesma resposta deve servir para `view` e runtime
- o controller deve receber uma projeção reduzida da mesma resposta, não outro contrato inventado

### Camadas de avaliação

O resolvedor deve avaliar em camadas:

1. `config`
2. `account`
3. `world`
4. `runtime`
5. `data sources`
6. `villages / lanes`
7. `candidate / execution`

Cada camada pode bloquear as próximas ou só degradar a decisão final.

### Entrada mínima do resolvedor

O resolvedor deve aceitar, no mínimo:

```ts
type ExchangeRequirementsInput = {
  scopeKey?: string | null
  groupId: number
  config: {
    active: boolean
    marketType: "trade" | "sprinter" | "premium"
    buy: { active: boolean }
    sell: { active: boolean }
  }
  account: {
    premiumActive: boolean
    totalVillages: number
    premiumRequired: boolean
    playerPp: number | null
  }
  world: {
    premiumExchangeByConfig: boolean | null
    merchantExchangeByConfig: boolean | null
    premiumExchangeByProbe: "unknown" | "enabled" | "disabled"
  }
  runtime: {
    captchaActive: boolean
    commandActive: boolean
    criticalSectionActive: boolean
    runnerActive: boolean | null
  }
  sources?: {
    productionReady: boolean
    traderReady: boolean
  }
  production?: Array<{
    id: number
    coord: string
    trader: number
    traderAll: number
    storage: number
    wood: number
    stone: number
    iron: number
  }>
  trader?: Array<{
    id: number
    wood?: number
    stone?: number
    iron?: number
  }>
  bestCandidate?: {
    k: string
    probeVillageId: number
    executionVillageId: number
    type: "buy" | "sell"
    resource: "wood" | "stone" | "iron"
    score: number
  } | null
}
```

### Saida compartilhada

```ts
type ExchangeRequirementIssueCode =
  | "CONFIG_INACTIVE"
  | "NO_ACTIVE_DIRECTION"
  | "ACCOUNT_NOT_PREMIUM"
  | "SINGLE_VILLAGE_NON_PREMIUM_FALLBACK"
  | "WORLD_PREMIUM_EXCHANGE_DISABLED"
  | "WORLD_PREMIUM_EXCHANGE_UNKNOWN"
  | "CAPTCHA_ACTIVE"
  | "COMMAND_ACTIVE"
  | "CRITICAL_SECTION_ACTIVE"
  | "PRODUCTION_UNAVAILABLE"
  | "TRADER_UNAVAILABLE"
  | "GROUP_EMPTY"
  | "NO_MARKET_VILLAGES"
  | "FREE_TRADER_UNKNOWN"
  | "NO_FREE_TRADER_VILLAGES"
  | "NO_BUY_LANE"
  | "NO_SELL_LANE"
  | "NO_PROBE_K"
  | "NO_GLOBAL_CANDIDATE"
  | "EXECUTION_MARKET_UNCONFIRMED"

type ExchangeRequirementIssue = {
  code: ExchangeRequirementIssueCode
  level: "error" | "warn" | "info"
  scope: "config" | "account" | "world" | "runtime" | "data" | "village" | "candidate"
  retryable: boolean
  message: string
  meta?: Record<string, unknown>
}

type ExchangeRequirementDecision =
  | "disabled"
  | "blocked"
  | "observe-only"
  | "probe-ready"
  | "candidate-ready"
  | "execute-ready"

type ExchangeRequirementResponse = {
  ok: boolean
  decision: ExchangeRequirementDecision
  shouldNotifyController: boolean
  shouldRequestPreempt: boolean
  issues: ExchangeRequirementIssue[]
  capabilities: {
    canRenderView: boolean
    canReadUniverse: boolean
    canBuildLanes: boolean
    canProbeExchange: boolean
    canSelectCandidate: boolean
    canExecute: boolean
    canRequestPreempt: boolean
  }
  summary: {
    groupId: number
    buyActive: boolean
    sellActive: boolean
    villagesTotal: number
    villagesWithMarket: number
    villagesWithFreeTrader: number
    ksEligible: number
    hasBestCandidate: boolean
    bestCandidateType: "buy" | "sell" | null
    bestCandidateResource: "wood" | "stone" | "iron" | null
    probeVillageId: number | null
    executionVillageId: number | null
    k: string | null
  }
}
```

### Decisões esperadas

- `disabled`
  - config desligada, conta sem premium ou mundo sem premium exchange
- `blocked`
  - existe configuração e capability, mas runtime atual impede avanço
- `observe-only`
  - pode existir e ler dados, mas ainda não pode sondar/executar
- `probe-ready`
  - já pode selecionar até 5 `Ks` e chamar `exchange_data`
- `candidate-ready`
  - já existe oportunidade candidata, mas ainda sem janela de execução
- `execute-ready`
  - pode pedir pausa cooperativa e executar

### Projeção para o SW controller

Se a resposta for enviada ao `SW controller`, ela deve ser reduzida para:

```ts
type ExchangeControllerProjection = {
  source: "exchange"
  scopeKey: string | null
  decision: "disabled" | "blocked" | "observe-only" | "probe-ready" | "candidate-ready" | "execute-ready"
  shouldRequestPreempt: boolean
  issueCodes: string[]
  k: string | null
  probeVillageId: number | null
  executionVillageId: number | null
  candidateType: "buy" | "sell" | null
  candidateResource: "wood" | "stone" | "iron" | null
}
```

Regras:

- a `view` usa a resposta completa
- runners usam a resposta completa
- o `SW controller` usa só a projeção
- o controller não precisa receber listas de vilas ou payloads pesados

## Requisitos de Execução

### Conta

- com `1` vila, o módulo pode rodar sem premium
- com `2` ou mais vilas, premium ativo é requisito duro
- sem premium e com `1` vila, o resolvedor usa `gameData.village` como fallback estrutural
- sem premium e com `1` vila, o `incoming` não vem de `table-trader`; ele vem de `screen=market`
- `table-production` continua sendo a fonte primária quando premium está ativo
- `table-trader` continua sendo a fonte primária de incoming quando premium está ativo

### Mundo

- o mundo precisa suportar Mercado Premium
- `worldConfig.premium.PremiumExchange === 1` já é um sinal primário válido
- `worldConfig.premium.MerchantExchange` pode ser mantido como sinal auxiliar
- `bringData("tw-apis", { config: ["premium"] })` já entrega esse dado
- o probe real no mercado continua existindo como confirmação operacional
- o resultado deve ser cacheado por mundo:
  - `unknown`
  - `enabled`
  - `disabled`

Regra atual do contrato:

- se `PremiumExchange !== 1`, o módulo pode marcar o mundo como `disabled` sem request extra
- se `PremiumExchange === 1`, o módulo pode seguir
- o probe real continua útil para confirmar operação de tela/request, não para substituir o filtro inicial

### Vila

- para vender, a vila precisa ter:
  - mercado
  - mercador disponível
  - recurso disponível acima das reservas
- para comprar, a vila precisa ter:
  - mercado
  - capacidade útil de armazém
  - PP disponível

### Edifício mercado

- na vila atual, o nível do mercado pode ser lido de `gameData.village.buildings.market`
- nas demais vilas, `table-production` já informa `trader` e `traderAll`
- regras atuais do contrato:
  - `traderAll > 0` significa que a vila tem mercado
  - `trader > 0` significa que a vila tem mercador livre agora
  - `trader === 0 && traderAll > 0` significa mercado existente com mercadores ocupados
  - para venda, `trader > 0` já é filtro suficiente para continuar
  - para compra, o sinal estrutural correto é `traderAll > 0`, não `trader > 0`
  - se a vila compradora finalista ainda tiver mercado `unknown`, o módulo pode:
    - validar com request auxiliar
    - decidir build
    - ou descartar a candidata
- a validação de prédio fora da vila atual deve ser tardia, não massiva

## Fonte de Dados

### `gameData`

`gameData` não representa o universo de vilas do módulo.

Ele serve para:

- contexto da sessão
- `link_base_pure`
- `csrf`
- vila atual
- nível do mercado da vila atual
- saldo de PP do jogador

### `table-production`

`table-production(groupId)` é a fonte primária de:

- recursos atuais da vila
- armazém
- mercadores disponíveis
- mercadores totais
- filas e dados auxiliares

Campos relevantes para exchange:

- `trader`
  - mercadores livres
- `traderAll`
  - mercadores totais
- `traderAll > 0`
  - vila com mercado

Fallback sem premium:

- com `1` vila, `gameData.village` já fornece:
  - recursos atuais
  - armazém
  - coordenada
  - pontos
  - nível do mercado em `gameData.village.buildings.market`
  - `trader_away`
  - bônus estruturais em `gameData.village.bonus`
- nesse fallback:
  - `incoming` vem de `screen=market`
  - o request usa `gameData.link_base_pure`
  - o parser usado é `getBusinessInPage(doc, "entry")`
  - `traderAll` é calculado por `nivel do mercado -> tabela base de mercadores`
  - o bônus de mercado multiplica a tabela base
  - `traderAll = round(baseMerchants[level] * (bonus.market || 1))`
  - `trader = max(traderAll - trader_away, 0)`

### `table-trader`

`table-trader(groupId, type="inc", summary="receivedVillages")` é a fonte primária de:

- recursos entrando em cada vila

Exceção:

- sem premium e com `1` vila, não usamos `table-trader`
- nesse caso, os recursos entrando são lidos da página `screen=market`

### Visões de recurso por vila

Para exchange, não devemos colapsar cedo demais os dados.

Cada vila precisa manter 3 visões:

- `current`
  - recursos disponíveis agora
- `incoming`
  - recursos entrando
- `projected`
  - `current + incoming`

Uso esperado:

- `sell` usa principalmente `current`
- `buy` usa principalmente `projected`, por causa de armazém e overflow

## Cadência

- contrato lógico do ciclo: `10s`
- implementação pode aplicar jitter interno entre `10s` e `12s`
- o módulo deve funcionar em `single-flight`
- se um ciclo ainda está rodando, o próximo não deve iniciar

## Modelo de Execução

### Legado

O fluxo antigo rodava somente na página do mercado premium.

Isso dava garantias implícitas:

- mundo com premium exchange
- DOM do mercado disponível
- vila atual já no contexto do mercado

### Novo fluxo

O fluxo novo é sidecar.

Ele deve:

- poder rodar junto com farm, coleta e outros runners
- não disputar o slot principal enquanto estiver só monitorando
- só pedir pausa/preempção quando existir uma troca real para executar

### Exclusões

O módulo não deve executar troca quando houver:

- captcha
- command
- outra seção crítica não interrompível

## Separação por `K`

O módulo deve separar o universo por continente já no começo do ciclo.

Motivos:

- a taxa é por `K`
- a pré-seleção de vilas fica mais precisa
- reduz cálculo inútil na fase final

## Lanes por `K`

Para cada `K`, o módulo deve trabalhar separadamente as melhores vilas para:

- `buy.wood`
- `buy.stone`
- `buy.iron`
- `sell.wood`
- `sell.stone`
- `sell.iron`

Isso deve acontecer antes do probe de taxa, porque:

- elimina casos impossíveis cedo
- reduz requests
- melhora a precisão da decisão final

## Regras de Poda Antecipada

### Gerais

- se `buy.active = false`, elimina todas as lanes de compra
- se `sell.active = false`, elimina todas as lanes de venda
- se um `K` não tem nenhuma lane elegível, ele não entra no probe

### Venda

- se a vila não tem `trader > 0`, ela não entra em lanes de venda
- se nenhuma vila do `groupId` tem mercador disponível e só venda está ativa:
  - o ciclo deve terminar sem fazer request de exchange
- venda deve respeitar:
  - `minStorageReserve`
  - `maxPerSell`
  - `maxTransportOnly`
  - `proportionalMerchants`

### Compra

- se a vila não tem `traderAll > 0`, ela não entra em lanes de compra
- compra deve respeitar:
  - `maxPerBuy`
  - `storageLimit`
  - `limitPremium`
  - `dailyPpLimit`
  - taxa manual quando ativa
- se não houver folga útil de armazém ou PP utilizável:
  - o caso deve ser descartado antes do probe

## Probe de Taxa

### Unidade de leitura

- a leitura de taxa é por `K`
- para cada `K`, basta 1 vila-probe

### Unidade de execução

- a execução pode acontecer em outra vila do mesmo `K`

Logo:

- `probeVillageId` pode ser diferente de `executionVillageId`

### Limite por ciclo

- o módulo deve sondar no máximo 5 continentes por ciclo

### Seleção da vila-probe

A vila-probe do `K` deve ser escolhida por prioridade:

1. vila forte em mais lanes ativas do `K`
2. vila atual, se estiver no mesmo `K`
3. maior capacidade estrutural útil

## Request de Exchange

O request do exchange deve:

- usar `gameData.link_base_pure`
- chamar `market&ajax=exchange_data`
- poder informar `village`
- validar bot protect/captcha antes e depois

## Seleção Final

Depois do probe de taxa:

1. a taxa observada do `K` é cruzada com as lanes pré-calculadas
2. cada lane pode manter mais de uma candidata estrutural
3. o módulo escolhe a melhor candidata global por score/lucro esperado

Não devemos reduzir cedo demais para uma única vila por lane.

Recomendação atual:

- manter ranking curto por lane
- por exemplo `top 3`

## Execução e Preempção

### Comportamento

- o monitor de exchange roda em paralelo
- só quando encontrar uma troca válida ele sobe para execução

### Fluxo esperado

1. monitor encontra `bestCandidate`
2. valida se pode interromper
3. pede pausa cooperativa do runner atual
4. executa a troca
5. libera e retoma o fluxo anterior

## Worker

### Objetivo

O worker existe para evitar travamento da main thread enquanto o módulo:

- lê snapshots
- agrupa por `K`
- calcula lanes
- ranqueia candidatas

### Fronteira atual desejada

Main thread:

- lê `gameData`
- busca `table-production(groupId)`
- busca `table-trader(groupId)`
- escolhe vilas-probe
- faz request `exchange_data`
- verifica captcha/bot protect
- executa a troca quando necessário

Worker:

- atualiza histórico `registerRateDay`
- calcula taxa base e score
- avalia lanes e candidatas
- devolve a melhor oportunidade global

## Persistência

### `registerRateDay`

Representa o histórico diário por `K` e recurso:

- `min`
- `max`
- `current`

### `exchangeDaily`

Representa o ledger diário de trocas executadas.

### `exchangeConsolidated`

Representa o consolidado diário cruzando:

- trocas executadas
- limites observados do `K`

## Configurações Atuais

### Compra

- `buy.active`
- `buy.maxPerBuy`
- `buy.storageLimit`
- `buy.limitPremium`
- `buy.dailyPpLimit`
- `buy.manualRate.active`
- `buy.manualRate.baseRate.wood`
- `buy.manualRate.baseRate.stone`
- `buy.manualRate.baseRate.iron`

### Venda

- `sell.active`
- `sell.minStorageReserve`
- `sell.maxPerSell`
- `sell.maxTransportOnly`
- `sell.proportionalMerchants`
- `sell.manualRate.active`
- `sell.manualRate.baseRate.wood`
- `sell.manualRate.baseRate.stone`
- `sell.manualRate.baseRate.iron`

## Primeiro Marco

O primeiro marco do fluxo novo deve entregar:

1. leitura de `production` e `trader` por `groupId`
2. separação das vilas por `K`
3. cálculo antecipado das melhores vilas por lane
4. poda de casos impossíveis pela config
5. eliminação de requests quando não houver lane ativa
6. seleção de até 5 `Ks` para probe
7. leitura de `exchange_data`
8. escolha da melhor candidata global

Sem isso, a fase de execução fica imprecisa.
