import { useGoTiming } from "../hooks/useGoTiming"
import { nDateTime } from "../stable-compat/date-parse"
import { dateServer, timeServer } from "../stable-compat/date-tw"
import { dbGet, dbSet } from "./db"

const TABLE_PRODUCTION_DEFAULT_SEASON_SECONDS = 60
const TABLE_PRODUCTION_CACHE_ENTRIES_KEY = "table-production:entries"
const TABLE_PRODUCTION_NEXT_UPDATE_KEY = "table-production:next-update"

const getNowMs = () => {
  try {
    const nowMs = Number(useGoTiming?.getEffectiveServerNowMs?.())

    if (Number.isFinite(nowMs) && nowMs > 0) return nowMs
  } catch {}

  try {
    return nDateTime(dateServer(), timeServer())
  } catch {
    return Date.now()
  }
}

const normalizeCacheTtlMs = (seasonSeconds = null) => {
  const season = Number(seasonSeconds)
  const seconds = Number.isFinite(season) && season > 0
    ? Math.floor(season)
    : TABLE_PRODUCTION_DEFAULT_SEASON_SECONDS

  return seconds * 1000
}

const normalizeCacheKey = (key = "") => String(key || "").trim()

const buildTableProductionCacheKey = ({ premium = true, groupId = 0 } = {}) => {
  const mode = premium ? "p" : "np"
  return `${mode}:${Number(groupId || 0)}`
}

const normalizeCacheEntries = (cache = null) => {
  if (!cache) return {}

  if (Array.isArray(cache)) {
    return {
      "p:0": {
        values: cache,
        totalVillages: Number(cache.length || 0),
        updatedAtMs: 0
      }
    }
  }

  if (cache && typeof cache === "object") {
    if (cache.entries && typeof cache.entries === "object" && !Array.isArray(cache.entries)) {
      return Object.keys(cache.entries).reduce((entries, key) => {
        const normalizedKey = normalizeCacheKey(key)
        const value = cache.entries[key]

        if (!normalizedKey || !value || !Array.isArray(value.values)) return entries

        entries[normalizedKey] = {
          values: value.values,
          totalVillages: Number(value.totalVillages || 0),
          updatedAtMs: Number(value.updatedAtMs || 0)
        }

        return entries
      }, {})
    }

    // backward compatibility: formato antigo "byGroup"
    if (cache.byGroup && typeof cache.byGroup === "object" && !Array.isArray(cache.byGroup)) {
      return Object.keys(cache.byGroup).reduce((entries, key) => {
        const id = Number(key)
        const value = cache.byGroup[key]

        if (!Number.isFinite(id) || !value || !Array.isArray(value.values)) return entries

        entries[`p:${id}`] = {
          values: value.values,
          totalVillages: Number(value.totalVillages || 0),
          updatedAtMs: Number(value.updatedAtMs || 0)
        }

        return entries
      }, {})
    }
  }

  return {}
}

const normalizeNextUpdateEntries = (next = null) => {
  if (Number.isFinite(Number(next))) {
    return { "p:0": Number(next) }
  }

  if (!next || typeof next !== "object" || Array.isArray(next)) return {}

  return Object.keys(next).reduce((entries, key) => {
    const value = Number(next[key])

    if (!Number.isFinite(value)) return entries

    const keySafe = normalizeCacheKey(key)

    if (!keySafe) return entries

    if (keySafe.includes(":")) {
      entries[keySafe] = value
    } else {
      entries[`p:${Number(keySafe || 0)}`] = value
    }

    return entries
  }, {})
}

const getCacheEntries = async () => normalizeCacheEntries(await dbGet(TABLE_PRODUCTION_CACHE_ENTRIES_KEY))
const getNextEntries = async () => normalizeNextUpdateEntries(await dbGet(TABLE_PRODUCTION_NEXT_UPDATE_KEY))

const getCachedTableProduction = async ({
  cacheKey = "",
  totalVillages = 0,
  forceRefresh = false,
  ignoreTtl = false
}) => {
  if (forceRefresh) return null

  const key = normalizeCacheKey(cacheKey)
  if (!key) return null

  const entries = await getCacheEntries()
  const nextEntries = await getNextEntries()
  const cache = entries[key]
  const nextAt = Number(nextEntries[key] || 0)

  if (!cache || !Array.isArray(cache.values)) return null
  if (!ignoreTtl && (!nextAt || nextAt <= getNowMs())) return null
  if (Number(cache.totalVillages) !== Number(totalVillages)) return null

  return cache.values
}

const setCachedTableProduction = async ({ cacheKey = "", totalVillages = 0, ttlMs = 0, values = [] }) => {
  const key = normalizeCacheKey(cacheKey)
  if (!key) return

  const entries = await getCacheEntries()
  const nextEntries = await getNextEntries()
  const updatedAtMs = getNowMs()
  const nextAt = updatedAtMs + Number(ttlMs || 0)

  entries[key] = {
    values: Array.isArray(values) ? values : [],
    totalVillages: Number(totalVillages || 0),
    updatedAtMs
  }

  nextEntries[key] = nextAt

  try {
    await Promise.all([
      dbSet(TABLE_PRODUCTION_CACHE_ENTRIES_KEY, { entries }),
      dbSet(TABLE_PRODUCTION_NEXT_UPDATE_KEY, nextEntries),
    ])
  } catch (error) {
    console.warn("[table-production cache] persist fail", error?.message || error)
  }
}

export {
  buildTableProductionCacheKey,
  getCachedTableProduction,
  normalizeCacheTtlMs,
  setCachedTableProduction
}
