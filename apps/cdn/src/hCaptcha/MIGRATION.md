# hCaptcha Migration Checklist

## Goal

Bring `hCaptcha` from STABLE into Toolkit without copying legacy dependencies blindly.

Migration rule:

- `CDN`: page runtime, DOM detection, iframe bridge, lightweight UI
- `Extension/SW`: persistence, critical decisions, backend calls, durable state
- `packages/*`: reusable generic utilities only

## Current Files

- [index.js](/home/cleziomarcos/projects/toolkit-tw-bot/apps/cdn/src/hCaptcha/index.js)
- [run/index.js](/home/cleziomarcos/projects/toolkit-tw-bot/apps/cdn/src/hCaptcha/run/index.js)
- [Show/index.js](/home/cleziomarcos/projects/toolkit-tw-bot/apps/cdn/src/hCaptcha/Show/index.js)
- [Config/index.js](/home/cleziomarcos/projects/toolkit-tw-bot/apps/cdn/src/hCaptcha/Config/index.js)
- [ReportSession/index.js](/home/cleziomarcos/projects/toolkit-tw-bot/apps/cdn/src/hCaptcha/ReportSession/index.js)
- [i18n/index.js](/home/cleziomarcos/projects/toolkit-tw-bot/apps/cdn/src/hCaptcha/i18n/index.js)

## Already In Toolkit

- [getGameData](/home/cleziomarcos/projects/toolkit-tw-bot/packages/document/src/get-game-data.js)
- [ProtectingBot](/home/cleziomarcos/projects/toolkit-tw-bot/packages/document/src/protecting-bot/index.js)
- [random](/home/cleziomarcos/projects/toolkit-tw-bot/packages/core/src/random.js)
- Native click bridge:
  - [solver/index.js](/home/cleziomarcos/projects/toolkit-tw-bot/apps/extension/src/content-scripts/vanilla/isolated/all-frames/idle/solver/index.js)
  - [native.ts](/home/cleziomarcos/projects/toolkit-tw-bot/apps/extension/src/service-worker/message/native.ts)

## Must Move To Extension

These should not stay in CDN as persistent local state:

- `StorageLocal`
- captcha backoff
- failure blocks
- script config state

Suggested records in extension IndexedDB:

- `world:${world}:player:${playerId}:hcaptcha:config`
- `world:${world}:player:${playerId}:hcaptcha:backoff`
- `world:${world}:player:${playerId}:hcaptcha:failure-blocks`
- `world:${world}:player:${playerId}:hcaptcha:report-session`

## Likely Rebuild, Not Copy

- `notification`
- `printTimer`
- `printMsg`
- `printMessage`
- `sendNotify`
- `Sounds`
- `createReportView`
- `svgToDataUri`
- `useGoTiming`
- date/time helpers from legacy `general/*`

These are secondary. Do not block first runtime migration on them.

## Checklist

- [ ] Keep [index.js](/home/cleziomarcos/projects/toolkit-tw-bot/apps/cdn/src/hCaptcha/index.js) as thin entrypoint only.
- [ ] Make [run/index.js](/home/cleziomarcos/projects/toolkit-tw-bot/apps/cdn/src/hCaptcha/run/index.js) depend on extension storage bridge instead of `StorageLocal`.
- [ ] Replace `sessionStorage` usage in `run` with:
  - in-page ephemeral state when truly local to the page
  - extension storage when it must survive reloads
- [ ] Keep `__GO_SC__` iframe bridge only for captcha runtime events.
- [ ] Keep native click in extension only.
- [ ] Move all persistent config to extension IndexedDB.
- [ ] Create one SW message type for script storage.
- [ ] Make SW build `_id` from structured fields, not a prebuilt key.
- [ ] Start with `hcaptcha` namespace only; generalize later if the shape proves stable.
- [ ] Migrate `ReportSession` with minimal data first, visual report later.
- [ ] Delay notifications/sounds until solver runtime is stable.

## Suggested Message Contract

Use one storage message in the extension:

```ts
{
  type: 'SCRIPT_STORAGE',
  action: 'get' | 'put' | 'delete',
  world: 'br134',
  playerId: 809009,
  path: ['hcaptcha', 'config'],
  data?: unknown,
}
```

Suggested `_id` format built by SW:

```txt
world:br134:player:809009:hcaptcha:config
```

With item id:

```txt
world:br134:player:809009:hcaptcha:attempt:00001
```

## Migration Order

1. Make `hCaptcha` run with Toolkit runtime + native click only.
2. Replace persistent storage with extension IndexedDB.
3. Reintroduce backoff and failure tracking.
4. Reintroduce report session.
5. Reintroduce optional UI, notifications, and sounds.

## Rule For Each Missing Dependency

Ask these in order:

1. Is it persistent state?
   Move to extension.

2. Is it a critical decision or secret?
   Move to extension/SW.

3. Is it page DOM behavior?
   Keep in CDN.

4. Is it generic and reusable?
   Move to `packages/*`.

5. Is it cosmetic?
   Defer.
