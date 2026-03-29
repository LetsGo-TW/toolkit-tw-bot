import {
  GROUP_QUERY_KEYS,
  parseUrl,
  readExplicitGroupFromUrl,
  toFiniteNumber
} from "./context"

const ENCODED_SCREEN_PATTERN = /^[0-9a-f]{2}(?::[0-9a-f]{2})+$/i

export const isTwGameUrl = (urlLike = null) => {
  const url = parseUrl(urlLike)
  if (!url) return false

  return url.origin === window.location.origin && /\/game\.php$/i.test(url.pathname)
}

export const isGroupManagementScreenUrl = (urlLike = null) => {
  const url = parseUrl(urlLike)
  if (!url) return false

  const screen = String(url.searchParams.get("screen") || "").trim().toLowerCase()
  const mode = String(url.searchParams.get("mode") || "").trim().toLowerCase()

  return screen === "overview_villages" && mode === "groups"
}

export const isStaticGroupManagementScreenUrl = (urlLike = null) => {
  const url = parseUrl(urlLike)
  if (!url) return false

  const screen = String(url.searchParams.get("screen") || "").trim().toLowerCase()
  const type = String(url.searchParams.get("type") || "").trim().toLowerCase()
  const mode = String(url.searchParams.get("mode") || "").trim().toLowerCase()

  return screen === "overview_villages" && type === "static" && mode === "groups"
}

export const isOverviewVillagesScreenUrl = (urlLike = null) => {
  const url = parseUrl(urlLike)
  if (!url) return false

  const screen = String(url.searchParams.get("screen") || "").trim().toLowerCase()
  return screen === "overview_villages"
}

export const shouldForceOverviewVillagesPage = (urlLike = null) => {
  const url = parseUrl(urlLike)
  if (!url) return false
  if (!isOverviewVillagesScreenUrl(url)) return false

  const mode = String(url.searchParams.get("mode") || "").trim().toLowerCase()
  return mode !== "groups"
}

export const hasExplicitGroupParam = (urlLike = null) => (
  Number.isFinite(readExplicitGroupFromUrl(urlLike))
)

export const getGroupFixUrlBlockReason = (urlLike = null) => {
  const url = parseUrl(urlLike)
  if (!url) return "invalid-url"
  if (!isTwGameUrl(url)) return "non-game-url"

  const screen = String(url.searchParams.get("screen") || "").trim().toLowerCase()
  const mode = String(url.searchParams.get("mode") || "").trim().toLowerCase()
  const action = String(url.searchParams.get("action") || "").trim().toLowerCase()

  if (screen === "overview" && action === "reset") return "overview-reset-action"
  if (action === "logout") return "logout-action"
  if (screen === "extforum") return "extforum-screen"
  if (screen === "settings" && mode === "ticket") return "settings-ticket-screen"
  if (ENCODED_SCREEN_PATTERN.test(screen)) return "encoded-screen"

  return ""
}

export const withGroupFix = (urlLike, groupId, options = {}) => {
  const parsedUrl = parseUrl(urlLike)
  const url = parsedUrl ? new URL(parsedUrl.toString()) : null
  const normalizedGroupId = toFiniteNumber(groupId, null)
  const forceExplicitGroup = options?.forceExplicitGroup === true
  const blockReason = getGroupFixUrlBlockReason(url)

  if (!url) return String(urlLike || "")
  if (blockReason) return url.toString()
  if (!Number.isFinite(normalizedGroupId)) return url.toString()

  const explicitGroup = readExplicitGroupFromUrl(url)
  if (!Number.isFinite(explicitGroup) || forceExplicitGroup) {
    url.searchParams.set(GROUP_QUERY_KEYS[0], String(normalizedGroupId))
  }

  // Only set page=0 if page parameter doesn't already exist
  if (shouldForceOverviewVillagesPage(url) && !url.searchParams.has("page")) {
    url.searchParams.set("page", "0")
  }

  return url.toString()
}

export default withGroupFix
