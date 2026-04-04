/// <reference types="chrome" />

import { normalizeNumber, normalizeString } from '../normalize'
import { syncWorldPlayerContexts } from '../context-db'

const WORLD_PLAYERS_STORAGE_KEY = 'worldPlayers'

export type WorldPlayerLicenseRecord = {
  id: string | null
  token: string | null
}

export type WorldPlayerRecord = {
  world: string
  playerId: number
  playerName: string | null
  avatarUrl: string | null
  avatarUpdatedAt: string | null
  dateStarted: number | null
  enabledByUser: boolean
  reconnectOnSessionExpired: boolean
  scopeKey: string | null
  license: WorldPlayerLicenseRecord
  updatedAt: string
}

type WorldPlayersByKey = Record<string, WorldPlayerRecord>

let cacheLoaded = false
let worldPlayersCache: WorldPlayersByKey = {}

function normalizeWorldPlayerLicenseRecord(value: unknown): WorldPlayerLicenseRecord {
  if (!value || typeof value !== 'object') {
    return {
      id: null,
      token: null,
    }
  }

  const candidate = value as Partial<WorldPlayerLicenseRecord>

  return {
    id: normalizeString(candidate.id) ?? null,
    token: normalizeString(candidate.token) ?? null,
  }
}

function normalizeWorldPlayerRecord(value: unknown): WorldPlayerRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<WorldPlayerRecord>
  const world = normalizeString(candidate.world)
  const playerId = normalizeNumber(candidate.playerId)

  if (!world || playerId === null) {
    return null
  }

  return {
    world,
    playerId,
    playerName: normalizeString(candidate.playerName) ?? null,
    avatarUrl: normalizeString((candidate as { avatarUrl?: unknown }).avatarUrl) ?? null,
    avatarUpdatedAt: normalizeString((candidate as { avatarUpdatedAt?: unknown }).avatarUpdatedAt) ?? null,
    dateStarted: normalizeNumber((candidate as { dateStarted?: unknown }).dateStarted),
    enabledByUser: candidate.enabledByUser !== false,
    reconnectOnSessionExpired: candidate.reconnectOnSessionExpired === true,
    scopeKey: normalizeString(candidate.scopeKey) ?? null,
    license: normalizeWorldPlayerLicenseRecord(candidate.license),
    updatedAt: normalizeString(candidate.updatedAt) ?? new Date().toISOString(),
  }
}

function normalizeWorldPlayersByKey(value: unknown): WorldPlayersByKey {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, record]) => [key, normalizeWorldPlayerRecord(record)] as const)
      .filter((entry): entry is [string, WorldPlayerRecord] => entry[1] !== null),
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

async function persistWorldPlayers(
  previous: WorldPlayersByKey,
  next: WorldPlayersByKey,
) {
  await persistStateIfChanged(WORLD_PLAYERS_STORAGE_KEY, previous, next)
}

async function syncWorldPlayerContextsSafely(record: WorldPlayerRecord) {
  try {
    await syncWorldPlayerContexts(record)
  } catch (error) {
    console.warn('[SW][IndexedDB] failed to sync world player contexts', {
      world: record.world,
      playerId: record.playerId,
      error,
    })
  }
}

export function getWorldPlayerKey(
  world?: string | null,
  playerId?: number | null,
) {
  if (!world || typeof playerId !== 'number' || !Number.isFinite(playerId)) {
    return null
  }

  return `${world}:${playerId}`
}

export async function ensureWorldPlayersLoaded() {
  if (cacheLoaded) {
    return
  }

  const stored = await chrome.storage.local.get([WORLD_PLAYERS_STORAGE_KEY])

  worldPlayersCache = normalizeWorldPlayersByKey(stored[WORLD_PLAYERS_STORAGE_KEY])
  cacheLoaded = true
}

export function getWorldPlayer(
  world?: string | null,
  playerId?: number | null,
) {
  const key = getWorldPlayerKey(world, playerId)

  if (!key) {
    return null
  }

  return worldPlayersCache[key] || null
}

export function getWorldPlayerByScopeKey(scopeKey?: string | null) {
  if (!scopeKey) {
    return null
  }

  return Object.values(worldPlayersCache)
    .find((record) => record.scopeKey === scopeKey) || null
}

export async function setWorldPlayerEnabledByUser({
  world,
  playerId,
  enabledByUser,
}: {
  world?: string | null
  playerId?: number | null
  enabledByUser: boolean
}) {
  const normalizedWorld = normalizeString(world)
  const normalizedPlayerId = normalizeNumber(playerId)
  const worldPlayerKey = getWorldPlayerKey(normalizedWorld, normalizedPlayerId)

  if (!normalizedWorld || normalizedPlayerId === null || !worldPlayerKey) {
    return null
  }

  await ensureWorldPlayersLoaded()

  const previousRecord = worldPlayersCache[worldPlayerKey] || null
  const nextRecord: WorldPlayerRecord = {
    world: normalizedWorld,
    playerId: normalizedPlayerId,
    playerName: previousRecord?.playerName ?? null,
    avatarUrl: previousRecord?.avatarUrl ?? null,
    avatarUpdatedAt: previousRecord?.avatarUpdatedAt ?? null,
    dateStarted: previousRecord?.dateStarted ?? null,
    enabledByUser,
    reconnectOnSessionExpired: previousRecord?.reconnectOnSessionExpired ?? false,
    scopeKey: previousRecord?.scopeKey ?? null,
    license: previousRecord?.license ?? {
      id: null,
      token: null,
    },
    updatedAt: new Date().toISOString(),
  }

  const previousCache = worldPlayersCache
  const nextCache = {
    ...previousCache,
    [worldPlayerKey]: nextRecord,
  }

  worldPlayersCache = nextCache
  await persistWorldPlayers(previousCache, nextCache)
  await syncWorldPlayerContextsSafely(nextRecord)

  return nextRecord
}

export async function setWorldPlayerReconnectOnSessionExpired({
  world,
  playerId,
  reconnectOnSessionExpired,
}: {
  world?: string | null
  playerId?: number | null
  reconnectOnSessionExpired: boolean
}) {
  const normalizedWorld = normalizeString(world)
  const normalizedPlayerId = normalizeNumber(playerId)
  const worldPlayerKey = getWorldPlayerKey(normalizedWorld, normalizedPlayerId)

  if (!normalizedWorld || normalizedPlayerId === null || !worldPlayerKey) {
    return null
  }

  await ensureWorldPlayersLoaded()

  const previousRecord = worldPlayersCache[worldPlayerKey] || null
  const nextRecord: WorldPlayerRecord = {
    world: normalizedWorld,
    playerId: normalizedPlayerId,
    playerName: previousRecord?.playerName ?? null,
    avatarUrl: previousRecord?.avatarUrl ?? null,
    avatarUpdatedAt: previousRecord?.avatarUpdatedAt ?? null,
    dateStarted: previousRecord?.dateStarted ?? null,
    enabledByUser: previousRecord?.enabledByUser ?? false,
    reconnectOnSessionExpired,
    scopeKey: previousRecord?.scopeKey ?? null,
    license: previousRecord?.license ?? {
      id: null,
      token: null,
    },
    updatedAt: new Date().toISOString(),
  }

  const previousCache = worldPlayersCache
  const nextCache = {
    ...previousCache,
    [worldPlayerKey]: nextRecord,
  }

  worldPlayersCache = nextCache
  await persistWorldPlayers(previousCache, nextCache)
  await syncWorldPlayerContextsSafely(nextRecord)

  return nextRecord
}

export async function upsertWorldPlayer({
  world,
  playerId,
  playerName,
  avatarUrl,
  avatarUpdatedAt,
  dateStarted,
  scopeKey,
}: {
  world?: string | null
  playerId?: number | null
  playerName?: string | null
  avatarUrl?: string | null
  avatarUpdatedAt?: string | null
  dateStarted?: number | null
  scopeKey?: string | null
}) {
  const normalizedWorld = normalizeString(world)
  const normalizedPlayerId = normalizeNumber(playerId)
  const normalizedPlayerName = normalizeString(playerName) ?? null
  const normalizedAvatarUrl = normalizeString(avatarUrl) ?? null
  const normalizedAvatarUpdatedAt = normalizeString(avatarUpdatedAt) ?? null
  const normalizedDateStarted = normalizeNumber(dateStarted)
  const normalizedScopeKey = normalizeString(scopeKey) ?? null
  const worldPlayerKey = getWorldPlayerKey(normalizedWorld, normalizedPlayerId)

  if (!normalizedWorld || normalizedPlayerId === null || !worldPlayerKey) {
    return null
  }

  await ensureWorldPlayersLoaded()

  const previousRecord = worldPlayersCache[worldPlayerKey] || null
  const nextRecord: WorldPlayerRecord = {
    world: normalizedWorld,
    playerId: normalizedPlayerId,
    playerName: normalizedPlayerName ?? previousRecord?.playerName ?? null,
    avatarUrl: normalizedAvatarUrl ?? previousRecord?.avatarUrl ?? null,
    avatarUpdatedAt: normalizedAvatarUpdatedAt ?? previousRecord?.avatarUpdatedAt ?? null,
    dateStarted: normalizedDateStarted ?? previousRecord?.dateStarted ?? null,
    enabledByUser: previousRecord?.enabledByUser ?? false,
    reconnectOnSessionExpired: previousRecord?.reconnectOnSessionExpired ?? false,
    scopeKey: normalizedScopeKey ?? previousRecord?.scopeKey ?? null,
    license: previousRecord?.license ?? {
      id: null,
      token: null,
    },
    updatedAt: new Date().toISOString(),
  }

  const previousCache = worldPlayersCache
  const nextCache = {
    ...previousCache,
    [worldPlayerKey]: nextRecord,
  }

  worldPlayersCache = nextCache
  await persistWorldPlayers(previousCache, nextCache)
  await syncWorldPlayerContextsSafely(nextRecord)

  return nextRecord
}
