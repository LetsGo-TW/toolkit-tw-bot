/// <reference types="chrome" />

const ENABLED_BY_USER_BY_PLAYER_ID_STORAGE_KEY = 'enabledByUserByPlayerId'

type EnabledByUserByPlayerId = Record<string, boolean>

let cacheLoaded = false
let enabledByUserByPlayerIdCache: EnabledByUserByPlayerId = {}

function normalizeEnabledByUserByPlayerId(value: unknown): EnabledByUserByPlayerId {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return value as EnabledByUserByPlayerId
}

async function persistStateIfChanged(
  key: string,
  previousValue: unknown,
  nextValue: unknown,
) {
  if (JSON.stringify(previousValue) === JSON.stringify(nextValue)) {
    return
  }

  await chrome.storage.local.set({
    [key]: nextValue,
  })
}

async function persistEnabledByUserByPlayerId(
  previous: EnabledByUserByPlayerId,
  next: EnabledByUserByPlayerId,
) {
  await persistStateIfChanged(ENABLED_BY_USER_BY_PLAYER_ID_STORAGE_KEY, previous, next)
}

export async function ensureEnabledByUserLoaded() {
  if (cacheLoaded) {
    return
  }

  const stored = await chrome.storage.local.get([ENABLED_BY_USER_BY_PLAYER_ID_STORAGE_KEY])

  enabledByUserByPlayerIdCache = normalizeEnabledByUserByPlayerId(
    stored[ENABLED_BY_USER_BY_PLAYER_ID_STORAGE_KEY],
  )
  cacheLoaded = true
}

export function getPlayerEnabledByUser(playerId?: number | null) {
  if (typeof playerId !== 'number' || !Number.isFinite(playerId)) {
    return false
  }

  const playerKey = String(playerId)

  if (!Object.hasOwn(enabledByUserByPlayerIdCache, playerKey)) {
    return true
  }

  return enabledByUserByPlayerIdCache[playerKey] === true
}

export async function ensurePlayerEnabledByUserRecord(playerId?: number | null) {
  if (typeof playerId !== 'number' || !Number.isFinite(playerId)) {
    return false
  }

  const playerKey = String(playerId)

  if (Object.hasOwn(enabledByUserByPlayerIdCache, playerKey)) {
    return enabledByUserByPlayerIdCache[playerKey] === true
  }

  const previousCache = enabledByUserByPlayerIdCache
  const nextCache = {
    ...previousCache,
    [playerKey]: true,
  }

  enabledByUserByPlayerIdCache = nextCache
  await persistEnabledByUserByPlayerId(previousCache, nextCache)

  return true
}

export async function setPlayerEnabledByUserByPlayerId(
  playerId: number,
  enabledByUser: boolean,
) {
  const playerKey = String(playerId)
  const previousCache = enabledByUserByPlayerIdCache

  if (previousCache[playerKey] === enabledByUser) {
    return false
  }

  const nextCache = {
    ...previousCache,
    [playerKey]: enabledByUser,
  }

  enabledByUserByPlayerIdCache = nextCache
  await persistEnabledByUserByPlayerId(previousCache, nextCache)

  return true
}
