/// <reference types="chrome" />

import { createIndexedDbDocStore } from '@toolkit-tw-bot/browser/indexedDb'
import {
  createDefaultSessionManagementConfig,
  createDefaultSmartSessionConfig,
  DEFAULT_SMART_LONG_REST_MODE,
  DEFAULT_SMART_LONG_REST_SCHEDULED_TIMES,
  MAX_SMART_LONG_REST_DURATION_DELAY_MINUTES,
  MAX_SMART_LONG_REST_INTERVAL_HOURS,
  MAX_SMART_LONG_REST_START_DELAY_MINUTES,
  MAX_SMART_SHORT_BREAK_DELAY_MINUTES,
  MAX_SMART_SHORT_BREAK_DURATION_MINUTES,
  MAX_SMART_SHORT_BREAK_EVERY_MINUTES,
  MIN_SMART_LONG_REST_DURATION_DELAY_MINUTES,
  MIN_SMART_LONG_REST_DURATION_MINUTES,
  MIN_SMART_LONG_REST_START_DELAY_MINUTES,
  MIN_SMART_SHORT_BREAK_DURATION_MINUTES,
  MIN_SMART_SHORT_BREAK_DELAY_MINUTES,
  MIN_SMART_SHORT_BREAK_EVERY_MINUTES,
  type SessionManagementConfig,
  type SmartSessionConfig,
  type SmartSessionLongRestMode,
} from '../../types'
import { SERVICE_WORKER_DB_NAME, SERVICE_WORKER_DB_VERSION } from '../indexdb/constants'
import { normalizeNumber, normalizeStrictBoolean, normalizeString } from '../normalize'
import { ensureWorldPlayersLoaded, getWorldPlayer } from '../world-players'

const SESSION_MANAGEMENT_STORE_NAME = 'session-management-config'
const SESSION_MANAGEMENT_KIND = 'session-management-config'

export type SessionManagementConfigRecord = SessionManagementConfig & {
  _id: string
  createdAt: string
  kind: typeof SESSION_MANAGEMENT_KIND
  playerId: number
  updatedAt: string
  world: string
}

const sessionManagementStore = createIndexedDbDocStore<SessionManagementConfigRecord>({
  dbName: SERVICE_WORKER_DB_NAME,
  indexes: [
    {
      keyPath: 'kind',
      name: 'kind',
      unique: false,
    },
  ],
  storeName: SESSION_MANAGEMENT_STORE_NAME,
  version: SERVICE_WORKER_DB_VERSION,
})

let cacheLoaded = false
let sessionManagementCache: Record<string, SessionManagementConfigRecord> = {}

function normalizePositiveInteger(value: unknown) {
  const normalized = normalizeNumber(
    typeof value === 'string' && value.trim()
      ? Number(value)
      : value,
  )

  if (normalized === null || normalized < 1) {
    return null
  }

  return Math.round(normalized)
}

function normalizePositiveIntegerInRange(
  value: unknown,
  {
    min,
    max,
  }: {
    min: number
    max?: number
  },
) {
  const normalized = normalizePositiveInteger(value)

  if (normalized === null || normalized < min) {
    return null
  }

  if (typeof max === 'number' && normalized > max) {
    return null
  }

  return normalized
}

function normalizeLongRestMode(value: unknown): SmartSessionLongRestMode | null {
  return value === 'interval' || value === 'schedule'
    ? value
    : null
}

function normalizeScheduledTime(value: unknown) {
  const normalized = normalizeString(value)

  if (!normalized) {
    return null
  }

  const match = normalized.match(/^(\d{1,2})(?::(\d{1,2}))?$/)

  if (!match) {
    return null
  }

  const hours = Number(match[1])
  const minutes = Number(match[2] ?? '0')

  if (
    !Number.isInteger(hours)
    || !Number.isInteger(minutes)
    || hours < 0
    || hours > 23
    || minutes < 0
    || minutes > 59
  ) {
    return null
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function normalizeScheduledTimes(
  value: unknown,
  fallback: string[],
) {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []
  const normalized = Array.from(
    new Set(
      rawItems
        .map((item) => normalizeScheduledTime(item))
        .filter((item): item is string => typeof item === 'string'),
    ),
  )

  return normalized.length
    ? normalized
    : [...fallback]
}

function normalizeSmartShortBreakConfig(
  value: {
    enabled?: unknown
    everyMinutes?: unknown
    durationMinutes?: unknown
    delayMinutes?: unknown
    minIdleMinutes?: unknown
  } | null | undefined,
  fallback = createDefaultSmartSessionConfig().shortBreak,
) {
  const defaults = {
    enabled: fallback.enabled === true,
    everyMinutes: fallback.everyMinutes,
    durationMinutes: fallback.durationMinutes,
    delayMinutes: fallback.delayMinutes,
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaults
  }

  const usesCurrentShape = (
    Object.prototype.hasOwnProperty.call(value, 'everyMinutes')
    || Object.prototype.hasOwnProperty.call(value, 'durationMinutes')
  )

  if (!usesCurrentShape) {
    return {
      enabled: normalizeStrictBoolean(value.enabled) ?? defaults.enabled,
      everyMinutes: normalizePositiveIntegerInRange(value.delayMinutes, {
        min: MIN_SMART_SHORT_BREAK_EVERY_MINUTES,
        max: MAX_SMART_SHORT_BREAK_EVERY_MINUTES,
      }) ?? defaults.everyMinutes,
      durationMinutes: normalizePositiveIntegerInRange(value.minIdleMinutes, {
        min: MIN_SMART_SHORT_BREAK_DURATION_MINUTES,
        max: MAX_SMART_SHORT_BREAK_DURATION_MINUTES,
      }) ?? defaults.durationMinutes,
      delayMinutes: defaults.delayMinutes,
    }
  }

  return {
    enabled: normalizeStrictBoolean(value.enabled) ?? defaults.enabled,
    everyMinutes: normalizePositiveIntegerInRange(value.everyMinutes, {
      min: MIN_SMART_SHORT_BREAK_EVERY_MINUTES,
      max: MAX_SMART_SHORT_BREAK_EVERY_MINUTES,
    }) ?? defaults.everyMinutes,
    durationMinutes: normalizePositiveIntegerInRange(value.durationMinutes, {
      min: MIN_SMART_SHORT_BREAK_DURATION_MINUTES,
      max: MAX_SMART_SHORT_BREAK_DURATION_MINUTES,
    }) ?? defaults.durationMinutes,
    delayMinutes: normalizePositiveIntegerInRange(value.delayMinutes, {
      min: MIN_SMART_SHORT_BREAK_DELAY_MINUTES,
      max: MAX_SMART_SHORT_BREAK_DELAY_MINUTES,
    }) ?? defaults.delayMinutes,
  }
}

function cloneSmartSessionConfig(config?: SmartSessionConfig | null): SmartSessionConfig {
  const fallback = createDefaultSmartSessionConfig()
  const source = config ?? fallback

  return {
    shortBreak: normalizeSmartShortBreakConfig(source.shortBreak, fallback.shortBreak),
    longRest: {
      enabled: source.longRest.enabled === true,
      mode: source.longRest.mode,
      intervalHours: source.longRest.intervalHours,
      durationMinutes: source.longRest.durationMinutes,
      durationDelayMinutes: source.longRest.durationDelayMinutes,
      startDelayMinutes: source.longRest.startDelayMinutes,
      scheduledTimes: [...source.longRest.scheduledTimes],
    },
  }
}

function cloneSessionManagementConfig(config?: SessionManagementConfig | null): SessionManagementConfig {
  const fallback = createDefaultSessionManagementConfig()
  const source = config ?? fallback

  return {
    reconnectOnSessionExpired: source.reconnectOnSessionExpired === true,
    smartSession: cloneSmartSessionConfig(source.smartSession),
  }
}

function normalizeSmartSessionConfig(
  value: unknown,
  fallback: SmartSessionConfig = createDefaultSmartSessionConfig(),
): SmartSessionConfig {
  const defaults = cloneSmartSessionConfig(fallback)

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaults
  }

  const candidate = value as {
    shortBreak?: {
      enabled?: unknown
      everyMinutes?: unknown
      durationMinutes?: unknown
      delayMinutes?: unknown
      minIdleMinutes?: unknown
    } | null
    longRest?: {
      enabled?: unknown
      mode?: unknown
      intervalHours?: unknown
      durationMinutes?: unknown
      durationDelayMinutes?: unknown
      startDelayMinutes?: unknown
      scheduledTimes?: unknown
    } | null
  }
  const normalizedLongRestMode = normalizeLongRestMode(candidate.longRest?.mode) ?? defaults.longRest.mode

  return {
    shortBreak: normalizeSmartShortBreakConfig(candidate.shortBreak, defaults.shortBreak),
    longRest: {
      enabled: normalizeStrictBoolean(candidate.longRest?.enabled) ?? defaults.longRest.enabled,
      mode: normalizedLongRestMode,
      intervalHours: normalizePositiveIntegerInRange(candidate.longRest?.intervalHours, {
        min: 1,
        max: MAX_SMART_LONG_REST_INTERVAL_HOURS,
      }) ?? defaults.longRest.intervalHours,
      durationMinutes: normalizePositiveIntegerInRange(candidate.longRest?.durationMinutes, {
        min: MIN_SMART_LONG_REST_DURATION_MINUTES,
      }) ?? defaults.longRest.durationMinutes,
      durationDelayMinutes: normalizePositiveIntegerInRange(candidate.longRest?.durationDelayMinutes, {
        min: MIN_SMART_LONG_REST_DURATION_DELAY_MINUTES,
        max: MAX_SMART_LONG_REST_DURATION_DELAY_MINUTES,
      }) ?? defaults.longRest.durationDelayMinutes,
      startDelayMinutes: normalizePositiveIntegerInRange(candidate.longRest?.startDelayMinutes, {
        min: MIN_SMART_LONG_REST_START_DELAY_MINUTES,
        max: MAX_SMART_LONG_REST_START_DELAY_MINUTES,
      }) ?? defaults.longRest.startDelayMinutes,
      scheduledTimes: normalizeScheduledTimes(
        candidate.longRest?.scheduledTimes,
        defaults.longRest.scheduledTimes,
      ),
    },
  }
}

function normalizeSessionManagementRecord(value: unknown): SessionManagementConfigRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Partial<SessionManagementConfigRecord>
  const world = normalizeString(candidate.world)
  const playerId = normalizeNumber(candidate.playerId)
  const _id = normalizeString(candidate._id)

  if (!world || playerId === null || !_id) {
    return null
  }

  const defaults = createDefaultSessionManagementConfig()

  return {
    _id,
    createdAt: normalizeString(candidate.createdAt) ?? new Date().toISOString(),
    kind: SESSION_MANAGEMENT_KIND,
    playerId,
    reconnectOnSessionExpired: candidate.reconnectOnSessionExpired === true,
    smartSession: normalizeSmartSessionConfig(candidate.smartSession, defaults.smartSession),
    updatedAt: normalizeString(candidate.updatedAt) ?? new Date().toISOString(),
    world,
  }
}

function createLegacyFallbackConfig(
  world?: string | null,
  playerId?: number | null,
): SessionManagementConfig {
  const defaults = createDefaultSessionManagementConfig()
  const worldPlayer = getWorldPlayer(world, playerId)

  return {
    ...defaults,
    reconnectOnSessionExpired: worldPlayer?.reconnectOnSessionExpired === true,
    smartSession: cloneSmartSessionConfig(defaults.smartSession),
  }
}

export function getSessionManagementConfigKey(
  world?: string | null,
  playerId?: number | null,
) {
  const normalizedWorld = normalizeString(world)
  const normalizedPlayerId = normalizeNumber(playerId)

  if (!normalizedWorld || normalizedPlayerId === null) {
    return null
  }

  return `session-management:world:${normalizedWorld}:player:${normalizedPlayerId}`
}

export async function ensureSessionManagementLoaded() {
  if (cacheLoaded) {
    return
  }

  const stored = await sessionManagementStore.getAll()

  sessionManagementCache = Object.fromEntries(
    stored
      .map((record) => normalizeSessionManagementRecord(record))
      .filter((record): record is SessionManagementConfigRecord => record !== null)
      .map((record) => [record._id, record] as const),
  )
  cacheLoaded = true
}

export async function getPlayerSessionManagementConfig(
  world?: string | null,
  playerId?: number | null,
) {
  const key = getSessionManagementConfigKey(world, playerId)

  if (!key) {
    return null
  }

  await ensureSessionManagementLoaded()
  await ensureWorldPlayersLoaded()

  const record = sessionManagementCache[key] || null

  if (record) {
    return cloneSessionManagementConfig(record)
  }

  return createLegacyFallbackConfig(world, playerId)
}

export async function setPlayerSessionManagementConfig({
  world,
  playerId,
  reconnectOnSessionExpired,
  smartSession,
}: {
  world?: string | null
  playerId?: number | null
  reconnectOnSessionExpired?: boolean | null
  smartSession?: SmartSessionConfig | null
}) {
  const normalizedWorld = normalizeString(world)
  const normalizedPlayerId = normalizeNumber(playerId)
  const key = getSessionManagementConfigKey(normalizedWorld, normalizedPlayerId)

  if (!normalizedWorld || normalizedPlayerId === null || !key) {
    return null
  }

  await ensureSessionManagementLoaded()
  await ensureWorldPlayersLoaded()

  const previousRecord = sessionManagementCache[key] || null
  const baseConfig = previousRecord
    ? cloneSessionManagementConfig(previousRecord)
    : createLegacyFallbackConfig(normalizedWorld, normalizedPlayerId)
  const now = new Date().toISOString()
  const nextRecord: SessionManagementConfigRecord = {
    _id: key,
    createdAt: previousRecord?.createdAt ?? now,
    kind: SESSION_MANAGEMENT_KIND,
    playerId: normalizedPlayerId,
    reconnectOnSessionExpired: normalizeStrictBoolean(reconnectOnSessionExpired) ?? baseConfig.reconnectOnSessionExpired,
    smartSession: smartSession
      ? normalizeSmartSessionConfig(smartSession, baseConfig.smartSession)
      : cloneSmartSessionConfig(baseConfig.smartSession),
    updatedAt: now,
    world: normalizedWorld,
  }

  sessionManagementCache = {
    ...sessionManagementCache,
    [key]: nextRecord,
  }
  await sessionManagementStore.put(nextRecord)

  return nextRecord
}

export async function setPlayerReconnectOnSessionExpiredConfig(
  world: string,
  playerId: number,
  reconnectOnSessionExpired: boolean,
) {
  return await setPlayerSessionManagementConfig({
    reconnectOnSessionExpired,
    playerId,
    world,
  })
}

export async function setPlayerSmartSessionConfig(
  world: string,
  playerId: number,
  smartSession: SmartSessionConfig,
) {
  return await setPlayerSessionManagementConfig({
    playerId,
    smartSession,
    world,
  })
}
