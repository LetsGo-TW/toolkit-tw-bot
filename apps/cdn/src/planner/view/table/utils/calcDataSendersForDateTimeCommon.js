import { useGoTiming } from '../../../../hooks/useGoTiming'
import { travelSecond } from '../../../../unit'

export function normalizeDispatchMode(mode) {
  return mode === 'send' ? 'send' : 'schedule'
}

export function getNowMs(nowMs) {
  return Number.isFinite(nowMs) ? nowMs : (useGoTiming.getServerNowMs() || Date.now())
}

export function calculateOutputMillis(dateTime, seconds) {
  const arrival = new Date(dateTime).getTime()
  return arrival - (Math.floor(seconds) * 1000)
}

export function isTimeRange(output = 0, nowMs = getNowMs()) {
  return output > nowMs
}

export function calcUnitTravelSeconds(unitName, distance) {
  const seconds = travelSecond(distance, unitName)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0
}

export function senderDateTimeContext({
  villageById,
  calculateDistance,
  dateTime,
  dispatchMode = 'schedule',
  nowMs = Date.now(),
  units = []
}) {
  return {
    villageById,
    calculateDistance,
    dateTime,
    dispatchMode: normalizeDispatchMode(dispatchMode),
    nowMs,
    units
  }
}
