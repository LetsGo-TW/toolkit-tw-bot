import { getGameData } from "@toolkit-tw-bot/document"

const GROUP_QUERY_KEYS = ["group", "group_id", "groupId"]

export const getCurrentGameData = () => {
  if (typeof window !== "undefined" && typeof window.game_data !== "undefined") {
    return window.game_data
  }

  if (typeof document === "undefined") return null

  return getGameData()
}

export const hasPremiumGroups = (gameData = getCurrentGameData()) => (
  gameData?.features?.Premium?.active === true
)

export const getGroupFix = (fallback = 0) => {
  try {
    const url = new URL(window.location.href)

    for (const key of GROUP_QUERY_KEYS) {
      const raw = url.searchParams.get(key)
      if (raw == null || raw === "") continue

      const parsed = Number(raw)
      if (Number.isFinite(parsed)) return parsed
    }
  } catch {}

  const currentGameData = getCurrentGameData()
  const groupFromGameData = Number(currentGameData?.group_id)
  if (Number.isFinite(groupFromGameData)) return groupFromGameData

  const fallbackGroup = Number(fallback)
  if (Number.isFinite(fallbackGroup)) return fallbackGroup

  return 0
}

const isGamePhpUrl = (url) => {
  if (!(url instanceof URL)) return false
  return /\/game\.php$/i.test(String(url.pathname || ""))
}

const shouldForceOverviewVillagesPage = (url) => {
  if (!(url instanceof URL)) return false

  const screen = String(url.searchParams.get("screen") || "").trim().toLowerCase()
  if (screen !== "overview_villages") return false

  const mode = String(url.searchParams.get("mode") || "").trim().toLowerCase()
  return mode !== "groups"
}

export const withGroupFix = (input, groupId = getGroupFix()) => {
  if (input == null || input === "") return input
  if (!hasPremiumGroups()) return input

  const normalizedGroupId = Number(groupId)
  if (!Number.isFinite(normalizedGroupId)) return input

  const raw = String(input)
  const isUrlInstance = input instanceof URL
  const isRelativePath = !isUrlInstance && /^\/(?!\/)/.test(raw)

  let url
  try {
    url = isUrlInstance
      ? new URL(input.toString())
      : new URL(raw, window.location.origin)
  } catch {
    return input
  }

  if (!isGamePhpUrl(url)) return input

  url.searchParams.delete("group")
  url.searchParams.delete("group_id")
  url.searchParams.delete("groupId")
  url.searchParams.set("group", String(normalizedGroupId))

  if (shouldForceOverviewVillagesPage(url)) {
    url.searchParams.set("page", "0")
  }

  if (isUrlInstance) return url
  if (isRelativePath) return `${url.pathname}${url.search}${url.hash}`
  return url.toString()
}
