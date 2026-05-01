import { nDateTime } from "@toolkit-tw-bot/core"
import { dateServer, getGameData, timeServer } from "@toolkit-tw-bot/document"
import { useGoTiming } from "../hooks/useGoTiming"

const DEFAULT_SENDER_OFFSET_MS = -250
const MAX_SENDER_OFFSET_ERROR_MS = 5000
const SENDER_OFFSET_ADJUST_LEVELS = [
  { maxAbsErrorMs: 12, gain: 1, maxStepMs: 12, label: "micro" },
  { maxAbsErrorMs: 30, gain: 0.85, maxStepMs: 20, label: "small" },
  { maxAbsErrorMs: 80, gain: 0.6, maxStepMs: 35, label: "medium" },
  { maxAbsErrorMs: 180, gain: 0.4, maxStepMs: 50, label: "large" },
  { maxAbsErrorMs: 350, gain: 0.25, maxStepMs: 65, label: "xlarge" },
  { maxAbsErrorMs: Infinity, gain: 0.15, maxStepMs: 90, label: "max" }
]

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalizePositiveNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export function getSenderStorageKey(gameData = getGameData()) {
  return `__offset:${gameData.world}:${gameData.player.id}`
}

export function getStoredSenderOffsetMs(gameData = getGameData()) {
  const parsed = Number(localStorage.getItem(getSenderStorageKey(gameData)))
  return Number.isFinite(parsed) ? parsed : DEFAULT_SENDER_OFFSET_MS
}

export function setStoredSenderOffsetMs(offsetMs, gameData = getGameData()) {
  const parsed = Number(offsetMs)
  const nextValue = Number.isFinite(parsed) ? parsed : DEFAULT_SENDER_OFFSET_MS
  localStorage.setItem(getSenderStorageKey(gameData), String(nextValue))
  return nextValue
}

export function getSenderNowMs() {
  try {
    const nowMs = Number(useGoTiming?.getEffectiveServerNowMs?.())

    if (Number.isFinite(nowMs) && nowMs > 0) return nowMs
  } catch {}

  try {
    const offsetMs = Number(useGoTiming?.getOffsetMs?.())
    const latencyMs = Number(useGoTiming?.getLatencyMs?.())
    const nowMs = Date.now()
      + (Number.isFinite(offsetMs) ? offsetMs : 0)
      + (Number.isFinite(latencyMs) ? latencyMs / 2 : 0)

    if (Number.isFinite(nowMs) && nowMs > 0) return nowMs
  } catch {}

  try {
    const nowMs = Number(nDateTime(dateServer(), timeServer()))

    if (Number.isFinite(nowMs) && nowMs > 0) return nowMs
  } catch {}

  return Date.now()
}

export function shouldDispatchCommand(targetSendMs, offsetMs = 0) {
  const targetMs = Number(targetSendMs)
  if (!Number.isFinite(targetMs) || targetMs <= 0) return false
  return targetMs <= (getSenderNowMs() + (Number(offsetMs) || 0))
}

export function getSenderDispatchDelayMs(targetSendMs, offsetMs = 0) {
  const targetMs = Number(targetSendMs)
  if (!Number.isFinite(targetMs) || targetMs <= 0) return 50

  const remainingMs = targetMs - (getSenderNowMs() + (Number(offsetMs) || 0))
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 0
  if (remainingMs > 60000) return 1000
  if (remainingMs > 15000) return 500
  if (remainingMs > 5000) return 250
  if (remainingMs > 1000) return 50
  if (remainingMs > 250) return 10
  if (remainingMs > 80) return 4
  if (remainingMs > 20) return 1
  return 0
}

export function scheduleSenderDispatch({
  targetSendMs,
  offsetMs = 0,
  beforeDispatch,
  onDispatch,
  onError
} = {}) {
  let cancelled = false
  let dispatching = false
  let timeoutId = null

  const clearScheduled = () => {
    if (timeoutId != null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  const reportError = (error) => {
    if (typeof onError === "function") {
      onError(error)
      return
    }
    console.error("[sender][schedule]", error)
  }

  const scheduleNext = () => {
    if (cancelled || dispatching) return

    try {
      if (typeof beforeDispatch === "function") {
        beforeDispatch()
      }

      if (shouldDispatchCommand(targetSendMs, offsetMs)) {
        dispatching = true
        clearScheduled()
        Promise.resolve(typeof onDispatch === "function" ? onDispatch() : null)
          .catch((error) => {
            reportError(error)
          })
          .finally(() => {
            dispatching = false
          })
        return
      }

      const delayMs = normalizePositiveNumber(getSenderDispatchDelayMs(targetSendMs, offsetMs), 0)
      timeoutId = setTimeout(scheduleNext, delayMs)
    } catch (error) {
      cancelled = true
      clearScheduled()
      reportError(error)
    }
  }

  scheduleNext()

  return () => {
    cancelled = true
    clearScheduled()
  }
}

export function reconcileStoredSenderOffsetMs({
  oldOffsetMs = DEFAULT_SENDER_OFFSET_MS,
  desiredArrivalMs,
  actualArrivalMs
} = {}) {
  const previousOffsetMs = Number.isFinite(Number(oldOffsetMs))
    ? Number(oldOffsetMs)
    : DEFAULT_SENDER_OFFSET_MS
  const desiredMs = Number(desiredArrivalMs)
  const actualMs = Number(actualArrivalMs)

  if (!Number.isFinite(desiredMs) || !Number.isFinite(actualMs)) {
    return {
      offsetMs: previousOffsetMs,
      appliedStepMs: 0,
      errorMs: null,
      level: "invalid"
    }
  }

  const errorMs = actualMs - desiredMs
  const absErrorMs = Math.abs(errorMs)

  if (!Number.isFinite(absErrorMs) || absErrorMs > MAX_SENDER_OFFSET_ERROR_MS) {
    return {
      offsetMs: previousOffsetMs,
      appliedStepMs: 0,
      errorMs,
      level: "ignored"
    }
  }

  const level = SENDER_OFFSET_ADJUST_LEVELS.find((item) => absErrorMs <= item.maxAbsErrorMs)
    || SENDER_OFFSET_ADJUST_LEVELS[SENDER_OFFSET_ADJUST_LEVELS.length - 1]
  let nextStepMs = Math.round(errorMs * Number(level.gain || 0))

  if (nextStepMs === 0 && absErrorMs > 0) {
    nextStepMs = errorMs > 0 ? 1 : -1
  }

  const appliedStepMs = clamp(nextStepMs, -Number(level.maxStepMs || 0), Number(level.maxStepMs || 0))

  return {
    offsetMs: previousOffsetMs + appliedStepMs,
    appliedStepMs,
    errorMs,
    level: level.label
  }
}
