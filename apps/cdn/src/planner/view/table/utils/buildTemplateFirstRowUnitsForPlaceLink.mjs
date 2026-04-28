export function buildTemplateFirstRowUnitsForPlaceLink({
  templateState,
  senderUnits,
  unitIndexByName
}) {
  const template = templateState?.template
  const templateType = String(template?.templateType || '').trim().toLowerCase()
  const tplUnits = Array.isArray(template?.units) ? template.units : []
  const rawTplValues = Array.isArray(template?.values) ? template.values : []
  const unitsByName = new Map()

  if (!tplUnits.length) return unitsByName

  if (templateType !== 'value') {
    tplUnits.forEach((unit) => unitsByName.set(unit, 0))
    return unitsByName
  }

  const tplRows = rawTplValues.filter((row) => {
    if (!Array.isArray(row)) return false
    return row.some((value) => {
      const n = Number(value)
      return Number.isFinite(n) && n !== 0
    })
  })
  if (!tplRows.length) {
    tplUnits.forEach((unit) => unitsByName.set(unit, 0))
    return unitsByName
  }

  const firstRow = tplRows[0]
  const otherRows = tplRows.slice(1)
  const getVillageUnitValue = (unit, fallbackIndex = -1) => {
    const mappedIndex = unitIndexByName instanceof Map ? unitIndexByName.get(unit) : undefined
    const index = Number.isInteger(mappedIndex) ? mappedIndex : fallbackIndex
    if (!Number.isInteger(index) || index < 0) return 0
    const value = Number(senderUnits?.[index])
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  }

  tplUnits.forEach((unit, i) => {
    const villageUnit = getVillageUnitValue(unit, i)
    const firstValue = Number(firstRow?.[i])
    if (!Number.isFinite(firstValue) || firstValue === 0) {
      unitsByName.set(unit, 0)
      return
    }

    let reservedByOthers = 0
    let othersHasAll = false
    otherRows.forEach((row) => {
      const val = Number(row?.[i])
      if (!Number.isFinite(val) || val === 0) return
      if (val < 0) {
        othersHasAll = true
        return
      }
      reservedByOthers += Math.floor(val)
    })
    if (othersHasAll) {
      unitsByName.set(unit, 0)
      return
    }

    const availableForFirst = Math.max(villageUnit - reservedByOthers, 0)
    const nextValue = firstValue < 0
      ? availableForFirst
      : Math.max(Math.min(Math.floor(firstValue), availableForFirst), 0)
    unitsByName.set(unit, nextValue)
  })

  return unitsByName
}
