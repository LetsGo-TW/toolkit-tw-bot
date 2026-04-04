import getGameData from "@toolkit-tw-bot/document/getGameData"
import ProtectingBot from "@toolkit-tw-bot/document/protectingBot"
import { getParamsUrl, ParsedGameData } from "@toolkit-tw-bot/core"
import { GameData } from "../../../../../../types"

type CurrentGameData = ParsedGameData & GameData
type CurrentWindow = Window & {
  game_data?: CurrentGameData
}

function getCurrentGameData(doc: Document = document) {
  const currentWindow = window as CurrentWindow

  if (typeof currentWindow.game_data !== 'undefined' && currentWindow.game_data) {
    return currentWindow.game_data
  }

  return getGameData(doc) as CurrentGameData
}

function getCurrentUrl() {
  return new URL(window.location.href, window.location.origin)
}

function getCurrentWorldFromUrl(urlString: string = window.location.href) {
  try {
    const url = new URL(urlString, window.location.origin)
    const worldFromPortalPath = url.pathname.match(/^\/page\/play\/([^/?#]+)/)?.[1] || null
    const world = url.hostname.split('.')[0] || worldFromPortalPath || null

    return world === 'www' ? worldFromPortalPath : world
  } catch {
    return null
  }
}

function getPopupPageSnapshot({
  isBotProtected,
}: {
  isBotProtected?: boolean | null
} = {}) {
  const gameData = getCurrentGameData()
  const runtimeParams = getParamsUrl(
    window.location.href,
    window.location.origin,
  )

  return {
    ok: true,
    context: runtimeParams.isInLogin
      ? 'LOGIN'
      : runtimeParams.isInGame
        ? 'GAME'
        : null,
    world: gameData?.world ?? getCurrentWorldFromUrl(),
    t: runtimeParams.t ?? null,
    playerId: isFinitePlayerId(gameData?.player?.id)
      ? gameData.player.id
      : null,
    playerName: gameData?.player?.name ?? null,
    features: gameData?.features ?? null,
    points: gameData?.player?.points ?? null,
    rank: gameData?.player?.rank ?? null,
    villages: gameData?.player?.villages ?? null,
    dateStarted: gameData?.player?.date_started ?? null,
    isBotProtected: typeof isBotProtected === 'boolean'
      ? isBotProtected
      : runtimeParams.isInGame
        ? ProtectingBot['bot-protect-all-in-game'].active(document)
        : ProtectingBot['hCaptcha-in-popup'].active(document),
    isTryConfirm: runtimeParams.isTryConfirm === true,
    isIntro: runtimeParams.isIntro === true,
  }
}

function isFinitePlayerId(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export {
  getCurrentGameData,
  getCurrentUrl,
  getCurrentWorldFromUrl,
  getPopupPageSnapshot,
  isFinitePlayerId,
  CurrentGameData,
}
