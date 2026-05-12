/// <reference types="chrome" />

import { createIndexedDbDocStore } from '@toolkit-tw-bot/browser/indexedDb'
import { SERVICE_WORKER_DB_NAME, SERVICE_WORKER_DB_VERSION } from '../indexdb/constants'
import { normalizeNumber, normalizeString } from '../normalize'

const RECONNECT_RUNTIME_STATE_STORE_NAME = 'reconnect-runtime-state'
const RECONNECT_RUNTIME_STATE_KIND = 'reconnect-runtime-state'

export const RECONNECT_RUNTIME_REASONS = Object.freeze({
  SESSION_EXPIRED: 'session-expired',
  SHORT_BREAK: 'short-break',
  LONG_REST: 'long-rest',
})

export type ReconnectRuntimeReason =
  typeof RECONNECT_RUNTIME_REASONS[keyof typeof RECONNECT_RUNTIME_REASONS]

export type ReconnectRuntimeState = {
  activeLoginSeenAt: number | null
  activePlannedAt: number | null
  activeReason: ReconnectRuntimeReason | null
  activeReconnectAt: number | null
  longRestAnchorAt: number | null
  lastLongRestStartedAt: number | null
  playerId: number | null
  scopeKey: string
  world: string | null
}

type ReconnectRuntimeStateRecord = ReconnectRuntimeState & {
  _id: string
  createdAt: string
  kind: typeof RECONNECT_RUNTIME_STATE_KIND
  updatedAt: string
}

const reconnectRuntimeStateStore = createIndexedDbDocStore<ReconnectRuntimeStateRecord>({
  dbName: SERVICE_WORKER_DB_NAME,
  indexes: [
    {
      keyPath: 'kind',
      name: 'kind',
      unique: false,
    },
  ],
  storeName: RECONNECT_RUNTIME_STATE_STORE_NAME,
  version: SERVICE_WORKER_DB_VERSION,
})

let cacheLoaded = false
let reconnectRuntimeStateCache: Record<string, ReconnectRuntimeStateRecord> = {}

function cloneReconnectRuntimeState(
  state?: ReconnectRuntimeStateRecord | ReconnectRuntimeState | null,
): ReconnectRuntimeState | null {
  if (!state) {
    return null
  }

  return {
    activeLoginSeenAt: state.activeLoginSeenAt ?? null,
    activePlannedAt: state.activePlannedAt ?? null,
    activeReason: state.activeReason ?? null,
    activeReconnectAt: state.activeReconnectAt ?? null,
    longRestAnchorAt: state.longRestAnchorAt ?? null,
    lastLongRestStartedAt: state.lastLongRestStartedAt ?? null,
    playerId: state.playerId ?? null,
    scopeKey: state.scopeKey,
    world: state.world ?? null,
  }
}

function normalizeReconnectRuntimeReason(value: unknown): ReconnectRuntimeReason | null {
  return value === RECONNECT_RUNTIME_REASONS.SESSION_EXPIRED
    || value === RECONNECT_RUNTIME_REASONS.SHORT_BREAK
    || value === RECONNECT_RUNTIME_REASONS.LONG_REST
    ? value
    : null
}

function getReconnectRuntimeStateKey(scopeKey?: string | null) {
  const normalizedScopeKey = normalizeString(scopeKey)

  return normalizedScopeKey
    ? `reconnect-runtime:scope:${normalizedScopeKey}`
    : null
}

function normalizeReconnectRuntimeStateRecord(
  value: unknown,
): ReconnectRuntimeStateRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Partial<ReconnectRuntimeStateRecord>
  const scopeKey = normalizeString(candidate.scopeKey)
  const _id = normalizeString(candidate._id)

  if (!scopeKey || !_id) {
    return null
  }

  return {
    _id,
    activeLoginSeenAt: normalizeNumber(candidate.activeLoginSeenAt),
    activePlannedAt: normalizeNumber(candidate.activePlannedAt),
    activeReason: normalizeReconnectRuntimeReason(candidate.activeReason),
    activeReconnectAt: normalizeNumber(candidate.activeReconnectAt),
    createdAt: normalizeString(candidate.createdAt) ?? new Date().toISOString(),
    kind: RECONNECT_RUNTIME_STATE_KIND,
    longRestAnchorAt: normalizeNumber(candidate.longRestAnchorAt),
    lastLongRestStartedAt: normalizeNumber(candidate.lastLongRestStartedAt),
    playerId: normalizeNumber(candidate.playerId),
    scopeKey,
    updatedAt: normalizeString(candidate.updatedAt) ?? new Date().toISOString(),
    world: normalizeString(candidate.world),
  }
}

function createEmptyReconnectRuntimeState({
  scopeKey,
  world = null,
  playerId = null,
}: {
  scopeKey: string
  world?: string | null
  playerId?: number | null
}): ReconnectRuntimeState {
  return {
    activeLoginSeenAt: null,
    activePlannedAt: null,
    activeReason: null,
    activeReconnectAt: null,
    longRestAnchorAt: null,
    lastLongRestStartedAt: null,
    playerId: normalizeNumber(playerId),
    scopeKey,
    world: normalizeString(world),
  }
}

async function putReconnectRuntimeStateRecord(
  state: ReconnectRuntimeState,
) {
  const key = getReconnectRuntimeStateKey(state.scopeKey)

  if (!key) {
    return null
  }

  await ensureReconnectRuntimeStateLoaded()

  const previousRecord = reconnectRuntimeStateCache[key] || null
  const now = new Date().toISOString()
  const nextRecord: ReconnectRuntimeStateRecord = {
    _id: key,
    createdAt: previousRecord?.createdAt ?? now,
    kind: RECONNECT_RUNTIME_STATE_KIND,
    updatedAt: now,
    ...createEmptyReconnectRuntimeState({
      scopeKey: state.scopeKey,
      world: state.world,
      playerId: state.playerId,
    }),
    ...cloneReconnectRuntimeState(state),
  }

  reconnectRuntimeStateCache = {
    ...reconnectRuntimeStateCache,
    [key]: nextRecord,
  }
  await reconnectRuntimeStateStore.put(nextRecord)

  return nextRecord
}

export async function ensureReconnectRuntimeStateLoaded() {
  if (cacheLoaded) {
    return
  }

  const stored = await reconnectRuntimeStateStore.getAll()

  reconnectRuntimeStateCache = Object.fromEntries(
    stored
      .map((record) => normalizeReconnectRuntimeStateRecord(record))
      .filter((record): record is ReconnectRuntimeStateRecord => record !== null)
      .map((record) => [record._id, record] as const),
  )
  cacheLoaded = true
}

export async function getReconnectRuntimeState(
  scopeKey?: string | null,
) {
  const key = getReconnectRuntimeStateKey(scopeKey)

  if (!key) {
    return null
  }

  await ensureReconnectRuntimeStateLoaded()

  return cloneReconnectRuntimeState(reconnectRuntimeStateCache[key] || null)
}

export async function ensureReconnectRuntimeState(
  {
    scopeKey,
    world = null,
    playerId = null,
  }: {
    scopeKey?: string | null
    world?: string | null
    playerId?: number | null
  },
) {
  const normalizedScopeKey = normalizeString(scopeKey)

  if (!normalizedScopeKey) {
    return null
  }

  const existing = await getReconnectRuntimeState(normalizedScopeKey)

  if (existing) {
    return existing
  }

  const nextState = createEmptyReconnectRuntimeState({
    scopeKey: normalizedScopeKey,
    world,
    playerId,
  })

  await putReconnectRuntimeStateRecord(nextState)

  return nextState
}

export async function setReconnectRuntimeState(
  {
    scopeKey,
    world = null,
    playerId = null,
    activeLoginSeenAt,
    activePlannedAt,
    activeReason,
    activeReconnectAt,
    longRestAnchorAt,
    lastLongRestStartedAt,
  }: {
    scopeKey?: string | null
    world?: string | null
    playerId?: number | null
    activeLoginSeenAt?: number | null
    activePlannedAt?: number | null
    activeReason?: ReconnectRuntimeReason | null
    activeReconnectAt?: number | null
    longRestAnchorAt?: number | null
    lastLongRestStartedAt?: number | null
  },
) {
  const normalizedScopeKey = normalizeString(scopeKey)

  if (!normalizedScopeKey) {
    return null
  }

  const baseState = await ensureReconnectRuntimeState({
    scopeKey: normalizedScopeKey,
    world,
    playerId,
  })

  if (!baseState) {
    return null
  }

  const nextState: ReconnectRuntimeState = {
    ...baseState,
    activeLoginSeenAt: activeLoginSeenAt !== undefined
      ? normalizeNumber(activeLoginSeenAt)
      : baseState.activeLoginSeenAt,
    activePlannedAt: activePlannedAt !== undefined
      ? normalizeNumber(activePlannedAt)
      : baseState.activePlannedAt,
    activeReason: activeReason !== undefined
      ? normalizeReconnectRuntimeReason(activeReason)
      : baseState.activeReason,
    activeReconnectAt: activeReconnectAt !== undefined
      ? normalizeNumber(activeReconnectAt)
      : baseState.activeReconnectAt,
    longRestAnchorAt: longRestAnchorAt !== undefined
      ? normalizeNumber(longRestAnchorAt)
      : baseState.longRestAnchorAt,
    lastLongRestStartedAt: lastLongRestStartedAt !== undefined
      ? normalizeNumber(lastLongRestStartedAt)
      : baseState.lastLongRestStartedAt,
    playerId: normalizeNumber(playerId) ?? baseState.playerId,
    scopeKey: normalizedScopeKey,
    world: normalizeString(world) ?? baseState.world,
  }

  await putReconnectRuntimeStateRecord(nextState)

  return nextState
}

export async function planReconnectRuntime(
  {
    scopeKey,
    world = null,
    playerId = null,
    reason,
    reconnectAt,
    plannedAt = Date.now(),
  }: {
    scopeKey?: string | null
    world?: string | null
    playerId?: number | null
    reason: ReconnectRuntimeReason
    reconnectAt: number
    plannedAt?: number
  },
) {
  return await setReconnectRuntimeState({
    scopeKey,
    world,
    playerId,
    activeLoginSeenAt: null,
    activePlannedAt: plannedAt,
    activeReason: reason,
    activeReconnectAt: reconnectAt,
  })
}

export async function markReconnectRuntimeLoginSeen(
  scopeKey?: string | null,
  seenAt = Date.now(),
) {
  return await setReconnectRuntimeState({
    scopeKey,
    activeLoginSeenAt: seenAt,
  })
}

export async function clearReconnectRuntimeActive(
  scopeKey?: string | null,
) {
  return await setReconnectRuntimeState({
    scopeKey,
    activeLoginSeenAt: null,
    activePlannedAt: null,
    activeReason: null,
    activeReconnectAt: null,
  })
}

export async function ensureReconnectRuntimeLongRestAnchor(
  {
    scopeKey,
    world = null,
    playerId = null,
    anchorAt = Date.now(),
  }: {
    scopeKey?: string | null
    world?: string | null
    playerId?: number | null
    anchorAt?: number
  },
) {
  const state = await ensureReconnectRuntimeState({
    scopeKey,
    world,
    playerId,
  })

  if (!state) {
    return null
  }

  if (state.longRestAnchorAt !== null) {
    return state.longRestAnchorAt
  }

  const nextState = await setReconnectRuntimeState({
    scopeKey,
    world,
    playerId,
    longRestAnchorAt: anchorAt,
  })

  return nextState?.longRestAnchorAt ?? normalizeNumber(anchorAt)
}

export async function markReconnectRuntimeLongRestStarted(
  scopeKey?: string | null,
  startedAt = Date.now(),
) {
  return await setReconnectRuntimeState({
    scopeKey,
    lastLongRestStartedAt: startedAt,
  })
}
