import { fallbackUnitValue } from './fallbackUnitValue.js'

function mapToObject(map) {
  return Object.fromEntries(map.entries())
}

export function sumTemplateByUnitFixed({
  tplUnits = [],
  tplValues = [],
  debug = false
}) {
  const tplFixed = new Map(tplUnits.map((unit) => [unit, 0]))

  tplValues.forEach((row) => {
    tplUnits.forEach((unit, i) => {
      const val = Number(row?.[i])
      if (val === -1) return
      if (!Number.isFinite(val) || val <= 0) return
      tplFixed.set(unit, (tplFixed.get(unit) || 0) + val)
    })
  })

  if (debug) {
    console.log('[sumTemplateByUnitFixed][in]', { tplUnits, tplValues })
    console.log('[sumTemplateByUnitFixed][out]', mapToObject(tplFixed))
  }

  return tplFixed
}

export function sumTemplateByUnitAllForSender({
  tplUnits = [],
  tplValues = [],
  senderUnits = [],
  unitIndexByName,
  debug = true
}) {
  const tplFixed = sumTemplateByUnitFixed({ tplUnits, tplValues })
  const tplAll = new Map(tplUnits.map((unit) => [unit, 0]))

  tplValues.forEach((row) => {
    tplUnits.forEach((unit, i) => {
      const val = Number(row?.[i])
      const vlgValue = fallbackUnitValue({
        unitName: unit,
        units: senderUnits,
        unitIndexByName,
        fallbackIndex: i
      })
      if (val === -1 && vlgValue > (tplFixed.get(unit) || 0)) {
        tplAll.set(unit, vlgValue - (tplFixed.get(unit) || 0))
      }
    })
  })

  if (debug) {
    console.log('[sumTemplateByUnitAllForSender][in]', {
      tplUnits,
      tplValues,
      senderUnits,
      tplFixed: mapToObject(tplFixed)
    })
    console.log('[sumTemplateByUnitAllForSender][out]', mapToObject(tplAll))
  }

  return tplAll
}

