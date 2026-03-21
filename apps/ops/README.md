# Ops

Ferramentas operacionais do monorepo.

Este app concentra rotinas que nao fazem parte do runtime HTTP da API:

- backup do banco
- restore do ultimo backup para desenvolvimento
- manutencao operacional da colecao `players`
- scripts de recuperacao e analise de dumps locais

## Uso diario

Gerar backup do banco real:

```bash
cd /home/cleziomarcos/projects/toolkit-tw-bot
yarn backup:players
```

Subir Mongo local no Docker:

```bash
cd /home/cleziomarcos/projects/toolkit-tw-bot
yarn db:dev:up
```

Restaurar o ultimo backup no banco local de desenvolvimento:

```bash
cd /home/cleziomarcos/projects/toolkit-tw-bot
yarn db:dev:restore:players:latest
```

Subir Mongo local e restaurar em seguida:

```bash
cd /home/cleziomarcos/projects/toolkit-tw-bot
yarn db:dev:up:restore
```

Observacoes:

- `backup:players` usa `NODE_ENV=production` por padrao quando o ambiente nao e informado.
- `db:dev:restore:players:latest` so permite `development` e `test`.
- o restore nao sobrescreve dados existentes, a menos que voce rode com `RESTORE_FORCE=true`.

## Backup

O backup gera arquivos JSON com este formato:

```text
players.<db>.YYYY-MM-DD.json
```

Destino padrao:

```text
/home/cleziomarcos/projects/toolkit-tw-bot/data/backups/players
```

Variaveis uteis:

- `BACKUP_DIR`: muda o diretorio de saida
- `BACKUP_MAX_FILES`: define quantos backups manter; padrao `7`
- `BACKUP_SOURCE_DIR`: muda de onde o restore le os backups

## Manutencao

Esses comandos existem porque o app nativo nao cobre toda a manutencao operacional do banco.

Inspecao rapida da colecao `players`:

```bash
cd /home/cleziomarcos/projects/toolkit-tw-bot
NODE_ENV=development yarn db:inspect
```

Checar um `_id` especifico:

```bash
cd /home/cleziomarcos/projects/toolkit-tw-bot
NODE_ENV=development yarn db:check:id --id=69160a354bdc9358e7874b82
```

Listar e revisar vencidos:

```bash
cd /home/cleziomarcos/projects/toolkit-tw-bot
NODE_ENV=development yarn db:cleanup:expired
```

Listar e revisar duplicados:

```bash
cd /home/cleziomarcos/projects/toolkit-tw-bot
NODE_ENV=development yarn db:cleanup:duplicates
```

Observacao:

- os scripts de cleanup usam `DRY_RUN=true` por padrao; revise o arquivo/script antes de executar qualquer remocao real.

## Dumps Locais

Os arquivos auxiliares de dump ficam em:

```text
/home/cleziomarcos/projects/toolkit-tw-bot/apps/ops/data/db
```

Comandos relacionados:

```bash
cd /home/cleziomarcos/projects/toolkit-tw-bot
yarn db:restore:data-file
yarn db:data:scan:expired
yarn db:data:scan:month
yarn db:data:search:id --id=69160a354bdc9358e7874b82
```

## Estrutura

```text
apps/ops/
  README.md
  data/db/
  src/
    backup-players.js
    restore-players-latest.js
    db/
```
