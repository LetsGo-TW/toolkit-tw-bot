# toolkit-tw-bot

## Desenvolvimento local

O backend agora carrega env por ambiente nesta ordem:

- `.env`
- `.env.local`
- `.env.<NODE_ENV>`
- `.env.<NODE_ENV>.local`

Em `development` e `test`, conexoes remotas com MongoDB ficam bloqueadas por padrao. Para desenvolvimento local, use o Mongo do `docker-compose.yml`.

### Setup rapido

```bash
cp apps/api/.env.development.exemple apps/api/.env.development
yarn db:dev:up
yarn dev
```

O exemplo de desenvolvimento ja usa a porta `4568` para evitar colisao com a `4567` de producao.

### Arquivos de ambiente

- `apps/api/.env.development`
- `apps/api/.env.test`
- `apps/api/.env.production`

### Banco em desenvolvimento

Por padrao, `development` usa:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/toolkit_tw_bot_dev
```

Se voce realmente quiser apontar `development` ou `test` para um banco remoto, precisa optar explicitamente:

```env
ALLOW_REMOTE_DB_IN_NON_PROD=true
```

## Backup local

O backup de players agora roda por um entrypoint estavel do monorepo:

```bash
yarn backup:players
```

Por padrao, ele usa `NODE_ENV=production` quando nenhum ambiente e informado e salva em:

```text
data/backups/players
```

Se quiser salvar em outra pasta local, defina `BACKUP_DIR` em `apps/api/.env.production` ou na shell:

```env
BACKUP_DIR=D:\Backups\toolkit-tw-bot
BACKUP_MAX_FILES=7
```

### Windows Task Scheduler

No Agendador de Tarefas, prefira chamar a raiz do monorepo em vez de apontar para um arquivo interno:

Programa/script:

```text
cmd.exe
```

Adicionar argumentos:

```text
/c cd /d C:\caminho\para\toolkit-tw-bot && yarn backup:players
```

Assim, mudancas internas de pasta como `api` ou `apps/ops` nao quebram a tarefa agendada.

## Restore para dev com Docker

Para subir o Mongo local e restaurar o ultimo backup disponível no banco de desenvolvimento:

```bash
yarn db:dev:up:restore
```

Esse fluxo:

- sobe o `mongo:7` local via `docker compose`
- conecta no banco `toolkit_tw_bot_dev`
- procura o backup mais recente em `data/backups/players`
- restaura apenas se a coleção `players` estiver vazia

Depois disso, suba a API normalmente:

```bash
yarn dev
```

Se seus backups estiverem em outro diretório, defina em `apps/api/.env.development`:

```env
BACKUP_SOURCE_DIR=/mnt/d/Backups/toolkit-tw-bot
```

Se quiser forçar a restauração mesmo com dados já existentes:

```bash
RESTORE_FORCE=true yarn db:dev:restore:players:latest
```

## Scripts operacionais de banco

Os scripts locais de manutencao e recuperacao sairam da API e agora ficam em `apps/ops/src/db`.

Para o guia operacional consolidado, veja [`apps/ops/README.md`](apps/ops/README.md).

Comandos mais usados:

```bash
yarn db:inspect
yarn db:cleanup:expired
yarn db:cleanup:duplicates
yarn db:check:id --id=69160a354bdc9358e7874b82
yarn db:restore:data-file
yarn db:data:scan:expired
yarn db:data:scan:month
yarn db:data:search:id --id=69160a354bdc9358e7874b82
```

Observacoes:

- `db:cleanup:expired` e `db:cleanup:duplicates` usam `DRY_RUN=true` por padrao
- para apagar de fato, rode com `DRY_RUN=false`
- `db:restore:data-file` usa `apps/ops/data/db/data.json`
