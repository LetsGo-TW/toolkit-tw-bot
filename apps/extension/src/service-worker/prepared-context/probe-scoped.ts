import { getRunnerByScope } from '../runner-tabs'
import { ensureWorldPlayersLoaded, getWorldPlayerByScopeKey } from '../world-players'
import { runtimeAllowedByLicense } from '../world-players/runtime'
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { SUPPORT_PROBE_MESSAGE_TYPE } from '../../content-scripts/vanilla/isolated/top/idle/support/message-types'
import { getTabContext } from '.'
import { random } from '@toolkit-tw-bot/core'

const MIN_DELAY_SECONDS = 30
const MAX_DELAY_SECONDS = 40

async function getProbeTarget(scopeKey: string) {
  const runner = getRunnerByScope(scopeKey)

  if (!runner) {
    return null
  }

  let tab: chrome.tabs.Tab
  try {
    tab = await chrome.tabs.get(runner.tabId)
  } catch {
    return null
  }

  const runnerNow = getRunnerByScope(scopeKey)
  if (
    !runnerNow
    || runnerNow.tabId !== runner.tabId
    || runnerNow.windowId !== runner.windowId
  ) {
    return null
  }

  await ensureWorldPlayersLoaded()
  const worldPlayer = getWorldPlayerByScopeKey(scopeKey)

  if (!worldPlayer) return null

  const tabContext = getTabContext(runnerNow.tabId)
  if (tabContext?.context === 'LOGIN') return null
  if (tabContext?.isBotProtected === true) return null
  
  const enabledByUser = worldPlayer?.enabledByUser === true
  const { isAllowedByLicense } = await runtimeAllowedByLicense(worldPlayer)
  if (!enabledByUser || !isAllowedByLicense) return null

  return {
    runner: runnerNow,
    tab,
    worldPlayer,
  }
}

function parseProbeAlarmName(alarmName: string) {
  const scopeKey = alarmName.slice('probe:'.length)
  return scopeKey
}

function calculateRandomDelayInMinutes() {
  const delayInSeconds = random(MIN_DELAY_SECONDS, MAX_DELAY_SECONDS)
  const delayInMinutes = delayInSeconds / 60
  return delayInMinutes
}

async function scheduleProbeAlarm(scopeKey: string, isWebRequest: boolean = false) {
  console.log('[SW][SCHEDULE PROBE ALARM]', scopeKey, isWebRequest)
  const alarmName = `probe:${scopeKey}`
  const target = await getProbeTarget(scopeKey)

  if (!target) {
    await clearProbeAlarm(alarmName)
    return
  }

  const delayInMinutes = calculateRandomDelayInMinutes()

  // só reagenda em webRequest
  if (!isWebRequest && await chrome.alarms.get(alarmName)) return

  await chrome.alarms.create(alarmName, {
    delayInMinutes,
  })

  const alarm = await chrome.alarms.get(alarmName)
  console.log('[SW][SCHEDULE PROBE ALARM]', { name: alarm?.name, scheduleTime: alarm?.scheduledTime ? new Date(alarm?.scheduledTime).toLocaleString() : 'UNDEFINED'})
}

async function clearProbeAlarm(alarmName: string) {
  await chrome.alarms.clear(alarmName)
}

async function handleProbeAlarm(alarm: chrome.alarms.Alarm) {
  const scopeKey = parseProbeAlarmName(alarm.name)
  const target = await getProbeTarget(scopeKey)

  console.log('[SW][HANDLE PROBE ALARM]', scopeKey, target)
  if (!target) {
    await clearProbeAlarm(alarm.name)
    return
  }

  try {
    const response = await chrome.tabs.sendMessage(target.runner.tabId, {
      extensionId: RELEASE_EXTENSION_ID,
      type: SUPPORT_PROBE_MESSAGE_TYPE,
      scopeKey,
    }) as {
      ok?: boolean
      type?: string
      isBotProtected?: boolean
    } | null

    console.log('[SW][PROBE] response', response)

    if (response?.isBotProtected === true) {
      await clearProbeAlarm(alarm.name)
    }
  } catch (error) {
    console.error('[SW][PROBE] sendMessage failed', error)
  }
}

export { 
  handleProbeAlarm, 
  scheduleProbeAlarm
}
