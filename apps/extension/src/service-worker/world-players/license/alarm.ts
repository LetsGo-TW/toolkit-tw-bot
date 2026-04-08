//apps/extension/src/service-worker/world-players/license/alarm.ts
import { getWorldPlayerCtxTarget } from "../../prepared-context/get-targets"
import { refreshToken } from "./refresh-token"

function parseLicenseAlarmName(alarmName: string) {
  const [, world, playerIdStr ] = alarmName.split(':')
  return { world, playerId: Number(playerIdStr) }
}

function createLicenseAlarmName(world: string, playerId: number) {
  return `license:${world}:${playerId}`
}

async function scheduleLicenseAlarm(world: string, playerId: number, delayInMinutes: number) {
  console.log('[SW][SCHEDULE LICENSE ALARM]', world, playerId, delayInMinutes)
  const alarmName = createLicenseAlarmName(world, playerId)
  const target = await getWorldPlayerCtxTarget(world, playerId)
  if (!target) {
    await clearLicenseAlarm(alarmName)
    return
  }
  await chrome.alarms.create(alarmName, {
    delayInMinutes,
  })
  const alarm = await chrome.alarms.get(alarmName)
  console.log('[SW][SCHEDULE LICENSE ALARM]', { name: alarm?.name, scheduleTime: alarm?.scheduledTime ? new Date(alarm?.scheduledTime).toLocaleString() : 'UNDEFINED'})
}

async function clearLicenseAlarm(alarmName: string) {
  await chrome.alarms.clear(alarmName)
}

async function handleLicenseAlarm(alarm: chrome.alarms.Alarm) {
  const { world, playerId } = parseLicenseAlarmName(alarm.name)
  const target = await getWorldPlayerCtxTarget(world, playerId)
  if (!target) {
    await clearLicenseAlarm(alarm.name)
    return
  }
  console.log('[SW][HANDLE LICENSE ALARM]', alarm.name, target)
  try {
    await refreshToken(world, playerId, {
      requireCtxTarget: true,
      schedule: scheduleLicenseAlarm,
    })
  } catch (error) {
    console.error('[SW][HANDLE LICENSE ALARM]', alarm.name, error)
  }
}

export { 
  handleLicenseAlarm, 
  scheduleLicenseAlarm
}
