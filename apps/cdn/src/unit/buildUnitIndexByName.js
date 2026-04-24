export function buildUnitIndexByName(units = []) {
  return new Map(
    (Array.isArray(units) ? units : []).map((unit, index) => [unit, index])
  )
}
