import Distance from '../../Distance/index.js'

function normalizeCoord(input) {
  if (!input) return null

  if (typeof input === 'string') {
    const [xRaw, yRaw] = String(input).split('|')
    const x = Number(xRaw)
    const y = Number(yRaw)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x, y }
  }

  const x = Number(input?.x)
  const y = Number(input?.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

function getMaxDistanceFromBased(sortingCoord, based = []) {
  if (!sortingCoord || !Array.isArray(based) || !based.length) return null

  let maxDistance = -Infinity
  for (let index = 0; index < based.length; index += 1) {
    const baseCoord = normalizeCoord(based[index])
    if (!baseCoord) continue
    const distance = Distance.create(baseCoord).calc(sortingCoord)
    if (Number.isFinite(distance) && distance > maxDistance) {
      maxDistance = distance
    }
  }

  return Number.isFinite(maxDistance) ? maxDistance : null
}

export function orderCoordsFromCoords(sorting = [], based = []) {
  if (!Array.isArray(sorting) || !sorting.length) return []
  if (!Array.isArray(based) || !based.length) return [...sorting]

  return [...sorting]
    .map((coord, index) => {
      const sortingCoord = normalizeCoord(coord)
      const maxDistance = getMaxDistanceFromBased(sortingCoord, based)
      return { index, coord, maxDistance }
    })
    .sort((a, b) => {
      const aDistance = Number.isFinite(a.maxDistance) ? a.maxDistance : -Infinity
      const bDistance = Number.isFinite(b.maxDistance) ? b.maxDistance : -Infinity
      if (bDistance !== aDistance) return bDistance - aDistance
      return a.index - b.index
    })
    .map((item) => item.coord)
}

export default orderCoordsFromCoords
