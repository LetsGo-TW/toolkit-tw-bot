import { getGameData } from '@toolkit-tw-bot/document';
import { StorageLocalCompat } from '@toolkit-tw-bot/browser';
import configBase from './index.json'
import schedulesBase from './schedules/index.json';

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

const storageConfigFarm = StorageLocalCompat.create({ world, playerId, path: ['config-farm'] })
const storageFarmSchedules = StorageLocalCompat.create({ world, playerId, path: ['farm-schedule'] })
const storageFarmLog = StorageLocalCompat.create({ world, playerId, path: ['farm-log'] })
const storageFarmIframe = StorageLocalCompat.create({ world, playerId, path: ['farm-iframe'] })
const storageFarmSession = StorageLocalCompat.create({ world, playerId, path: ['farm-session-v1'] })

async function initFarmConfig() {
  if (!(await storageConfigFarm.exists())) await storageConfigFarm.set(configBase)
  if (!(await storageFarmSchedules.exists())) await storageFarmSchedules.set(schedulesBase)
  if (!(await storageFarmLog.exists())) await storageFarmLog.set([])
}

export {
  initFarmConfig,
  storageConfigFarm,
  configBase,
  storageFarmSchedules,
  storageFarmLog,
  storageFarmIframe,
  storageFarmSession
}
