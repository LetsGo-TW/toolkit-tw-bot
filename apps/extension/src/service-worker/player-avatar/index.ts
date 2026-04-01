/// <reference types="chrome" />

const PLAYER_AVATAR_BY_SCOPE_KEY_STORAGE_KEY = 'playerAvatarByScopeKey'

export type PlayerAvatarRecord = {
  scopeKey: string
  world: string
  playerId: number
  avatarUrl: string | null
  updatedAt: string
}

type PlayerAvatarByScopeKey = Record<string, PlayerAvatarRecord>

let cacheLoaded = false
let playerAvatarByScopeKeyCache: PlayerAvatarByScopeKey = {}

function normalizePlayerAvatarRecord(value: unknown): PlayerAvatarRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Partial<PlayerAvatarRecord>

  if (
    typeof record.scopeKey !== 'string'
    || typeof record.world !== 'string'
    || typeof record.playerId !== 'number'
    || !Number.isFinite(record.playerId)
    || typeof record.updatedAt !== 'string'
  ) {
    return null
  }

  return {
    scopeKey: record.scopeKey,
    world: record.world,
    playerId: record.playerId,
    avatarUrl: typeof record.avatarUrl === 'string' ? record.avatarUrl : null,
    updatedAt: record.updatedAt,
  }
}

function normalizePlayerAvatarByScopeKey(value: unknown): PlayerAvatarByScopeKey {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([scopeKey, record]) => {
        const normalizedRecord = normalizePlayerAvatarRecord(record)

        return normalizedRecord ? [scopeKey, normalizedRecord] : null
      })
      .filter(Boolean) as Array<[string, PlayerAvatarRecord]>,
  )
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

async function persistPlayerAvatarByScopeKey(
  previous: PlayerAvatarByScopeKey,
  next: PlayerAvatarByScopeKey,
) {
  await persistStateIfChanged(PLAYER_AVATAR_BY_SCOPE_KEY_STORAGE_KEY, previous, next)
}

export function getPlayerAvatarScopeKey(world: string, playerId: number) {
  return `${world}:${playerId}`
}

export async function ensurePlayerAvatarLoaded() {
  if (cacheLoaded) {
    return
  }

  const stored = await chrome.storage.local.get([PLAYER_AVATAR_BY_SCOPE_KEY_STORAGE_KEY])

  playerAvatarByScopeKeyCache = normalizePlayerAvatarByScopeKey(
    stored[PLAYER_AVATAR_BY_SCOPE_KEY_STORAGE_KEY],
  )
  cacheLoaded = true
}

export function getPlayerAvatar(
  world?: string | null,
  playerId?: number | null,
) {
  if (!world || typeof playerId !== 'number' || !Number.isFinite(playerId)) {
    return null
  }

  return playerAvatarByScopeKeyCache[getPlayerAvatarScopeKey(world, playerId)] || null
}

export async function setPlayerAvatar({
  world,
  playerId,
  avatarUrl,
}: {
  world: string
  playerId: number
  avatarUrl?: string | null
}) {
  await ensurePlayerAvatarLoaded()

  const scopeKey = getPlayerAvatarScopeKey(world, playerId)
  const previousCache = playerAvatarByScopeKeyCache
  const nextRecord: PlayerAvatarRecord = {
    scopeKey,
    world,
    playerId,
    avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : null,
    updatedAt: new Date().toISOString(),
  }
  const nextCache = {
    ...previousCache,
    [scopeKey]: nextRecord,
  }

  playerAvatarByScopeKeyCache = nextCache
  await persistPlayerAvatarByScopeKey(previousCache, nextCache)

  return nextRecord
}

export { PLAYER_AVATAR_BY_SCOPE_KEY_STORAGE_KEY }
