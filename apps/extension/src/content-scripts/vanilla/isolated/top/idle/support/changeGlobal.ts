/// <reference types="chrome" />

import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { random } from "@toolkit-tw-bot/core"
import {
  isActiveTabAttributeEnabled,
  watchActiveTabAttribute,
} from "../../../../shared/watchActiveTabAttribute"
import { getFreshGameBotProtectObservation } from "./current"

const BOOTSTRAP_KEY = '__toolkitTwBotIsolatedTopIdleSupportChangeGlobal__'
const IDLE_MESSAGE_TYPE = 'CHANGE_GLOBAL_TRIBAL_WARS'
const DIAGNOSTIC_MESSAGE_TYPE = 'CHANGE_GLOBAL_TRIBAL_WARS_DIAGNOSTIC'
const LOG_STYLE_IDLE = 'background: #f4a261; color: #1d1d1d; font-weight: 700; padding: 2px 6px; border-radius: 4px;'
const LOG_STYLE_DIAGNOSTIC = 'background: #264653; color: #f1faee; font-weight: 700; padding: 2px 6px; border-radius: 4px;'
const LOG_STYLE_FORCE = 'background: #d62828; color: #f1faee; font-weight: 700; padding: 2px 6px; border-radius: 4px;'
const LOG_STYLE_FOCUS_CHECK = 'background: #1d3557; color: #f1faee; font-weight: 700; padding: 2px 6px; border-radius: 4px;'
const LOG_STYLE_POLICY = 'background: #2a9d8f; color: #081c15; font-weight: 700; padding: 2px 6px; border-radius: 4px;'
const LOG_STYLE_MINIMIZED = 'background: #6a040f; color: #fff1e6; font-weight: 700; padding: 2px 6px; border-radius: 4px;'
const TW_ACTIVE_LEASE_MAX_AGE_MS = 5 * 1000
const TW_IDLE_HEARTBEAT_MAX_AGE_MS = 15 * 1000
const MINIMIZED_FORCE_DELAY_MS = 1500
const MINIMIZED_FORCE_COOLDOWN_MS = 10 * 1000

type ToolkitWindow = Window & {
  [BOOTSTRAP_KEY]?: boolean
}

type FocusDiagnostics = {
  runInTab: boolean
  twActiveTab: boolean
  twActiveLeaseAgeMs: number | null
  twActiveLeaseHealthy: boolean
  idleHeartbeatAgeMs: number | null
  idleHeartbeatHealthy: boolean
  isBotProtected: boolean
  twActivitySnapshot?: unknown
  documentHasFocus: boolean
  visibilityState: DocumentVisibilityState
  hidden: boolean
}

type TwActiveLease = {
  raw: string | null
  id: string | null
  timestamp: number | null
  ageMs: number | null
  healthy: boolean
}

let lastIdleHeartbeatAt = 0
let lastObservedIdleTime = 0
let minimizedForceTimer: ReturnType<typeof setTimeout> | null = null
let lastMinimizedForceAt = 0
let idleRandom = random(7, 12)

function logStyled(label: string, style: string, payload?: unknown) {
  if (payload === undefined) {
    console.debug(`%c${label}`, style)
    return
  }

  console.debug(`%c${label}`, style, payload)
}

function runInTab() {
  return isActiveTabAttributeEnabled()
}

function getTwActiveLease(): TwActiveLease {
  const raw = localStorage.getItem('activetab')

  if (!raw) {
    return {
      raw: null,
      id: null,
      timestamp: null,
      ageMs: null,
      healthy: false,
    }
  }

  try {
    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) {
      return {
        raw,
        id: null,
        timestamp: null,
        ageMs: null,
        healthy: false,
      }
    }

    const [id, timestamp] = parsed
    const numericTimestamp = Number(timestamp)
    const ageMs = Number.isFinite(numericTimestamp)
      ? Date.now() - numericTimestamp
      : null

    return {
      raw,
      id: typeof id === 'string' ? id : null,
      timestamp: Number.isFinite(numericTimestamp) ? numericTimestamp : null,
      ageMs,
      healthy: ageMs !== null && ageMs <= TW_ACTIVE_LEASE_MAX_AGE_MS,
    }
  } catch {
    return {
      raw,
      id: null,
      timestamp: null,
      ageMs: null,
      healthy: false,
    }
  }
}

function getFocusDiagnostics(data?: {
  twActivitySnapshot?: unknown
}): FocusDiagnostics {
  const activeLease = getTwActiveLease()
  const isBotProtected = getFreshGameBotProtectObservation(document).active
  const idleHeartbeatAgeMs = lastIdleHeartbeatAt > 0
    ? Date.now() - lastIdleHeartbeatAt
    : null

  return {
    runInTab: runInTab(),
    twActiveTab: activeLease.id !== null,
    twActiveLeaseAgeMs: activeLease.ageMs,
    twActiveLeaseHealthy: activeLease.healthy,
    idleHeartbeatAgeMs,
    idleHeartbeatHealthy: idleHeartbeatAgeMs !== null
      && idleHeartbeatAgeMs <= TW_IDLE_HEARTBEAT_MAX_AGE_MS,
    isBotProtected,
    twActivitySnapshot: data?.twActivitySnapshot,
    documentHasFocus: document.hasFocus(),
    visibilityState: document.visibilityState,
    hidden: document.hidden,
  }
}

function getFocusPolicy(diagnostics: FocusDiagnostics) {
  if (diagnostics.isBotProtected) {
    return {
      action: 'force-focus',
      reason: 'bot-protected',
    } as const
  }

  if (diagnostics.runInTab) {
    return {
      action: 'keep-background',
      reason: diagnostics.idleHeartbeatHealthy
        ? 'runner-tab-idle-heartbeat'
        : diagnostics.twActiveLeaseHealthy
          ? 'runner-tab-active-lease'
          : 'runner-tab-background-policy',
    } as const
  }

  if (
    diagnostics.visibilityState === 'visible'
    && diagnostics.documentHasFocus
    && diagnostics.hidden === false
  ) {
    return {
      action: 'soft-keepalive',
      reason: 'already-focused',
    } as const
  }

  return {
    action: 'force-focus',
    reason: 'fallback',
  } as const
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function forceWindowFocus(reason: string) {
  const forceResult = await chrome.runtime.sendMessage({
    extensionId: RELEASE_EXTENSION_ID,
    type: 'WINDOW_FORCE_FOCUS'
  })

  logStyled('[WINDOW_FORCE_FOCUS]', LOG_STYLE_FORCE, {
    reason,
    ...forceResult,
  })

  return forceResult
}

function clearMinimizedForceTimer() {
  if (minimizedForceTimer) {
    clearTimeout(minimizedForceTimer)
    minimizedForceTimer = null
  }
}

function scheduleMinimizedForceFocus() {
  if (!runInTab()) {
    return
  }

  const now = Date.now()

  if (now - lastMinimizedForceAt < MINIMIZED_FORCE_COOLDOWN_MS) {
    return
  }

  clearMinimizedForceTimer()

  minimizedForceTimer = setTimeout(() => {
    minimizedForceTimer = null

    if (!runInTab()) {
      return
    }

    if (document.visibilityState !== 'hidden' || document.hidden !== true) {
      return
    }

    lastMinimizedForceAt = Date.now()

    logStyled('[TW_MINIMIZED_GUARD]', LOG_STYLE_MINIMIZED, {
      reason: 'document-hidden-while-runner-active',
    })

    void forceWindowFocus('document-hidden-while-runner-active')
  }, MINIMIZED_FORCE_DELAY_MS)
}

function shouldWakeUp({ idleTime }: { idleTime: number }) {
  if (idleTime < idleRandom * 1000) {
    return false
  }

  idleRandom = random(7, 12)
  return true
}

async function onMessageChange({ data, origin }: MessageEvent) {
  if (origin !== window.location.origin) return
  if (!data || !data.type) return

  if (data.type === DIAGNOSTIC_MESSAGE_TYPE) {
    if (!runInTab()) {
      return
    }

    logStyled('[TW_DIAGNOSTIC_EVENT]', LOG_STYLE_DIAGNOSTIC, data)

    if (data.event === 'document.visibilitychange') {
      if (data.hidden === true) {
        scheduleMinimizedForceFocus()
      } else {
        clearMinimizedForceTimer()
      }
    }

    return
  }

  if (data.type !== IDLE_MESSAGE_TYPE) return
  if (!runInTab() || !('idleTime' in data)) return

  const rawIdleTime = Number.isFinite(data.rawIdleTime)
    ? Number(data.rawIdleTime)
    : Number(data.idleTime)
  const effectiveIdleTime = Number.isFinite(data.effectiveIdleTime)
    ? Number(data.effectiveIdleTime)
    : Number(data.idleTime)

  if (Number.isFinite(rawIdleTime)) {
    lastIdleHeartbeatAt = Date.now()
    lastObservedIdleTime = rawIdleTime
  }

  logStyled(
    rawIdleTime !== effectiveIdleTime
      ? `[TW_IDLE] raw ${Math.floor(rawIdleTime / 1000)}s -> tw ${Math.floor(effectiveIdleTime / 1000)}s`
      : `[TW_IDLE] ${Math.floor(rawIdleTime / 1000)}s`,
    LOG_STYLE_IDLE,
  )

  if (!shouldWakeUp({ idleTime: rawIdleTime })) {
    return
  }

  const beforeForce = getFocusDiagnostics(data)
  const focusPolicy = getFocusPolicy(beforeForce)
  let forceResult = null

  logStyled('[TW_FOCUS_POLICY]', LOG_STYLE_POLICY, focusPolicy)

  if (focusPolicy.action === 'force-focus') {
    forceResult = await forceWindowFocus(String(focusPolicy.reason))
    await wait(150)
  }

  if (focusPolicy.action !== 'keep-background') {
    window.focus()
    document.body?.click()
  }

  await wait(50)

  logStyled('[TW_FOCUS_CHECK]', LOG_STYLE_FOCUS_CHECK, {
    idleTime: rawIdleTime,
    effectiveIdleTime,
    lastObservedIdleTime,
    beforeForce,
    focusPolicy,
    forceResult,
    afterForce: getFocusDiagnostics(data),
  })
}

export function installChangeGlobalSupport() {
  const scope = window as ToolkitWindow

  if (scope[BOOTSTRAP_KEY]) {
    return
  }

  scope[BOOTSTRAP_KEY] = true

  window.addEventListener('message', onMessageChange, true)
  watchActiveTabAttribute((isActive) => {
    if (isActive) {
      return
    }

    clearMinimizedForceTimer()
    lastIdleHeartbeatAt = 0
    lastObservedIdleTime = 0
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') {
      clearMinimizedForceTimer()
    }
  }, true)
}
