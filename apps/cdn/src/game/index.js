import { getGameData, ProtectingBot } from "@toolkit-tw-bot/browser"
import { getParamsUrl } from "@toolkit-tw-bot/core"

const CDN = 'GAME.STAGE'

const getCurrentGameData = () => {
  if (typeof window !== "undefined" && typeof window.game_data !== "undefined") {
    return window.game_data
  }
  return getGameData()
}

const game = (extensionId) => {
  const run = async () => {
    const gameData = getCurrentGameData();
    const runtimeParams = getParamsUrl(
      window.location.href,
      window.location.origin,
    )
    const isBotProtected = ProtectingBot['bot-protect-all-in-game'].active()
    const response = await chrome.runtime.sendMessage(extensionId, {
      extensionId,
      type: CDN,
      world: gameData?.world,
      t: runtimeParams.t ?? null,
      playerId: gameData?.player?.id,
      playerName: gameData?.player?.name,
      avatarUrl: gameData?.player?.avatar || gameData?.player?.image || null,
      isBotProtected,
    })

    console.log(`[${CDN}]: `, response);

    // ativa CS listen
    document.querySelector("html")?.setAttribute('data-activetab', 'true')

    // if (!response || response.ok !== true) return;

    // if (isBotProtected || ProtectingBot['bot-protect-all-in-game'].active()) {
    //   const solver = await DinamicImports.solver()
    //   await solver(data)
    //   return
    // }

    // const url = new URL(window.location.href, window.location.origin)
    // const screen = url.searchParams.get('screen')
    
    // const insert = {}
    // insert[screen] = DinamicImports[screen] ? await DinamicImports[screen]() : null
    // insert.game = await DinamicImports.game()
    // console.log({ insert })
    // if (insert[screen]) await insert[screen](data)
    // await insert.game(data)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true })
  } else {
    run()
  }
}

const preparedExtensionId = window.dataStart?.extensionId

if (preparedExtensionId) {
  delete window.dataStart

  void game(preparedExtensionId)
}

export default game
