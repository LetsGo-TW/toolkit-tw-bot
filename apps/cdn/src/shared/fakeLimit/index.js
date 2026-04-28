export function parseFirstInt(value, fallback = 0) {
  const match = String(value || '').match(/\d+/)
  if (!match) return fallback
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : fallback
}

export function computeFakeMinPop(villagePoints, fakeLimitPercent) {
  const points = Number(villagePoints)
  const limit = Number(fakeLimitPercent)
  if (!Number.isFinite(points) || !Number.isFinite(limit)) return 0
  return Math.max(0, Math.floor((points * limit) / 100))
}

export function distributeFakeLimitByAvailability(popMin = 0, pool = []) {
  const minPop = Number(popMin)
  if (!Number.isFinite(minPop) || minPop <= 0) return {}
  const normalizedPool = Array.isArray(pool) ? pool : []
  const total = normalizedPool.reduce((acc, item) => {
    const count = Number(item?.count) || 0
    const pop = Number(item?.pop) || 0
    return acc + (count * pop)
  }, 0)
  if (total <= 0) return {}

  return normalizedPool.reduce((acc, item) => {
    const count = Number(item?.count) || 0
    const pop = Number(item?.pop) || 0
    const unit = String(item?.unit || '').trim()
    if (!unit || count <= 0 || pop <= 0) {
      if (unit) acc[unit] = 0
      return acc
    }
    acc[unit] = Math.ceil((minPop * ((count * pop) / total)) / pop)
    return acc
  }, {})
}
