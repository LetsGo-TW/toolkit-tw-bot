import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document"
import { getParamsUrl } from "@toolkit-tw-bot/core"
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'

const CDN = 'GAME.STAGE'
const RUNNER_BOT_PROTECT_EVENT = 'toolkit:runner-bot-protect'
const BOT_PROTECT_HANDLER_KEY = '__toolkitTwBotGameStageBotProtectHandlerInstalled__'

const getCurrentGameData = () => {
  if (typeof window !== "undefined" && typeof window.game_data !== "undefined") {
    return window.game_data
  }
  return getGameData()
}

const installRunnerBotProtectListener = () => {
  if (window[BOT_PROTECT_HANDLER_KEY]) {
    return
  }

  window[BOT_PROTECT_HANDLER_KEY] = true

  window.addEventListener(RUNNER_BOT_PROTECT_EVENT, (event) => {
    if (typeof window.toolkitTwBotOnRunnerBotProtect === 'function') {
      window.toolkitTwBotOnRunnerBotProtect(event.detail)
      return
    }

    console.warn(`[${RUNNER_BOT_PROTECT_EVENT}]`, event.detail)
  })
}

const game = () => {
  const run = async () => {
    const gameData = getCurrentGameData();
    const runtimeParams = getParamsUrl(
      window.location.href,
      window.location.origin,
    )
    const isBotProtected = ProtectingBot['bot-protect-all-in-game'].active()
    const response = await chrome.runtime.sendMessage(RELEASE_EXTENSION_ID, {
      extensionId: RELEASE_EXTENSION_ID,
      type: CDN,
      world: gameData?.world,
      t: runtimeParams.t ?? null,
      playerId: gameData?.player?.id,
      playerName: gameData?.player?.name,
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

installRunnerBotProtectListener()
void game()

export default game
