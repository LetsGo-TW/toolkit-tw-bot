/// <reference types="chrome" />

const FARM_MAX_OWNER_ALARM_PREFIX = 'farm-max:owner:'
const FARM_MAX_OWNER_ALARM_MIN_AHEAD_MS = 250

function encodeOwnerKey(ownerKey: string) {
  return encodeURIComponent(ownerKey)
}

function decodeOwnerKey(encodedOwnerKey: string) {
  try {
    return decodeURIComponent(encodedOwnerKey)
  } catch {
    return null
  }
}

export function createFarmMaxOwnerAlarmName(ownerKey: string) {
  return `${FARM_MAX_OWNER_ALARM_PREFIX}${encodeOwnerKey(ownerKey)}`
}

export function isFarmMaxAlarmName(alarmName?: string | null) {
  return typeof alarmName === 'string'
    && alarmName.startsWith(FARM_MAX_OWNER_ALARM_PREFIX)
}

export function parseFarmMaxOwnerAlarmName(alarmName?: string | null) {
  if (!isFarmMaxAlarmName(alarmName)) {
    return null
  }

  const encodedOwnerKey = alarmName?.slice(FARM_MAX_OWNER_ALARM_PREFIX.length)

  if (!encodedOwnerKey) {
    return null
  }

  return decodeOwnerKey(encodedOwnerKey)
}

export async function clearFarmMaxOwnerAlarm(ownerKey?: string | null) {
  if (!ownerKey) {
    return false
  }

  return await chrome.alarms.clear(createFarmMaxOwnerAlarmName(ownerKey))
}

export async function scheduleFarmMaxOwnerAlarm({
  ownerKey,
  scheduledAt,
}: {
  ownerKey: string
  scheduledAt: number
}) {
  const when = Math.max(Date.now() + FARM_MAX_OWNER_ALARM_MIN_AHEAD_MS, scheduledAt)
  const alarmName = createFarmMaxOwnerAlarmName(ownerKey)

  await chrome.alarms.create(alarmName, {
    when,
  })

  return await chrome.alarms.get(alarmName)
}
