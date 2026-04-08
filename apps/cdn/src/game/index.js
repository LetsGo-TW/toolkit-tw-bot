import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document"
import { getParamsUrl } from "@toolkit-tw-bot/core"
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { DynamicImports } from "../dynamic-import"
import ConfigSolver from "../hCaptcha/config"

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

const getDynamicImport = async (moduleName) => {
  if (typeof moduleName !== 'string' || !moduleName.trim()) {
    return null
  }

  const loader = DynamicImports[moduleName]

  if (typeof loader !== 'function') {
    return null
  }

  return await loader()
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

    if (!response || response.ok !== true) return;

    // ativa CS listen
    document.querySelector("html")?.setAttribute('data-activetab', 'true')

    const data = response.data ?? null
    const machineName = typeof response.machine === 'string'
      ? response.machine.trim()
      : ''
    const moduleName = typeof response.module === 'string'
      ? response.module.trim()
      : ''

    await ConfigSolver.init()

    if (machineName === 'solver') {
      const solver = await getDynamicImport(machineName)
      if (!solver) return
      await solver(data)
      return
    }

    const moduleRunner = await getDynamicImport(moduleName)
    const machineRunner = await getDynamicImport(machineName)

    console.log({
      module: moduleName || null,
      machine: machineName || null,
      hasModuleRunner: Boolean(moduleRunner),
      hasMachineRunner: Boolean(machineRunner),
    })

    if (moduleRunner) {
      await moduleRunner(data)
    }

    if (!machineRunner) return
    await machineRunner(data)
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
