import { storageConfigFarm, configBase } from "."
import { getGameData } from "@toolkit-tw-bot/document"
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { useGoTiming } from "../../hooks/useGoTiming"
import { BotViewStatus } from "../../shared/bot-view-status"

function getServerTimeInSeconds() {
  try {
    const effectiveServerNowMs = Number(useGoTiming?.getEffectiveServerNowMs?.())

    if (Number.isFinite(effectiveServerNowMs) && effectiveServerNowMs > 0) {
      return Math.floor(effectiveServerNowMs / 1000)
    }
  } catch {}

  // Compat fallback para páginas onde o hub de timing ainda não ficou pronto.
  if (window.Timing && typeof window.Timing.getCurrentServerTime === 'function') {
    return Math.floor(window.Timing.getCurrentServerTime() / 1000)
  }

  console.warn("[saveLastInConfig] Não foi possível obter o tempo efetivo do servidor. Usando o tempo do cliente como fallback.")
  return Math.round(Date.now() / 1000)
}

async function saveLastInConfig(source, target) {
  const storageConfig = await storageConfigFarm.get() || configBase
  storageConfig.last = getServerTimeInSeconds() + 5
  await storageConfigFarm.set(storageConfig)

  try {
    const gameData = getGameData()
    const response = await chrome.runtime.sendMessage(RELEASE_EXTENSION_ID, {
      extensionId: RELEASE_EXTENSION_ID,
      type: 'FARM_CONFIG_CHANGED',
      world: gameData?.world,
      playerId: parseInt(gameData?.player?.id, 10),
    }).catch(() => null)

    BotViewStatus.apply(response)
  } catch {}

  window.postMessage({ source, target, action: "set-farm-last" });
}

export { saveLastInConfig }
