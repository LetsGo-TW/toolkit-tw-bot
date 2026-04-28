# Command Scheduling Schema

Este documento descreve o objeto completo de comando agendado (`scheduling:command`).

Fonte base: `planner/schema.json`.

## Objetivo

Representar um comando agendado com:

- Identidade do comando e escopo do mundo/jogador.
- Dados de origem, alvo e template.
- Dados de agendamento (chegada, envio e reagendamentos).
- Estado atual de execução, conflitos e possíveis erros.

## Estrutura Geral

```json
{
  "_id": "world:<world>:player:<playerId>:planner:<plannerId>:command:<uuid>",
  "schemaVersion": 1,
  "type": "scheduling:command",
  "status": "scheduled",
  "world": "br134",
  "playerId": 8092491,
  "plannerType": "one-to-many",
  "plannerName": "Meu planner",
  "plannerId": "UUID",
  "twCommandId": null,
  "commandId": "UUID",
  "commandType": "attack",
  "commandName": "Meu command",
  "source": { "id": 10002, "x": 335, "y": 170 },
  "target": {
    "id": 10001,
    "x": 334,
    "y": 170,
    "speedBonusMultiplier": {
      "value": 1.1,
      "identifiedAt": 1770507741605,
      "identifiedBy": "commandId"
    }
  },
  "durationSeconds": 177050774,
  "output": "2026-02-08T16:25:00.000Z",
  "rangeUntilArrival": 600,
  "cancelAfterSendingTime": null,
  "serverTimeAtSubmission": 1770507741605,
  "template": {
    "templateType": "value",
    "buildTarget": "farm",
    "units": ["spear", "sword", "axe", "archer", "spy", "light", "marcher", "heavy", "ram", "catapult", "knight", "snob"],
    "values": [[-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0]]
  },
  "meta": {
    "worldNightConfig": { "active": 2, "start_hour": 0, "end_hour": 8 },
    "playerNightMoralState": [
      {
        "playerId": 919870640,
        "night": { "current_interval": "Atual: 00:00-08:00" },
        "moral": 100
      }
    ]
  },
  "scheduled": {
    "desiredArrival": "2026-02-08T18:30:00.000Z",
    "computedOutput": "2026-02-08T16:25:00.000Z",
    "rescheduledOutput": ["2026-02-08T16:25:00.000Z"]
  },
  "abortBy": null,
  "conflictTroops": "redistribute",
  "conflictAttacks": "partial",
  "conflictSpeedBonusMultiplier": "reschedule",
  "conflictsResolved": [],
  "error": null,
  "createdAt": "2026-02-08T12:00:00.000Z",
  "updatedAt": "2026-02-08T12:00:00.000Z"
}
```

## Campos

- `_id` (`string`, obrigatório)
  - Chave única do documento.
  - Com planner: `world:<world>:player:<playerId>:planner:<plannerId>:command:<uuid>`
  - Sem planner: `world:<world>:player:<playerId>:command:<uuid>`
  - `plannerId` no `_id` é opcional e só entra quando o comando pertence a um planner.

- `schemaVersion` (`number`, obrigatório)
  - Versão do schema.

- `type` (`"scheduling:command"`, obrigatório)
  - Tipo do documento.

- `status` (`"scheduled" | "running" | "done" | "aborted"`, obrigatório)
  - Estado atual do comando.

- `world` (`string`, obrigatório)
  - Mundo TW (`br134`, `en123`, etc).

- `playerId` (`number`, obrigatório)
  - ID do jogador dono.

- `plannerType` (`string`, opcional)
  - Tipo lógico do planner (`one-to-many`, etc).

- `plannerName` (`string`, opcional)
  - Nome amigável do planner.

- `plannerId` (`string`, opcional)
  - ID do planner quando o comando pertence a um planner.

- `twCommandId` (`number | null`, opcional)
  - ID do comando gerado no TW após envio.

- `commandId` (`string`, obrigatório)
  - ID interno estável do comando (UUID).

- `commandType` (`string`, obrigatório)
  - Tipo do comando (`attack`, `support`, etc).

- `commandName` (`string`, opcional)
  - Nome amigável definido pelo usuário.

- `source` (`object`, obrigatório)
  - `id` (`number`) aldeia origem.
  - `x` (`number`) coordenada X.
  - `y` (`number`) coordenada Y.

- `target` (`object`, obrigatório)
  - `id` (`number`, opcional) aldeia alvo.
  - `x` (`number`) coordenada X.
  - `y` (`number`) coordenada Y.
  - `speedBonusMultiplier` (`object | null`, opcional)
  - `value` (`number`) multiplicador detectado.
  - `identifiedAt` (`number`) timestamp em ms da detecção.
  - `identifiedBy` (`string`) origem da detecção.

- `durationSeconds` (`number`, obrigatório)
  - Duração de viagem em segundos.

- `output` (`string`, ISO 8601, obrigatório)
  - Horário efetivo de envio atual.
  - Pode mudar em reagendamento.
  - É o horário usado na execução do comando.

- `rangeUntilArrival` (`number`, obrigatório)
  - Range em minutos para randomização antes da chegada.
  - `0` = horário fixo.
  - `> 0` = randomiza antes da chegada.

- `cancelAfterSendingTime` (`string | null`, ISO 8601)
  - Horário para cancelar após envio, se aplicável.

- `serverTimeAtSubmission` (`number`, obrigatório)
  - `Date.now()`/ms do servidor na submissão.

- `template` (`object`, obrigatório)
  - `templateType` (`"value" | "percent"`)
  - `buildTarget` (`string`)
  - `units` (`string[]`)
  - `values` (`number[][]`)
  - `units` deve seguir a ordem de `game_data.units` (sem `militia`, quando aplicável).

- `meta` (`object`, opcional)
  - Snapshot operacional para revalidação/local-execução, principalmente em BN `active = 2`.
  - `worldNightConfig` (`object`, opcional)
  - Config global do mundo (`night`) usada como base.
  - `playerNightMoralState` (`array`, opcional)
  - Lista por `playerId` com snapshot resolvido de `night` e `moral`.
  - Recomendado para agendados quando houver dependência de BN por player.

- `scheduled` (`object`, obrigatório)
  - Registro do agendamento (histórico/base), separado da execução atual.
  - `desiredArrival` (`string`, ISO 8601): chegada desejada (imutável).
  - `computedOutput` (`string`, ISO 8601): envio calculado inicial (imutável).
  - `rescheduledOutput` (`string[]`, ISO 8601): histórico de envios reagendados.
  - Pode conter várias entradas (mais de um reagendamento).

- `abortBy` (`"player" | "user" | "ally" | "system" | null`, opcional)
  - Quem abortou.
  - Quando `system`, normalmente existe `error`.

- `conflictTroops` (`"redistribute" | "abort"`, obrigatório de regra)
  - Estratégia padrão para conflito de tropas.

- `conflictAttacks` (`"partial" | "abort"`, obrigatório de regra)
  - Estratégia padrão para conflito de ataques.

- `conflictSpeedBonusMultiplier` (`"reschedule" | "abort"`, obrigatório de regra)
  - Estratégia padrão para conflito de multiplicador de velocidade.

- `conflictsResolved` (`array`, opcional)
  - Lista de conflitos realmente ocorridos e como foram resolvidos.
  - Item:
  - `type` (`"troops" | "attacks" | "speedBonusMultiplier"`)
  - `resolution` (`string`) resultado aplicado (`redistribute`, `partial`, `reschedule`, `abort`, `none`).

- `error` (`object | null`, opcional)
  - Presente quando houve erro de execução.
  - Pode representar erro funcional (regras do jogo) ou técnico.
  - `code` (`string`) ex.: `NO_TROOPS`, `NO_TIME`, `SEND_TIMEOUT`, `CAPTCHA`.
  - `message` (`string`) descrição humana.
  - Sem campo `kind`: `code` + `message` já são suficientes no documento principal.

- `createdAt` (`string`, ISO 8601, obrigatório)
  - Data de criação.

- `updatedAt` (`string`, ISO 8601, obrigatório)
  - Última atualização.

## Regras de Consistência

- `type` deve ser sempre `scheduling:command`.
- `status = done` deve ter `twCommandId` preenchido.
- `status = aborted` deve ter `abortBy`.
- `abortBy = system` normalmente implica `error` preenchido.
- `error` não deve conter enum em formato `"A||B"`; deve conter um valor real por documento.
- `conflictsResolved` deve listar apenas conflitos que de fato ocorreram.
- `output` representa o envio atual; histórico fica em `scheduled.rescheduledOutput`.
- `scheduled` é o registro do agendamento; mudanças operacionais ficam em `output` e `scheduled.rescheduledOutput`.
- Regra definitiva: `_id` só inclui `planner:<plannerId>` quando `plannerId` existir.

## Exemplos de `_id`

- Com planner:
  - `world:br134:player:8092491:planner:71bb1e7c:command:8b84e3b1`
- Sem planner:
  - `world:br134:player:8092491:command:8b84e3b1`

## Glossário Rápido

- `desiredArrival`: chegada desejada pelo usuário.
- `computedOutput`: envio inicial calculado.
- `output`: envio efetivo atual.
- `rangeUntilArrival`: janela de randomização (minutos).
- `conflictsResolved`: trilha curta de decisão aplicada na execução.
