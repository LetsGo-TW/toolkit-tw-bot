/// <reference types="chrome" />

import { syncPreparedContextWithOpenTwTabs } from '.'
import { handleLicenseAlarm } from '../world-players/license/alarm'
import { handleErrorAlarm } from './error-tabId'
import { handleProbeAlarm } from './probe-scoped'

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
  return (alarm: chrome.alarms.Alarm) => {
    if (alarm.name.startsWith('probe:')) {
      void handleProbeAlarm(alarm).catch((error) => {
        console.error('[probe alarm]', error)
      })
      return
    }

    if (alarm.name.startsWith('license:')) {
      void handleLicenseAlarm(alarm).catch((error) => {
        console.error('[license alarm]', error)
      })
      return
    }

    if (alarm.name.startsWith('error:')) {
      void handleErrorAlarm(alarm).catch((error) => {
        console.error('[error alarm]', error)
      })
      return
    }

    if (alarm.name.startsWith(PREPARED_CONTEXT_CLEANUP_ALARM)) {
      void syncPreparedContextWithOpenTwTabs().catch((error) => {
        console.error('[prepared cleanup alarm]', error)
      })
    }
  }
}

