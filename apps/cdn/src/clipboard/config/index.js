import { getGameData } from "@toolkit-tw-bot/document"
import StorageLocalCompat from "../../shared/indexdb/storage-local-compat"

export async function copyToClipboardConfigInit() {
  const gameData = getGameData()
  const configBase = {
    coords: { active: false, print: false, selectionOnly: false },
    datetime: { active: false, print: false }
  }

  const copyToClipboardStorageLocal = StorageLocalCompat.create({
    world: gameData?.world ?? null,
    playerId: gameData?.player?.id ?? null,
    path: ['copy-to-clipboard', 'config'],
  })

  if (!(await copyToClipboardStorageLocal.exists())) {
    await copyToClipboardStorageLocal.set(configBase)
  }

  return {
    copyToClipboardStorageLocal
  }
}
