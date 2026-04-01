/// <reference types="chrome" />

import { syncPreparedContextWithOpenTwTabs } from '.'

const PREPARED_CONTEXT_CLEANUP_ALARM = 'prepared-context.cleanup'
const PREPARED_CONTEXT_CLEANUP_PERIOD_MINUTES = 0.5

export async function ensurePreparedContextCleanupAlarm() {
  const existingAlarm = await chrome.alarms.get(PREPARED_CONTEXT_CLEANUP_ALARM)

  if (existingAlarm) {
    return
  }

  await chrome.alarms.create(PREPARED_CONTEXT_CLEANUP_ALARM, {
    periodInMinutes: PREPARED_CONTEXT_CLEANUP_PERIOD_MINUTES,
  })
}

export function createOnPreparedContextCleanupAlarmListener() {
  return async (alarm: chrome.alarms.Alarm) => {
    if (alarm.name !== PREPARED_CONTEXT_CLEANUP_ALARM) {
      return
    }

    await syncPreparedContextWithOpenTwTabs()
  }
}

