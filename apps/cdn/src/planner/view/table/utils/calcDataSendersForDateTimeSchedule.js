import {
  calculateOutputMillis,
  calcUnitTravelSeconds,
  getNowMs,
  isTimeRange
} from './calcDataSendersForDateTimeCommon'

export function calcUnitDateTimeSchedule(unitName, distance, dateTime, nowMs = getNowMs()) {
  const seconds = calcUnitTravelSeconds(unitName, distance)
  const output = dateTime && seconds ? calculateOutputMillis(dateTime, seconds) : null
  const unitOnTime = Boolean(output && isTimeRange(output, nowMs))
  const outputInSec = unitOnTime ? Math.floor((output - nowMs) / 1000) : null
  return { seconds, output, outputInSec, unitOnTime }
}

export function calcDataSendersForDateTimeSchedule({
  sender,
  senderDateTimeContext,
  timeByUnitByVillageId,
  nextOutputMetaByVillageId
}) {
  const {
    villageById,
    calculateDistance,
    dateTime,
    nowMs,
    units = []
  } = senderDateTimeContext || {}

  if (!sender) return { timeByUnit: new Map(), nextUnit: null, nextOutputMs: null }
  const village = villageById?.get?.(sender.villageId)
  if (!village) return { timeByUnit: new Map(), nextUnit: null, nextOutputMs: null }

  const x = Number(village.x)
  const y = Number(village.y)
  const distance = calculateDistance.calc({ x, y })
  const nowMsStable = getNowMs(nowMs)

  const timeByUnit = new Map()
  let nextUnit = null
  let nextOutputMs = null

  sender.units.forEach((value, i) => {
    const unitName = units?.[i]
    const unitCount = Number(value) || 0
    if (!unitName || unitName === 'militia' || unitCount <= 0) return
    const { output, outputInSec, seconds, unitOnTime } = calcUnitDateTimeSchedule(unitName, distance, dateTime, nowMsStable)
    timeByUnit.set(unitName, {
      unitOnTime,
      seconds,
      output,
      outputInSec
    })
    if (unitOnTime && (nextOutputMs == null || output < nextOutputMs)) {
      nextOutputMs = output
      nextUnit = unitName
    }
  })

  if (timeByUnitByVillageId instanceof Map) timeByUnitByVillageId.set(sender.villageId, timeByUnit)
  if (nextOutputMetaByVillageId instanceof Map) nextOutputMetaByVillageId.set(sender.villageId, { nextUnit, nextOutputMs })
  return { timeByUnit, nextUnit, nextOutputMs }
}
