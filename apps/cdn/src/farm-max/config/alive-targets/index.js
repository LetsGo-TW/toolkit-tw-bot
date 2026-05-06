import { getGameData } from '@toolkit-tw-bot/document';
import { StorageLocalCompat } from '@toolkit-tw-bot/browser';

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

const storageAliveTargets = StorageLocalCompat.create({ world, playerId, path: ['alive-targets'] })

export {
  storageAliveTargets
}
