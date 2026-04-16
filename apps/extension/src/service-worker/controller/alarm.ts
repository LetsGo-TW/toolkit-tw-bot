/// <reference types="chrome" />

const CONTROLLER_SCOPE_ALARM_PREFIX = 'controller:scope:'
const CONTROLLER_ALARM_MIN_AHEAD_MS = 250

function encodeScopeKey(scopeKey: string) {
  return encodeURIComponent(scopeKey)
}

function decodeScopeKey(encodedScopeKey: string) {
  try {
    return decodeURIComponent(encodedScopeKey)
  } catch {
    return null
  }
}

export function createControllerScopeAlarmName(scopeKey: string) {
  return `${CONTROLLER_SCOPE_ALARM_PREFIX}${encodeScopeKey(scopeKey)}`
}

export function isControllerAlarmName(alarmName?: string | null) {
  return typeof alarmName === 'string'
    && alarmName.startsWith(CONTROLLER_SCOPE_ALARM_PREFIX)
}

export function parseControllerScopeAlarmName(alarmName?: string | null) {
  if (!isControllerAlarmName(alarmName)) {
    return null
  }

  const encodedScopeKey = alarmName.slice(CONTROLLER_SCOPE_ALARM_PREFIX.length)

  if (!encodedScopeKey) {
    return null
  }

  return decodeScopeKey(encodedScopeKey)
}

export async function clearControllerScopeAlarm(scopeKey?: string | null) {
  if (!scopeKey) {
    return false
  }

  return await chrome.alarms.clear(createControllerScopeAlarmName(scopeKey))
}

export async function scheduleControllerScopeAlarm({
  scopeKey,
  scheduledAt,
}: {
  scopeKey: string
  scheduledAt: number
}) {
  const when = Math.max(Date.now() + CONTROLLER_ALARM_MIN_AHEAD_MS, scheduledAt)
  const alarmName = createControllerScopeAlarmName(scopeKey)

  await chrome.alarms.create(alarmName, {
    when,
  })

  return await chrome.alarms.get(alarmName)
}
