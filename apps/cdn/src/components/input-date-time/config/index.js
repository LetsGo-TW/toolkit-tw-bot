import { getGameData } from '@toolkit-tw-bot/document'
import StorageLocalCompat from '../../../shared/indexdb/storage-local-compat.js'
import configBase from './index.json'

const getCurrentGameData = () => {
  if (typeof window !== "undefined" && typeof window.game_data !== "undefined") {
    return window.game_data
  }

  if (typeof document === "undefined") return null

  return getGameData()
}

const gameData = getCurrentGameData()
const storageInputDateTime = StorageLocalCompat.create({
  world: gameData?.world ?? null,
  playerId: gameData?.player?.id ?? null,
  path: ['input-date-time', 'state'],
})

void (async () => {
  if (!(await storageInputDateTime.exists())) {
    await storageInputDateTime.set(configBase)
  }
})()

export {
  storageInputDateTime
}
