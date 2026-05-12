/// <reference types="chrome" />

import type { SessionManagementConfig, SWMessage } from '../../types'
import { syncTabActionByTabId } from '../action-state'
import { syncControllerScopeAlarm } from '../controller/runner-controller'
import { SET_SMART_SESSION_CONFIG_MESSAGE_TYPE } from '../message/types'
import { normalizeNumber, normalizeStrictBoolean, normalizeString } from '../normalize'
import { getPopupState, type PopupStateRequest } from '../popup-state'
import { getOpenTwTabIds } from '../prepared-context'
import { ensureWorldPlayersLoaded, getWorldPlayer } from '../world-players'
import {
  ensureSessionManagementLoaded,
  setPlayerSmartSessionConfig,
} from './index'

const MIN_SMART_SHORT_BREAK_MIN_IDLE_MINUTES = 3
const MIN_SMART_SHORT_BREAK_DELAY_MINUTES = 1
const MIN_SMART_LONG_REST_DURATION_MINUTES = 10
const MIN_SMART_LONG_REST_DURATION_DELAY_MINUTES = 1
const MAX_SMART_LONG_REST_DURATION_DELAY_MINUTES = 5
const MAX_SMART_LONG_REST_INTERVAL_HOURS = 12
const MIN_SMART_LONG_REST_START_DELAY_MINUTES = 5
const MAX_SMART_LONG_REST_START_DELAY_MINUTES = 10

type SetSmartSessionConfigRequest = Partial<SWMessage> & PopupStateRequest & {
  world?: unknown
  playerId?: unknown
  smartSession?: unknown
}

function normalizePositiveInteger(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value)
  }

  if (typeof value === 'string' && value.trim()) {
    const numericValue = Number(value)

    if (Number.isFinite(numericValue) && numericValue > 0) {
      return Math.round(numericValue)
    }
  }

  return null
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

function normalizeScheduledTimes(value: unknown) {
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
    : null
}

function normalizeSmartSessionInput(value: unknown): SessionManagementConfig['smartSession'] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as {
    shortBreak?: {
      enabled?: unknown
      minIdleMinutes?: unknown
      delayMinutes?: unknown
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
  const shortBreakEnabled = normalizeStrictBoolean(candidate.shortBreak?.enabled)
  const shortBreakMinIdleMinutes = normalizePositiveIntegerInRange(candidate.shortBreak?.minIdleMinutes, {
    min: MIN_SMART_SHORT_BREAK_MIN_IDLE_MINUTES,
  })
  const shortBreakDelayMinutes = normalizePositiveIntegerInRange(candidate.shortBreak?.delayMinutes, {
    min: MIN_SMART_SHORT_BREAK_DELAY_MINUTES,
  })
  const longRestEnabled = normalizeStrictBoolean(candidate.longRest?.enabled)
  const longRestMode = candidate.longRest?.mode === 'interval' || candidate.longRest?.mode === 'schedule'
    ? candidate.longRest.mode
    : null
  const longRestIntervalHours = normalizePositiveIntegerInRange(candidate.longRest?.intervalHours, {
    min: 1,
    max: MAX_SMART_LONG_REST_INTERVAL_HOURS,
  })
  const longRestDurationMinutes = normalizePositiveIntegerInRange(candidate.longRest?.durationMinutes, {
    min: MIN_SMART_LONG_REST_DURATION_MINUTES,
  })
  const longRestDurationDelayMinutes = normalizePositiveIntegerInRange(candidate.longRest?.durationDelayMinutes, {
    min: MIN_SMART_LONG_REST_DURATION_DELAY_MINUTES,
    max: MAX_SMART_LONG_REST_DURATION_DELAY_MINUTES,
  })
  const longRestStartDelayMinutes = normalizePositiveIntegerInRange(candidate.longRest?.startDelayMinutes, {
    min: MIN_SMART_LONG_REST_START_DELAY_MINUTES,
    max: MAX_SMART_LONG_REST_START_DELAY_MINUTES,
  })
  const longRestScheduledTimes = normalizeScheduledTimes(candidate.longRest?.scheduledTimes)

  if (
    shortBreakEnabled === null
    || shortBreakMinIdleMinutes === null
    || shortBreakDelayMinutes === null
    || longRestEnabled === null
    || longRestDurationMinutes === null
    || longRestDurationDelayMinutes === null
    || longRestStartDelayMinutes === null
    || longRestMode === null
    || (
      longRestMode === 'interval'
      && longRestIntervalHours === null
    )
    || (
      longRestMode === 'schedule'
      && !longRestScheduledTimes
    )
  ) {
    return null
  }

  return {
    shortBreak: {
      enabled: shortBreakEnabled,
      minIdleMinutes: shortBreakMinIdleMinutes,
      delayMinutes: shortBreakDelayMinutes,
    },
    longRest: {
      enabled: longRestEnabled,
      mode: longRestMode,
      intervalHours: longRestIntervalHours ?? 1,
      durationMinutes: longRestDurationMinutes,
      durationDelayMinutes: longRestDurationDelayMinutes,
      startDelayMinutes: longRestStartDelayMinutes,
      scheduledTimes: longRestScheduledTimes ?? [],
    },
  }
}

export async function setSmartSessionConfig(
  request: SetSmartSessionConfigRequest = {},
) {
  await ensureSessionManagementLoaded()
  await ensureWorldPlayersLoaded()

  const world = normalizeString(request.world)
  const playerId = normalizeNumber(request.playerId)
  const smartSession = normalizeSmartSessionInput(request.smartSession)

  if (!world) {
    return {
      ok: false,
      error: 'Missing world',
      type: SET_SMART_SESSION_CONFIG_MESSAGE_TYPE,
    }
  }

  if (playerId === null) {
    return {
      ok: false,
      error: 'Missing playerId',
      type: SET_SMART_SESSION_CONFIG_MESSAGE_TYPE,
    }
  }

  if (!smartSession) {
    return {
      ok: false,
      error: 'Missing smartSession',
      type: SET_SMART_SESSION_CONFIG_MESSAGE_TYPE,
    }
  }

  await setPlayerSmartSessionConfig(world, playerId, smartSession)
  const worldPlayer = getWorldPlayer(world, playerId)
  const openTwTabIds = await getOpenTwTabIds()

  console.log('[SW][SESSION_MANAGEMENT][SET_SMART_SESSION_CONFIG]', {
    world,
    playerId,
    worldPlayerScopeKey: worldPlayer?.scopeKey ?? null,
    worldPlayerUpdatedAt: worldPlayer?.updatedAt ?? null,
    openTwTabIds,
    shortBreak: smartSession.shortBreak,
    longRest: smartSession.longRest,
  })

  await Promise.all(
    openTwTabIds.map((tabId) => syncTabActionByTabId(tabId)),
  )

  if (worldPlayer?.scopeKey) {
    await syncControllerScopeAlarm(worldPlayer.scopeKey)
  } else {
    console.warn('[SW][SESSION_MANAGEMENT][SET_SMART_SESSION_CONFIG] missing scopeKey for world player', {
      world,
      playerId,
      openTwTabIds,
    })
  }

  return getPopupState(request)
}
