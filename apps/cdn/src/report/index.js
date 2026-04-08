import { getGameData } from "@toolkit-tw-bot/document"
import { useGoTiming } from "../hooks/useGoTiming"
import StorageLocalCompat from "../shared/indexdb/storage-local-compat.js"

const REPORT_INDEX_PATH = ["report", "__types__"]
const MAX_REPORTS_PER_TYPE = 100
const storageByComposeKey = new Map()

const normalizeReports = (value) => Array.isArray(value) ? value : []

const normalizeReportType = (value = "") => String(value || "").trim()

const normalizeReportTypeKey = (value = "") => normalizeReportType(value)
  .toLowerCase()
  .replace(/\s+/g, "-")

const getCurrentGameData = () => {
  if (typeof window !== "undefined" && window?.game_data) {
    return window.game_data
  }

  try {
    return getGameData()
  } catch {
    return null
  }
}

const getReportContext = () => {
  const gameData = getCurrentGameData()
  const world = String(gameData?.world || "").trim()
  const playerId = Number(gameData?.player?.id || 0)

  if (!world || !playerId) {
    return null
  }

  return {
    world,
    playerId,
  }
}

const getStorageByPath = (path = []) => {
  const context = getReportContext()
  const normalizedPath = Array.isArray(path) ? path.filter(Boolean) : []

  if (!context || !normalizedPath.length) {
    return null
  }

  const compose = {
    world: context.world,
    playerId: context.playerId,
    path: normalizedPath,
  }

  const composeKey = `${context.world}:${context.playerId}:${normalizedPath.join(":")}`

  if (!storageByComposeKey.has(composeKey)) {
    storageByComposeKey.set(composeKey, StorageLocalCompat.create(compose))
  }

  return storageByComposeKey.get(composeKey)
}

const getReportStorage = (type = "") => {
  const typeKey = normalizeReportTypeKey(type)
  if (!typeKey) return null
  return getStorageByPath(["report", typeKey])
}

const getReportIndexStorage = () => getStorageByPath(REPORT_INDEX_PATH)

const normalizeReportTypeKeys = (value) => Array.from(new Set(
  (Array.isArray(value) ? value : [])
    .map((item) => normalizeReportTypeKey(item))
    .filter(Boolean)
))

const getReportSortTimestamp = (report = {}) => {
  const timestamp = Number(report?.date || report?.timestamp || 0)
  return Number.isFinite(timestamp) ? timestamp : 0
}

const readReportTypeKeys = async () => {
  const storage = getReportIndexStorage()
  return normalizeReportTypeKeys(await storage?.get?.())
}

const saveReportTypeKeys = async (typeKeys = []) => {
  const storage = getReportIndexStorage()
  const nextTypeKeys = normalizeReportTypeKeys(typeKeys)

  if (!storage) return nextTypeKeys

  if (!nextTypeKeys.length) {
    await storage.remove()
    return []
  }

  await storage.set(nextTypeKeys)
  return nextTypeKeys
}

const addReportTypeKey = async (type = "") => {
  const typeKey = normalizeReportTypeKey(type)
  if (!typeKey) return []

  const typeKeys = await readReportTypeKeys()
  if (typeKeys.includes(typeKey)) {
    return typeKeys
  }

  return await saveReportTypeKeys([typeKey, ...typeKeys])
}

const removeReportTypeKey = async (type = "") => {
  const typeKey = normalizeReportTypeKey(type)
  if (!typeKey) return await readReportTypeKeys()

  const typeKeys = await readReportTypeKeys()
  return await saveReportTypeKeys(typeKeys.filter((entry) => entry !== typeKey))
}

const readReportsByType = async (type = "") => {
  const storage = getReportStorage(type)
  return normalizeReports(await storage?.get?.())
}

const writeReportsByType = async (type = "", reports = []) => {
  const reportType = normalizeReportType(type)
  const nextReports = normalizeReports(reports)
  const storage = getReportStorage(reportType)

  if (!storage || !reportType) {
    return nextReports
  }

  if (!nextReports.length) {
    await storage.remove()
    await removeReportTypeKey(reportType)
    return []
  }

  await storage.set(nextReports)
  await addReportTypeKey(reportType)
  return nextReports
}

const getReportNowMs = () => {
  try {
    const offsetMs = Number(useGoTiming?.getOffsetMs?.())
    if (Number.isFinite(offsetMs)) {
      const nowMs = Date.now() + offsetMs
      if (Number.isFinite(nowMs) && nowMs > 0) return nowMs
    }
  } catch {}

  try {
    const nowMs = Number(useGoTiming?.getEffectiveServerNowMs?.())
    if (Number.isFinite(nowMs) && nowMs > 0) return nowMs
  } catch {}

  return Date.now()
}

const Report = {
  reports: null,

  async new(type, params) {
    const reportType = normalizeReportType(type)
    if (!reportType) return []

    const reports = await Report.recicle(reportType)
    reports.unshift({
      type: reportType,
      date: getReportNowMs(),
      ...params,
    })
    reports.length = Math.min(reports.length, MAX_REPORTS_PER_TYPE)
    Report.reports = reports
    return await Report.set(reportType, reports)
  },

  async get(type) {
    const reportType = normalizeReportType(type)

    if (reportType) {
      return await readReportsByType(reportType)
    }

    const typeKeys = await readReportTypeKeys()
    const reportsByType = await Promise.all(typeKeys.map((typeKey) => readReportsByType(typeKey)))

    return reportsByType
      .flat()
      .sort((left, right) => getReportSortTimestamp(right) - getReportSortTimestamp(left))
  },

  async set(type = "", reports = Report.reports) {
    const nextReports = normalizeReports(reports)
    const reportType = normalizeReportType(type || nextReports[0]?.type)

    if (!reportType) {
      Report.reports = nextReports
      return nextReports
    }

    Report.reports = await writeReportsByType(reportType, nextReports)
    return Report.reports
  },

  async recicle(typeOrDays = null, days = 7) {
    let reportType = ""
    let retentionDays = Number(days)

    if (typeof typeOrDays === "number" && Number.isFinite(typeOrDays)) {
      retentionDays = typeOrDays
    } else {
      reportType = normalizeReportType(typeOrDays)
    }

    const nowMs = getReportNowMs()
    const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000
    const reports = await Report.get(reportType)

    return reports.filter((report) => getReportSortTimestamp(report) > nowMs - maxAgeMs)
  },

  async remove(type = "") {
    const reportType = normalizeReportType(type)

    if (reportType) {
      const storage = getReportStorage(reportType)
      await storage?.remove?.()
      await removeReportTypeKey(reportType)
      Report.reports = normalizeReports(Report.reports).filter((report) => normalizeReportType(report?.type) !== reportType)
      return
    }

    const typeKeys = await readReportTypeKeys()
    await Promise.all(typeKeys.map(async (typeKey) => {
      const storage = getReportStorage(typeKey)
      await storage?.remove?.()
    }))

    const indexStorage = getReportIndexStorage()
    await indexStorage?.remove?.()
    Report.reports = null
  },
}

export { Report }
