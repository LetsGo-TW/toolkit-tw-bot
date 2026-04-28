# Regras de Redistribuicao no Conflito de Fake Limit

Este documento registra as regras de negocio para redistribuicao de tropas em conflito de `fake_limit`, aplicadas no fluxo de normalizacao de template de envio.

## Funcoes relacionadas

- `normalizeTemplateForCommand` em `planner/send/utils/normalizeTemplateForCommand.js`
- `enforceSlowestUnitPerAttack` em `planner/send/utils/normalizeTemplateForCommand.js`
- `enforceFakeLimitOnAttackRows` em `planner/send/utils/normalizeTemplateForCommand.js`

## Regras principais

1. `snob` (nobre) nao entra na distribuicao de tropas das linhas para fechar `fake_limit`.
2. `snob` e tratado apenas na regra da tropa mais lenta, para garantir capacidade de ataque por linha.
3. Prioridade e sempre a quantidade de ataques possiveis.
4. Se houver conflito de `snob` entre linhas, o objetivo e manter o maior numero de linhas validas.
5. Cada linha de ataque valida deve ter pelo menos `1` unidade da tropa mais lenta.
6. Primeiro tenta usar somente tropas do modelo.
7. Se nao fechar o limite usando apenas modelo, usa tropas fora do modelo somente para completar.
8. A distribuicao para completar populacao e proporcional entre as tropas elegiveis (mesma ideia de `Place/place-fake-limit.js`).
9. Nobre nunca vai sozinho: linha com `snob` precisa de no minimo `20` de populacao sem contar o proprio `snob`.
10. Quando sobrar tropa em linhas fixas do modelo e existir linha `-1` para a mesma unidade, a sobra vai para a linha `-1`.
11. Se nao houver conflito de fake-limit nas linhas, nao executa redistribuicao de fake-limit.
12. Quando faltar tropa mais lenta para todas as linhas, o corte de linhas ocorre antes da distribuicao fixed/all para preservar o "restante" da linha `ALL`.
13. No pool de redistribuicao so entram unidades com `speed <= speed` da tropa mais lenta do modelo (nao entram unidades mais lentas para nao alterar tempo do comando).

## Definicoes

- `TML`: quantidade disponivel da tropa mais lenta (unidades).
- `FL`: fake limit em populacao minima por ataque.
- `TDM`: tropas disponiveis do modelo, em populacao.
- `TDT`: tropas disponiveis totais, em populacao.
- `TDFM`: tropas disponiveis fora do modelo, em populacao.
- `TA`: total de ataques (linhas).

Relacao:

- `TDFM = TDT - TDM`

## Equivalencia com variaveis reais do codigo

- `FL` -> `minPop` (derivado de `fakeMinPopBase` em `enforceFakeLimitOnAttackRows`).
- `TA` -> quantidade de linhas ativas em `rows`.
- `TML` -> `getAvailableByUnit(slowestUnit)`; no fluxo principal `slowestUnitForAttack`.
- `TDT` -> `totalAvailablePop`.
- `TDM` -> populacao total disponivel considerando apenas `modelPoolUnits`.
- `TDFM` -> populacao total disponivel considerando `outsideModelPoolUnits`.
- `APD` -> `attacksPossible`.
- minimo por linha com snob -> `getRowTargetPop(row)` (usa `Math.max(minPop, snobEscortMinPop)`).
- pop da linha para limite (sem snob) -> `getRowLimitPopulation(row)`.
- conjunto de unidades do modelo -> `modelUnitsInTemplate` / `modelUnitSet`.
- pool do modelo -> `modelPoolUnits`.
- pool fora do modelo -> `outsideModelPoolUnits`.
- disponibilidade por unidade -> `remainingByUnit`.

## Formulas de decisao

Minimo total para manter todas as linhas:

- `MTTL = TA * FL`

Comparacao entre modelo e limite total:

- `MTTM = TDM - MTTL`

Se faltar tropa mais lenta ou populacao total para todas as linhas, calcula ataques possiveis:

- condicao original: `TML < TA` ou (`MTTM < 0` e `TDFM < MTTM`)
- interpretacao operacional usada no codigo: `TML < TA` ou (`MTTM < 0` e `TDFM < abs(MTTM)`)
- ataques possiveis:
- `APD = min(TML, floor(TDT / FL))`

Equivalente direto no codigo:

- `maxRowsByPop = floor(totalAvailablePop / minPop)`
- `maxRowsBySlowest = getAvailableByUnit(slowestUnit)` (quando existe)
- `attacksPossible = min(currentRows.length, maxRowsBySlowest, maxRowsByPop)`

Se o modelo sozinho fecha:

- `TDM - (APD * FL) >= 0` -> usar apenas modelo

Equivalente operacional:

- tenta fechar deficit primeiro com `topUpDeficitRowsFromPool(modelPoolUnits)`
- reequilibra com `rebalanceRowsBySurplus(modelPoolUnits)`
- so se ainda houver deficit (`getDeficitRows().length > 0`) entra `outsideModelPoolUnits`

Caso contrario:

- usar modelo primeiro
- completar somente o deficit com tropas fora do modelo

## Ordem operacional no codigo

1. Normaliza linhas do template para ordem do mundo.
2. Resolve conflito de tropas por disponibilidade local (fixed/all).
3. Aplica regra da tropa mais lenta por linha (1 por linha valida).
4. Limita numero maximo de linhas por disponibilidade real (`APD`).
5. Fecha fake limit em duas fases:
   - fase 1: pool do modelo
   - fase 2: pool fora do modelo (somente se ainda houver deficit)
6. Redistribui sobra para linhas `-1` do modelo quando aplicavel.
7. Revalida tropa mais lenta apos ajuste de fake limit.
8. Remove linhas que nao atingem o minimo de populacao.

## Observacoes

- `knight` e excecao de linha e nao entra na regra de corte por fake limit.
- `snob` participa da regra da unidade mais lenta e da quantidade de ataques possiveis, mas nao entra no pop de fake-limit por linha.
- para limite de fake (`minPop`), o calculo operacional ignora `snob` na populacao da linha.
- Quando nao ha recursos para todas as linhas, o envio e parcial por quantidade de ataques possiveis.
