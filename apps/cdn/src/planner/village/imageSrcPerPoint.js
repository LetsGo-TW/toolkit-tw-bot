import imgVersionPerPoint from "./imgVersionPerPoint"

export function imageSrcPerPoint(points, playerId) {
  points = Number(points.replaceAll('.', ''))
  const version = imgVersionPerPoint.find(({p_min, p_max}) => p_max >= points && p_min <= points)
  return `https://dsbr.innogamescdn.com/asset/c645ceed/graphic/map/icon/v${version.v}${Number(playerId) ? '' : '_left'}_icon.webp`
}
