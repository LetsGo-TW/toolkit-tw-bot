export function fallbackUnitValue({
  unitName,
  units = [],
  unitIndexByName,
  fallbackIndex = -1
}) {
  const mappedIndex = unitIndexByName instanceof Map ? unitIndexByName.get(unitName) : undefined
  const index = Number.isInteger(mappedIndex) ? mappedIndex : fallbackIndex
  if (!Number.isInteger(index) || index < 0) return 0
  const value = Number(units?.[index])
  return Number.isFinite(value) ? value : 0
}
