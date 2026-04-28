import { fallbackUnitValue } from '../../planner/view/table/utils/fallbackUnitValue.js'
import { sumTemplateByUnitAllForSender } from '../../planner/view/table/utils/sumTemplateByUnit.js'

export function calcTemplateRowsForSender({
  tplUnits = [],
  tplValues = [],
  senderUnits = [],
  unitIndexByName,
  debug = false
}) {
  const units = Array.isArray(tplUnits) ? tplUnits : []
  const rows = Array.isArray(tplValues) ? tplValues : []

  const distributed = rows.map(() => units.map(() => 0))
  if (!units.length || !rows.length) return distributed

  const allByUnit = sumTemplateByUnitAllForSender({
    tplUnits: units,
    tplValues: rows,
    senderUnits,
    unitIndexByName,
    debug
  })

  const remainingByUnit = new Map(
    units.map((unit, i) => ([
      unit,
      Math.max(0, fallbackUnitValue({
        unitName: unit,
        units: senderUnits,
        unitIndexByName,
        fallbackIndex: i
      }))
    ]))
  )
  const remainingAllByUnit = new Map(
    units.map((unit) => [unit, Math.max(0, Number(allByUnit.get(unit) || 0))])
  )

  // 1) Distribui somente FIXED (> 0) em ordem de linhas, respeitando o disponível.
  rows.forEach((row, rowIndex) => {
    units.forEach((unit, unitIndex) => {
      const request = Number(row?.[unitIndex])
      if (!Number.isFinite(request) || request <= 0 || request === -1) {
        distributed[rowIndex][unitIndex] = 0
        return
      }
      const remaining = Math.max(0, Number(remainingByUnit.get(unit) || 0))
      const assigned = Math.min(request, remaining)
      distributed[rowIndex][unitIndex] = assigned
      remainingByUnit.set(unit, remaining - assigned)
    })
  })

  // 2) Distribui ALL (-1): o primeiro ALL da unidade recebe o restante permitido.
  rows.forEach((row, rowIndex) => {
    units.forEach((unit, unitIndex) => {
      const request = Number(row?.[unitIndex])
      if (request !== -1) return
      const remaining = Math.max(0, Number(remainingByUnit.get(unit) || 0))
      const remainingAll = Math.max(0, Number(remainingAllByUnit.get(unit) || 0))
      const assigned = Math.min(remaining, remainingAll)
      distributed[rowIndex][unitIndex] = assigned
      remainingByUnit.set(unit, remaining - assigned)
      remainingAllByUnit.set(unit, remainingAll - assigned)
    })
  })

  return distributed
}

export default calcTemplateRowsForSender
