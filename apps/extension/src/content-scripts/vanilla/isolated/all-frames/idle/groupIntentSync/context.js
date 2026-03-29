import { getGameData } from "@toolkit-tw-bot/browser"

export const GROUP_QUERY_KEYS = ["group", "group_id", "groupId"]

export const toFiniteNumber = (value, fallback = null) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const getCurrentGameData = () => getGameData() || null

export const parseUrl = (urlLike = null) => {
  try {
    if (!urlLike) return new URL(window.location.href)
    if (urlLike instanceof URL) return urlLike
    return new URL(String(urlLike), window.location.origin)
  } catch {
    return null
  }
}

export const readExplicitGroupFromUrl = (urlLike = null) => {
  const url = parseUrl(urlLike)
  if (!url) return null

  for (const key of GROUP_QUERY_KEYS) {
    const value = toFiniteNumber(url.searchParams.get(key), null)
    if (Number.isFinite(value)) return value
  }

  return null
}

export const readCurrentGroupIntentContext = (urlLike = null) => {
  const gameData = getCurrentGameData()
  const url = parseUrl(urlLike) || parseUrl(window.location.href)
  const explicitGroup = readExplicitGroupFromUrl(url)
  const screen = String(url?.searchParams.get("screen") || "").trim().toLowerCase()
  const mode = String(url?.searchParams.get("mode") || "").trim().toLowerCase()
  const gameDataGroup = toFiniteNumber(gameData?.group_id, null)
  const playerVillages = toFiniteNumber(gameData?.player?.villages, null)
  const group_id = gameDataGroup ?? explicitGroup ?? null
  const premiumFeature = gameData?.features?.Premium
  const premium_active = premiumFeature?.active === true
    ? true
    : premiumFeature?.active === false
      ? false
      : null

  return {
    host: String(window.location.host || ""),
    world: String(window.location.host || "").split(".")[0] || "",
    has_game_data: Boolean(gameData),
    player_id: toFiniteNumber(gameData?.player?.id, null),
    player_villages: playerVillages,
    village_id: toFiniteNumber(gameData?.village?.id, null),
    explicit_group_id: explicitGroup,
    group_id,
    premium_active,
    screen,
    mode,
    href: String(url?.href || window.location.href || ""),
    path: `${url?.pathname || ""}${url?.search || ""}${url?.hash || ""}`,
    updated_at: Date.now()
  }
}

export default readCurrentGroupIntentContext
