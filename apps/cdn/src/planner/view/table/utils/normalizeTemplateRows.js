export function normalizeTemplateRows(template) {
  const rawTplValues = Array.isArray(template?.values) ? template.values : []
  const tplUnits = Array.isArray(template?.units) ? template.units : []
  const inferredRowSize = rawTplValues.reduce((max, row) => {
    if (!Array.isArray(row)) return max
    return Math.max(max, row.length)
  }, 0)
  const rowSize = tplUnits.length || inferredRowSize

  return rawTplValues.reduce((acc, rawRow) => {
    if (!Array.isArray(rawRow)) return acc
    const normalizedRow = Array.from({ length: rowSize }, (_, i) => {
      const n = Number(rawRow[i])
      return Number.isFinite(n) ? n : 0
    })
    const hasValue = normalizedRow.some((value) => value !== 0)
    if (!hasValue) return acc
    acc.push({
      row: normalizedRow,
      rowIndex: acc.length
    })
    return acc
  }, [])

  return tplRows;
}
