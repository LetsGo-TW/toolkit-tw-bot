import { getGameData } from '@toolkit-tw-bot/document';
import { StorageLocalCompat } from '@toolkit-tw-bot/browser';
import templates from './templates.json';

const getCurrentGameData = () => {
  if (typeof window !== "undefined" && typeof window.game_data !== "undefined") {
    return window.game_data
  }

  if (typeof document === "undefined") return null

  return getGameData()
}

function getCurrentWorld() {
  return String(getCurrentGameData()?.world || "").trim() || null
}

function getCurrentPlayerId() {
  const raw = Number(getCurrentGameData()?.player?.id)
  return Number.isFinite(raw) && raw > 0 ? raw : null
}

const world = getCurrentWorld()
const playerId = getCurrentPlayerId()

const storageBreakWallTemplates = StorageLocalCompat.create({ world, playerId, path: ['break-wall-template'] })
const storageBreakWallReports = StorageLocalCompat.create({ world, playerId, path: ['break-wall-report'] })
const storageBreakWallTargetsSent = StorageLocalCompat.create({ world, playerId, path: ['break-wall-sent'] })
const storageBreakWallBlacklist = StorageLocalCompat.create({ world, playerId, path: ['break-wall-blacklist'] });
const storageBreakWallRedReviewed = StorageLocalCompat.create({ world, playerId, path: ['break-wall-red-reviewed'] });

async function initBreakWallConfig() {
  if (!(await storageBreakWallTemplates.exists())) await storageBreakWallTemplates.set(templates)
}

export {
  initBreakWallConfig,
  storageBreakWallTemplates, storageBreakWallReports, storageBreakWallTargetsSent, storageBreakWallBlacklist, storageBreakWallRedReviewed
}
