export function computeSlowestUnit(unitSelected = [], unitData) {
  if (!unitData || !('get' in unitData)) throw new Error("Type unitData not's Map")
  let slowest = null
  let slowestSpeed = Infinity
  if (!unitSelected.length) return { slowest, slowestSpeed: null }
  unitSelected.forEach((unit) => {
    const speed = unitData?.get?.(unit)?.speed
    if (!speed) return
    if (speed < slowestSpeed) {
      slowestSpeed = speed
      slowest = unit
    }
  })
  slowestSpeed = slowestSpeed === Infinity ? null : slowestSpeed
  return { slowest, slowestSpeed }
}
