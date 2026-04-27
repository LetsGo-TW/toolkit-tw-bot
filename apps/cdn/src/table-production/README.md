# Table-Production (TP)

## Regras de funcionamento

1. O TP é responsável pela própria atualização e persistência.
2. O TP atualiza por tempo (TTL) ou quando a quantidade de vilas muda.
3. Quem chama TP pode exigir dados frescos (`forceRefresh: true`).
4. A atualização pode ser:
   - Completa: `groupId = 0`
   - Parcial: `groupId != 0`

## API pública

Função pública:

```js
getTableProduction({
  groupId: 0,
  useWorker: true,
  seasonSeconds: 180,
  forceRefresh: false,
  baseUrl: null
})
```

Parâmetros:

- `groupId`: grupo de vilas (`0` = todas)
- `useWorker`: tenta processamento em worker (com fallback)
- `seasonSeconds`: TTL do cache em segundos
- `forceRefresh`: ignora cache e força atualização
- `baseUrl`: base do prepared/CDN; se omitido, usa a base exposta pelo runtime

## Persistência

Persistência local de cache via IndexedDB da página:

- DB: `toolkit_table_production`
- Store: `keyval`
- Chaves:
  - `table-production:entries`
  - `table-production:next-update`

## Observação de alinhamento

- Se a regra oficial for **3 minutos**, usar `seasonSeconds: 180`.
- Sem valor explícito, o TP usa o default interno atual.

## Worker

- O worker é carregado do próprio CDN Toolkit.
- O `worker-client` resolve a base por `baseUrl` ou `window.__toolkitTwBotPreparedBaseUrl__`.
- Se o worker não puder ser criado, o controller cai para fallback sem worker.

## Status atual

- Contrato de worker alinhado ao Toolkit.
- Cache persistido no IndexedDB da própria página.
- Sem restore de grupo.
