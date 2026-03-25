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

## Release, CDN e extensao

Os metadados centrais de release ficam em [`packages/release/src/index.js`](packages/release/src/index.js).

Hoje esse arquivo define:

- `compatVersion`
- `extensionVersion`
- `cdnVersion`
- `assetBasePath`
- nome base do zip da extensao

O caminho publico dos assets do CDN e derivado de `compatVersion`:

```text
/cdn/<compatVersion>
```

Exemplo atual:

```text
/cdn/2.0
```

Isso permite manter a compatibilidade entre extensao e scripts do CDN usando a versao de compatibilidade como namespace publico.

### Build de artefatos

Para buildar CDN e extensao:

```bash
yarn build:assets
```

Para buildar so um dos dois:

```bash
yarn build:assets --only=cdn
yarn build:assets --only=extension
```

Para buildar em desenvolvimento:

```bash
yarn build:assets --env=dev
```

O script da raiz usado por esses comandos e:

```text
scripts/build-assets.sh
```

### Publicacao do CDN

O publish do CDN e separado do build. O script copia `apps/cdn/dist` para um destino versionado por `compatVersion`.

Destino na API/origin:

```text
apps/api/src/public/cdn/<compatVersion>
```

Comando:

```bash
yarn publish:cdn
```

Modos nao interativos:

```bash
yarn publish:cdn --target=api
yarn publish:cdn --target=cdn --cdn-dir=/caminho/do/cdn
yarn publish:cdn --target=both --cdn-dir=/caminho/do/cdn
```

Observacoes:

- `build` gera artefato, nao decide destino
- `publish` decide se copia para API, CDN externo ou ambos
- o caminho publico esperado dos scripts continua sendo `/cdn/<compatVersion>`

### Zip da extensao

O zip da extensao e gerado a partir de `apps/extension/dist` e usa o nome derivado de `packages/release/src/index.js`.

Comando:

```bash
yarn zip:extension
```

Destino padrao:

```text
apps/api/src/public/downloads
```

Se quiser outro destino local, use:

```bash
ZIP_DEST_DIR=/caminho/de/saida yarn zip:extension
```

### Manifest da extensao

O template base do manifest fica em:

```text
apps/extension/manifest/version3.json
```

O `manifest.json` final e gerado no build da extensao.

Partes geradas automaticamente:

- `version` a partir de `@toolkit-tw-bot/release`
- `background.service_worker`
- `action.default_popup`
- `content_scripts` a partir de `apps/extension/entries/entries.js`

Ou seja:

- `version3.json` deve conter apenas campos estaticos do manifest
- `entries.js` define o que vira bundle e o que entra no manifest

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
