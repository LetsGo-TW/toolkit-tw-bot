import { getGameData } from "@toolkit-tw-bot/document";
import StorageLocalCompat from "../../../../shared/indexdb/storage-local-compat.js";

const TABLE_SENDER_FILTER_PATH = ['planner', 'table', 'sender-filter']

let storageTableSenderFilter = null
let tableSenderFilterStateCache = {}
let tableSenderFilterReady = false
let tableSenderFilterReadyPromise = null
let tableSenderFilterPersistQueue = Promise.resolve()

const getCurrentGameData = () => {
  if (typeof window !== "undefined" && typeof window.game_data !== "undefined") {
    return window.game_data
  }

  if (typeof document === "undefined") return null

  return getGameData()
}

function getStorage() {
  if (storageTableSenderFilter) return storageTableSenderFilter
  const gameData = getCurrentGameData()
  const world = String(gameData?.world || '').trim()
  const playerId = Number(gameData?.player?.id || 0)
  if (!world || !Number.isFinite(playerId) || playerId <= 0) return null
  storageTableSenderFilter = StorageLocalCompat.create({
    world,
    playerId,
    path: TABLE_SENDER_FILTER_PATH,
  })
  return storageTableSenderFilter
}

const normalizeMode = (mode) => String(mode || '').trim().toLowerCase() === 'send' ? 'send' : 'schedule'

const cloneState = (value = {}) => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : {}
)

export async function readyTableSenderFilterStorage() {
  if (tableSenderFilterReady) return cloneState(tableSenderFilterStateCache)
  if (!tableSenderFilterReadyPromise) {
    tableSenderFilterReadyPromise = (async() => {
      try {
        const storage = getStorage()
        const state = await storage?.get?.()
        tableSenderFilterStateCache = cloneState(state)
      } catch (error) {
        console.warn('[planner][table][storage][ready]', error?.message || error)
        tableSenderFilterStateCache = {}
      } finally {
        tableSenderFilterReady = true
      }
      return cloneState(tableSenderFilterStateCache)
    })()
      .finally(() => {
        tableSenderFilterReadyPromise = null
      })
  }
  return await tableSenderFilterReadyPromise
}

const readState = () => cloneState(tableSenderFilterStateCache)

const writeState = (next = {}) => {
  tableSenderFilterStateCache = cloneState(next)
  const snapshot = cloneState(tableSenderFilterStateCache)
  tableSenderFilterPersistQueue = tableSenderFilterPersistQueue
    .catch(() => null)
    .then(async() => {
      try {
        const storage = getStorage()
        if (!storage) return
        if (!Object.keys(snapshot).length) {
          await storage.remove?.()
          return
        }
        await storage.set?.(snapshot)
      } catch (error) {
        console.error('[planner][table][storage][write]', error)
      }
    })
}

export function getTableSenderFilterState(mode = 'schedule') {
  const normalizedMode = normalizeMode(mode)
  const state = readState()
  const value = state?.[normalizedMode]
  return value && typeof value === 'object' ? value : null
}

export function setTableSenderFilterState(mode = 'schedule', filterState = null) {
  const normalizedMode = normalizeMode(mode)
  const state = readState()
  if (!filterState || typeof filterState !== 'object') {
    delete state[normalizedMode]
    writeState(state)
    return
  }
  state[normalizedMode] = filterState
  writeState(state)
}

export function clearTableSenderFilterState(mode = null) {
  if (mode == null) {
    writeState({})
    return
  }
  const normalizedMode = normalizeMode(mode)
  const state = readState()
  delete state[normalizedMode]
  writeState(state)
}

void readyTableSenderFilterStorage()

export { storageTableSenderFilter }
