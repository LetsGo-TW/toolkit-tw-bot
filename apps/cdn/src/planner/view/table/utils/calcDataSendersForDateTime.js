import {
  calculateOutputMillis,
  isTimeRange,
  normalizeDispatchMode,
  senderDateTimeContext
} from './calcDataSendersForDateTimeCommon'
import {
  calcDataSendersForDateTimeSchedule,
  calcUnitDateTimeSchedule
} from './calcDataSendersForDateTimeSchedule'
import {
  calcDataSendersForDateTimeSend,
  calcUnitDateTimeSend
} from './calcDataSendersForDateTimeSend'

export {
  calculateOutputMillis,
  isTimeRange,
  senderDateTimeContext,
  calcDataSendersForDateTimeSchedule,
  calcDataSendersForDateTimeSend,
  calcUnitDateTimeSchedule,
  calcUnitDateTimeSend
}

export function calcUnitDateTime(
  unitName,
  distance,
  dateTime,
  nowMs,
  dispatchMode = 'schedule'
) {
  const mode = normalizeDispatchMode(dispatchMode)
  return mode === 'send'
    ? calcUnitDateTimeSend(unitName, distance, nowMs)
    : calcUnitDateTimeSchedule(unitName, distance, dateTime, nowMs)
}

export function calcDataSendersForDateTime(params = {}) {
  const mode = normalizeDispatchMode(params?.senderDateTimeContext?.dispatchMode)
  return mode === 'send'
    ? calcDataSendersForDateTimeSend(params)
    : calcDataSendersForDateTimeSchedule(params)
}
