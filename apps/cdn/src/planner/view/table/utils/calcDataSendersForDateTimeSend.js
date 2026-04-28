import { calcUnitTravelSeconds, getNowMs } from './calcDataSendersForDateTimeCommon'

export function calcUnitDateTimeSend(unitName, distance, nowMs = getNowMs()) {
  const seconds = calcUnitTravelSeconds(unitName, distance)
  if (!seconds) return { seconds, output: null, outputInSec: null, unitOnTime: false }
  const output = nowMs + (Math.floor(seconds) * 1000)
  const outputInSec = Math.floor((output - nowMs) / 1000)
  return { seconds, output, outputInSec, unitOnTime: true }
}

export function calcDataSendersForDateTimeSend({
  sender,
  senderDateTimeContext,
  timeByUnitByVillageId,
  nextOutputMetaByVillageId
}) {
  const {
    villageById,
    calculateDistance,
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
  let nextOutputMs = null

  sender.units.forEach((value, i) => {
    const unitName = units?.[i]
    const unitCount = Number(value) || 0
    if (!unitName || unitName === 'militia' || unitCount <= 0) return
    const { output, outputInSec, seconds, unitOnTime } = calcUnitDateTimeSend(unitName, distance, nowMsStable)
    timeByUnit.set(unitName, {
      unitOnTime,
      seconds,
      output,
      outputInSec
    })
    if (unitOnTime && (nextOutputMs == null || output < nextOutputMs)) nextOutputMs = output
  })

  if (timeByUnitByVillageId instanceof Map) timeByUnitByVillageId.set(sender.villageId, timeByUnit)
  if (nextOutputMetaByVillageId instanceof Map) nextOutputMetaByVillageId.set(sender.villageId, {
    nextUnit: null,
    nextOutputMs
  })
  return { timeByUnit, nextUnit: null, nextOutputMs }
}
