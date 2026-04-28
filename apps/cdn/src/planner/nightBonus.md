# Night Bonus (BN) - notas de arquitetura (definitivo)

Ponto delicado: evitar requests desnecessários ao tratar BN/moral, principalmente em mundos com `night.active = 2`, sem perder consistência no envio local, no backend (`distribute`) e no envio agendado.

## Regras de negócio (confirmadas)

1. O `night` é do jogador alvo.
- 10 vilas do mesmo jogador compartilham o mesmo `night`.

2. Bárbaras não têm `night`.
- Na prática, usar `night` global do mundo como fallback.

3. `night.active = 1`
- BN efetivo = config global do mundo.
- Não precisa buscar `night` por player.
- No `map_info`, o campo `night_bonus` não vem (não contar com ele nesse modo).

4. `night.active = 2`
- BN efetivo = config do jogador alvo.
- O dado **não** vem no payload de `world players`.
- O dado vem no `map_info` por vila (ou via captura do XHR do TW salva em cache/window).

5. Moral (`morale`)
- Vem no `map_info` da vila.
- Bárbara / sem `playerId` => moral = `1` (100%).

## Endpoint `map_info` (fonte de BN / moral / reserva)

Exemplo real (TW):

- `https://br139.tribalwars.com.br/game.php?village=156511&screen=map&ajax=map_info&source=156511&target=153604&`

Campos relevantes (dependendo do contexto):

- `morale`
- `night_bonus.current_interval` (só quando `night.active = 2`)
- `reservation`
- `id`

Observações:

- Em `night.active = 1`, usamos a config global do mundo; não depender do `map_info` para BN.
- Em `night.active = 2`, `map_info` é fonte prática para obter BN por player (via uma vila daquele player).

## Request atual no código (planner)

Arquivo:

- `planner/requests/getAjaxMapInfo.js`

Funções públicas:

- `getCachedAjaxMapInfo(targetId)` -> tenta cache/contexto (`TWMap`) sem request
- `getAjaxMapInfo(targetId, { signal, requestIfMissing = true })` -> busca cache e, se faltar, faz request

Montagem da URL (GET):

- `${gameData.link_base_pure}map&ajax=map_info&source=${gameData.village.id}&target=${normalizedTargetId}`

Características do request:

- método: `GET`
- headers: `makeAjaxHeadersGet()`
- `credentials: "include"`
- `cache: "no-store"`
- timeout/abort via `AbortController` + `combineAbortControllerSignals(...)`

## Cache / storage do `map_info` (estado atual)

Hoje a base é cache volátil em `window` + leitura de contexto (`TWMap`):

- `getMapInfoCacheState()` -> `{ cache: Map, inFlight: Map }`
- `getMapInfoFromWindowCache(targetId)` -> busca cache e tenta aproveitar `TWMap.context`
- `getCachedAjaxMapInfo(targetId)`
- `getAjaxMapInfo(...)` -> popula cache após resposta

Também aproveitamos a captura de XHR do TW (`map_info`) para reduzir requests redundantes.

Diretriz:

- tratar cache/window como fonte rápida
- não tratar como verdade de longo prazo (BN pode mudar de um dia para o outro)

## Fato importante: `world players` não traz `night`

Exemplo de player de `world players`:

- vem `id`, `name`, `allyId`, `villages`, `points`, `rank`, etc.
- **não vem** `night`

Implicação:

- não usar `world players` como fonte de BN
- usar `playerId` apenas como chave de relacionamento
- BN/moral precisam ser resolvidos via `map_info`/XHR-cache (quando aplicável)

## Modelo definitivo (frontend + backend)

### Objetivo do modelo

- não duplicar BN/moral em todos os targets
- evitar conflito de dados
- manter lookup eficiente por `playerId`
- enviar explicitamente config global do mundo

### Estrutura recomendada

- `meta.worldNightConfig` (sempre explícito)
- `meta.playerNightMoralState` (lista por `playerId`, snapshot resolvido)
- `targets[].playerId` (relação alvo -> player)
- **não** salvar `night/moral` como fonte de verdade dentro de `target`

Exemplo conceitual:

```json
{
  "meta": {
    "worldNightConfig": {
      "active": 2,
      "start_hour": 0,
      "end_hour": 8
    },
    "playerNightMoralState": [
      {
        "playerId": 919870640,
        "night": {
          "current_interval": "Atual: 00:00-08:00"
        },
        "moral": 1
      }
    ]
  },
  "targets": [
    {
      "id": 153604,
      "x": 125,
      "y": 411,
      "playerId": 919870640
    }
  ]
}
```

Notas:

- `playerNightMoralState` é snapshot resolvido, relacionado ao player, mas obtido por `map_info` de vila.
- `moral` está junto por pragmatismo operacional (também vem em `map_info`), mesmo não sendo “config”.
- Em runtime, converter lista para mapa por `playerId` para lookup rápido.

## Estratégia de resolução de dados (ordem definitiva)

Para `night.active = 2`, ao precisar resolver BN/moral de um target com `playerId`:

1. `playerNightMoralState` (estado já resolvido em memória / meta do fluxo)
2. cache/window com dados da captura do XHR do TW (`map_info` já salvo)
3. request `map_info` (último recurso)

Observações:

- Deduplicar por `playerId` (uma vila representativa resolve BN para todas as vilas do player).
- Moral ainda pode variar por target/contexto de vila; quando necessário para envio/preview, usar o `map_info` daquele target. Se optarmos por armazenar em `playerNightMoralState`, tratar como snapshot útil e atualizar quando vier dado mais novo da vila.
- Bárbara / sem `playerId`:
  - `night` = global
  - `moral` = `1`
  - não entra em `playerNightMoralState`

## Estratégia de busca (quando buscar)

### Fechamento recomendado (híbrido)

Melhor equilíbrio entre UX, consistência e requests:

1. `night.active = 2` -> buscar em background ao carregar a lista de targets (sem bloquear UI)
- motivo: a tabela/preview usa esse dado e o usuário tende a navegar/ordenar antes de enviar
- fazer dedupe por `playerId`
- aplicar conforme chega (rerender incremental)
- limitar concorrência para não explodir requests

2. `night.active = 2` -> garantir resolução no clique de `Enviar agora` / `Agendar agora`
- motivo: esse é o ponto em que o dado é efetivamente obrigatório para decisão/envio
- rodar um preflight apenas para os targets selecionados
- ordem de resolução:
  - `playerNightMoralState`
  - cache/window (XHR TW)
  - `map_info`
- se ainda faltar dado crítico:
  - política explícita (bloquear / warning / fallback), conforme regra do produto

3. `night.active = 1` -> não buscar BN no carregamento da lista
- BN já é global
- buscar `map_info` apenas quando precisar de `moral` (ex.: navegação do target, preview, ou envio se moral estiver ausente)

### Por que não buscar só no clique de enviar/agendar?

Funciona, mas tem custos:

- piora a latência perceptível no momento mais sensível (envio)
- reduz qualidade da tabela/preview antes do envio
- concentra burst de requests justamente no clique

### Por que não buscar só no carregamento da lista?

Também não basta sozinho:

- o dado pode faltar para players ainda não resolvidos
- pode haver stale data
- envio agendado precisa reavaliação no momento da execução

Conclusão:

- **prefetch em background + garantia no preflight de envio/agendamento** é a estratégia mais saudável.

## Estratégia Frontend (preview / tabela / navegação)

### `night.active = 2`

- Ao carregar targets list:
  - agrupar por `playerId`
  - iniciar resolução assíncrona por player (sem bloquear)
  - preencher/atualizar `playerNightMoralState`
  - rerender tabela/preview conforme chegam resultados
- Na navegação de target:
  - se faltar `moral`/dados para aquele target, usar cache/window e então `map_info`

### `night.active = 1`

- BN vem de `meta.worldNightConfig`
- Não buscar BN por player
- Buscar `map_info` na navegação quando precisar de `moral` e o target ainda não tiver dado suficiente

## Estratégia de envio local (planner / orquestrador)

### Envio local - alvo atual

- Guard de BN após fase 2 pode usar `confirmDurationSecond` + horário da confirmação
- Para resolver BN efetivo:
  - `meta.worldNightConfig`
  - `target.playerId`
  - `meta.playerNightMoralState` (quando `active = 2`)
  - fallback/captura/request no preflight se faltar

### Envio local - multi (por grupo/target)

- Não depender de um `nightBonusConfig` global fixo do target atualmente selecionado na UI
- Resolver por target/grupo via `playerId`
- Cada grupo/target precisa de acesso a:
  - `target.playerId`
  - `meta.worldNightConfig`
  - `meta.playerNightMoralState` (ou mecanismo de resolução)

Se faltar dado no momento da avaliação:

- tratar como estado explícito (`unknown`) e aplicar política definida:
  - bloquear
  - permitir com warning
  - fallback global (somente se regra do produto aceitar)

## Estratégia para backend / distribute

Ponto crítico:

- `night.active = 2` não pode usar só config global para avaliar BN.

### Diretriz de contrato (payload)

Mandar explicitamente:

- `meta.worldNightConfig` (sempre)
- `targets[]` com `playerId`
- `meta.playerNightMoralState` (snapshot por `playerId`, quando relevante)

Diretriz importante:

- backend **não** deve assumir `world players` como fonte de BN
- backend deve resolver BN efetivo por target via `playerId` + `playerNightMoralState` (ou buscar/revalidar quando necessário)

Exemplo conceitual:

```json
{
  "meta": {
    "worldNightConfig": {
      "active": 2,
      "start_hour": 0,
      "end_hour": 8
    },
    "playerNightMoralState": [
      {
        "playerId": 919870640,
        "night": { "current_interval": "Atual: 00:00-08:00" },
        "moral": 1
      }
    ]
  },
  "targets": [
    { "id": 153604, "playerId": 919870640 }
  ]
}
```

Notas:

- Em `active = 1`, `playerNightMoralState` pode ser omitido para BN (mantendo só se for útil para moral snapshot).
- Em `active = 2`, backend deve preferir `playerNightMoralState` para BN por player.
- Sempre enviar `worldNightConfig` explícito evita ambiguidade entre frontend/local/backend.

## Envio agendado (pendência crítica)

Direção recomendada:

- salvar no agendamento:
  - `meta.worldNightConfig` explícito
  - snapshot opcional de `meta.playerNightMoralState` dos alvos/players envolvidos
- no momento da execução:
  - reavaliar BN/moral quando possível (principalmente `active = 2`)
  - usar a mesma ordem de resolução:
    1. snapshot salvo (rápido)
    2. cache disponível no executor (se existir)
    3. `map_info` (ou outra fonte online) quando necessário
- registrar divergências entre snapshot e valor reavaliado (auditoria/debug)

## Checklist de implementação (resumo)

- Trocar nomenclatura para `playerNightMoralState`
- Manter `meta.worldNightConfig` explícito em front e backend
- Targets carregam `playerId`, não `night/moral` como fonte de verdade
- `active = 2`: prefetch em background por `playerId` + preflight no envio/agendamento
- `active = 1`: BN global; buscar `map_info` apenas quando precisar de moral/navegação
- Reutilizar captura do XHR do TW antes de cair no request `map_info`

## Checklist técnico de implementação

### Frontend local (planner / tabela / navegação / envio)

- Criar/centralizar estado em memória `playerNightMoralState` (lista + índice por `playerId` em runtime).
- Garantir `meta.worldNightConfig` explícito em todos os fluxos de preview/envio local.
- Garantir `targets[].playerId` disponível nos targets usados pela tabela, navegação e envio.
- Implementar resolvedor único `resolvePlayerNightMoral(target)` com ordem:
  1. `playerNightMoralState`
  2. cache/window (XHR TW capturado / `map_info`)
  3. request `map_info`
- `night.active = 2`: iniciar prefetch em background ao carregar lista de targets:
  - dedupe por `playerId`
  - limitar concorrência
  - rerender incremental conforme chega
- `night.active = 1`: não fazer prefetch de BN; buscar `map_info` só quando precisar de `moral` (navegação/preview/envio).
- Na navegação de target:
  - se faltar `moral` para target com `playerId`, tentar cache/window e depois `map_info`
  - bárbara sem `playerId` => `moral = 1`, `night = global`
- No `Enviar agora` e `Agendar agora`:
  - rodar preflight para os selecionados
  - garantir resolução mínima dos dados críticos antes de executar
  - aplicar política explícita quando faltar dado (`unknown`)
- Guard local pós-fase-2 (BN):
  - usar `meta.worldNightConfig` + `target.playerId` + `playerNightMoralState`
  - nunca depender do target atualmente selecionado na UI como BN global fixo

### Backend / distribute

- Ajustar contrato para receber `meta.worldNightConfig` explicitamente.
- Receber `targets[]` com `playerId`.
- Receber `meta.playerNightMoralState` (snapshot por `playerId`) quando aplicável.
- No backend, resolver BN efetivo por target:
  - `active = 1` => usar global
  - `active = 2` => usar `playerNightMoralState[playerId]` (ou equivalente após indexação)
- Não usar `world players` como fonte de BN.
- Definir política de falta de dado no backend (`unknown`):
  - bloquear
  - warning e continuar
  - fallback global (somente se produto aprovar)
- Registrar no resultado como o BN foi resolvido:
  - `global`
  - `player-state`
  - `fallback`
  - `unknown`

### Envio agendado (scheduler)

- Salvar no agendamento:
  - `meta.worldNightConfig`
  - snapshot opcional de `meta.playerNightMoralState` para players/targets envolvidos
  - `targets[]` com `playerId`
- Na execução do agendamento:
  - reavaliar BN/moral quando possível (principalmente `active = 2`)
  - usar ordem de resolução padrão:
    1. snapshot salvo
    2. cache disponível no executor (se existir)
    3. request/fonte online (`map_info` ou equivalente)
- Definir timeout e limite de concorrência para revalidação em massa.
- Definir política de execução quando faltarem dados críticos no horário agendado.
- Registrar divergência entre snapshot salvo e valor reavaliado (debug/auditoria).

### Infra / observabilidade (recomendado)

- Instrumentar contadores:
  - acerto em `playerNightMoralState`
  - acerto em cache/window XHR
  - requests `map_info`
  - falhas/timeout
- Logar taxa de dedupe por `playerId` (para medir economia de request).
- Adicionar flag de debug para inspecionar origem do dado (`state/window/request`) na UI de desenvolvimento.
