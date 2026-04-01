/// <reference types="chrome" />

import { normalizeNumber, normalizeString } from '../normalize'

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
  enabledByUser: boolean
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
    enabledByUser: candidate.enabledByUser !== false,
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
    enabledByUser,
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

  return nextRecord
}

export async function upsertWorldPlayer({
  world,
  playerId,
  playerName,
  avatarUrl,
  scopeKey,
}: {
  world?: string | null
  playerId?: number | null
  playerName?: string | null
  avatarUrl?: string | null
  scopeKey?: string | null
}) {
  const normalizedWorld = normalizeString(world)
  const normalizedPlayerId = normalizeNumber(playerId)
  const normalizedPlayerName = normalizeString(playerName) ?? null
  const normalizedAvatarUrl = normalizeString(avatarUrl) ?? null
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
    enabledByUser: previousRecord?.enabledByUser ?? false,
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

  return nextRecord
}
