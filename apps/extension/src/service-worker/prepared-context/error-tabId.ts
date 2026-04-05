import { getRecoverableTabCtxTarget } from "./get-targets"

function parseErrorAlarmName(alarmName: string) {
  const tabId = alarmName.slice('error:'.length)
  return Number(tabId)
}

async function scheduleErrorAlarm(tabId: number, delayInMinutes: number) {
  console.log('[SW][SCHEDULE ERROR ALARM]', tabId, delayInMinutes)
  const alarmName = `error:${tabId}`
  const target = await getRecoverableTabCtxTarget(tabId)

  if (!target) {
    await clearErrorAlarm(alarmName)
    return
  }

  await chrome.alarms.create(alarmName, {
    delayInMinutes,
  })

  const alarm = await chrome.alarms.get(alarmName)
  console.log('[SW][SCHEDULE ERROR ALARM]', { name: alarm?.name, scheduleTime: alarm?.scheduledTime ? new Date(alarm?.scheduledTime).toLocaleString() : 'UNDEFINED'})
}

async function clearErrorAlarm(alarmName: string) {
  await chrome.alarms.clear(alarmName)
}

async function handleErrorAlarm(alarm: chrome.alarms.Alarm) {
  const tabId = parseErrorAlarmName(alarm.name)
  const target = await getRecoverableTabCtxTarget(tabId)

  console.log('[SW][HANDLE ERROR ALARM]', tabId, target)

  if (!target || !target.tab.id) {
    await clearErrorAlarm(alarm.name)
    return
  }

  try {
    await chrome.tabs.reload(target.tab.id)
    console.log('[SW][ERROR] reload accepted')
  } catch (error) {
    console.error('[SW][ERROR] reload failed', error)
  }
}

export { 
  handleErrorAlarm, 
  scheduleErrorAlarm
}
