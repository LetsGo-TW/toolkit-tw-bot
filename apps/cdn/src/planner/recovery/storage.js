import { getGameData } from "@toolkit-tw-bot/document";
import StorageLocalCompat from "../../shared/indexdb/storage-local-compat.js";

const PLANNER_LAST_REPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const PLANNER_LAST_REPORT_PATH = ['planner', 'last-report']

const plannerLastReportStorageByComposeKey = new Map()

function getPlannerLastReportStorage() {
  try {
    const gameData = getGameData()
    const world = String(gameData?.world || window?.game_data?.world || '').trim()
    const playerId = Number(gameData?.player?.id || window?.game_data?.player?.id)
    if (!world || !Number.isFinite(playerId)) return null
    const composeKey = `${world}:${playerId}:${PLANNER_LAST_REPORT_PATH.join(':')}`
    if (!plannerLastReportStorageByComposeKey.has(composeKey)) {
      plannerLastReportStorageByComposeKey.set(composeKey, StorageLocalCompat.create({
        world,
        playerId,
        path: PLANNER_LAST_REPORT_PATH,
      }))
    }
    return plannerLastReportStorageByComposeKey.get(composeKey)
  } catch (_) {
    return null
  }
}

export async function readPlannerLastReport() {
  const storage = getPlannerLastReportStorage()
  if (!storage) return null
  const data = await storage.get?.()
  if (!data || typeof data !== 'object') return null
  const expiresAt = Number(data?.expiresAt)
  if (Number.isFinite(expiresAt) && expiresAt > 0 && Date.now() > expiresAt) {
    await storage.remove?.()
    return null
  }
  return data
}

export async function writePlannerLastReport(report) {
  const storage = getPlannerLastReportStorage()
  if (!storage || !report || typeof report !== 'object') return null
  const now = Date.now()
  const createdAt = Number.isFinite(Number(report?.createdAt)) ? Number(report.createdAt) : now
  const updatedAt = Number.isFinite(Number(report?.updatedAt)) ? Number(report.updatedAt) : now
  const payload = {
    ...report,
    createdAt,
    updatedAt,
    expiresAt: updatedAt + PLANNER_LAST_REPORT_TTL_MS
  }
  await storage.set?.(payload)
  return payload
}
