# Template JSON

Este arquivo descreve o formato do documento de template usado pelo planner.

Exemplos: veja `planner/templates/index.json` e os exemplos abaixo.

## Campos

- `_id` (`string`)
  - Identificador único.
  - Formato sugerido: `player:{playerId}:template:{uuid}` (o prefixo define o escopo).
- `type` (`string`)
  - Tipo do template (domínio).
  - Exemplos planejados: `command:template`, `train:template`, `building:template`.
- `schemaVersion` (`number`)
  - Versão do schema do documento.
- `playerId` (`number`)
  - ID do jogador dono do template.
- `name` (`string`)
  - Nome amigável do template.
- `templateType` (`"value" | "percent"`)
  - Modo de preenchimento.
  - `value`: valores absolutos.
  - `percent`: percentuais (0–100).
- `buildTarget` (`string`)
  - Alvo da catapulta (ex.: `place`, `barracks`, etc).
- `units` (`string[]`)
  - Lista de unidades, em ordem fixa (ex.: `["spear","sword",...]`).
  - Deve seguir a ordem de `game_data.units` (com `militia` removida, quando aplicável).
- `values` (`number[][]`)
  - Matriz de valores por linha do template.
  - Cada linha segue a ordem de `units`.
- `createdAt` (`string`, ISO 8601)
  - Data de criação.
- `updatedAt` (`string`, ISO 8601)
  - Última atualização.

## Observações

- `type` define o domínio do template.
- `templateType` define o modo (valor absoluto vs percentual) e **não** deve ser inferido de `type`.

## Regras rápidas

- `_id` define o escopo (player/tribo/user) e o identificador.
- `type` define o domínio do template (comando, treino, construção).
- `templateType` define o modo de preenchimento (`value` ou `percent`).

## Exemplos

### command:template

```json
{
  "_id": "player:789:template:uuid-123",
  "type": "command:template",
  "schemaVersion": 1,
  "playerId": 789,
  "name": "Ataque leve",
  "templateType": "value",
  "buildTarget": "place",
  "units": ["spear", "sword", "archer", "ram", "catapult"],
  "values": [[100, 200, 0, 5, 0]],
  "createdAt": "2026-02-06T12:00:00.000Z",
  "updatedAt": "2026-02-06T12:00:00.000Z"
}
```

### train:template

```json
{
  "_id": "player:789:template:uuid-456",
  "type": "train:template",
  "schemaVersion": 1,
  "playerId": 789,
  "name": "Recruta %",
  "templateType": "percent",
  "units": ["spear", "sword", "archer"],
  "values": [[50, 30, 20]],
  "createdAt": "2026-02-06T12:00:00.000Z",
  "updatedAt": "2026-02-06T12:00:00.000Z"
}
```

### building:template

```json
{
  "_id": "player:789:template:uuid-789",
  "type": "building:template",
  "schemaVersion": 1,
  "playerId": 789,
  "name": "Evolucao basica",
  "templateType": "value",
  "buildTarget": "barracks",
  "units": ["ram", "catapult"],
  "values": [[5, 2]],
  "createdAt": "2026-02-06T12:00:00.000Z",
  "updatedAt": "2026-02-06T12:00:00.000Z"
}
```

## Glossário

- `templateType`: modo de preenchimento do template.
- `units`: unidades disponíveis e sua ordem fixa.
- `values`: matriz alinhada com `units` (cada linha é uma variação).
