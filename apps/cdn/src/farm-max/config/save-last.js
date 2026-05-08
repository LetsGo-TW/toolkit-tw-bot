import { storageConfigFarm, configBase } from "."
import { getGameData } from "@toolkit-tw-bot/document"
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'

function getServerTimeInSeconds() {
  // window.Timing.getCurrentServerTime() é a fonte mais confiável de tempo do servidor, em milissegundos.
  if (window.Timing && typeof window.Timing.getCurrentServerTime === 'function') {
    return Math.floor(window.Timing.getCurrentServerTime() / 1000);
  }

  console.warn("[saveLastInConfig] Não foi possível obter o tempo do servidor via 'Timing.getCurrentServerTime()'. Usando o tempo do cliente como fallback. Isso pode causar inconsistências com o Bônus Noturno.");
  return Math.round(Date.now() / 1000);
}

async function saveLastInConfig(source, target) {
  const storageConfig = await storageConfigFarm.get() || configBase
  storageConfig.last = getServerTimeInSeconds() + 5
  await storageConfigFarm.set(storageConfig)

  try {
    const gameData = getGameData()
    chrome.runtime.sendMessage(RELEASE_EXTENSION_ID, {
      extensionId: RELEASE_EXTENSION_ID,
      type: 'FARM_CONFIG_CHANGED',
      world: gameData?.world,
      playerId: parseInt(gameData?.player?.id, 10),
    }).catch(() => null)
  } catch {}

  window.postMessage({ source, target, action: "set-farm-last" });
}

export { saveLastInConfig }
