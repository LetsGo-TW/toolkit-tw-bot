import { ProtectingBot } from "@toolkit-tw-bot/document"
import { createQueuedMutationObserver } from "../observer/createQueuedMutationObserver"
import { CommandFakeLimit } from "../place/place-fake-limit"
import { CommandSenderDirect } from "../senders/senderDirect"

const SENDER_DIRECT_STYLE = '#CStime, #CSoffset {font-size: 9pt;font-family: Verdana,Arial;}#CSbutton {float:right;}'
const BOT_PROTECT_MESSAGE = 'Identified bot protection'

const isPlaceTryConfirm = (html = document) => !!(
  html.querySelector("#command-data-form") &&
  !html.querySelector("#command_target")
)

function cleanupCommandMapDom() {
  const fakeControlsRoot = document.querySelector("#target_fake")?.closest("span")
    || document.querySelector("#target_spy")?.closest("span")
    || document.querySelector("#auto_attack")?.closest("span")
    || document.querySelector("#auto_send_attack")?.closest("span")

  fakeControlsRoot?.remove?.()
  document.querySelector("#go-sender-direct")?.remove?.()
  document.querySelector("#CStime")?.closest("tr")?.remove?.()
  document.querySelector("#CSoffset")?.closest("tr")?.remove?.()
}

function isBotProtectError(error = null) {
  return String(error?.message || '').trim() === BOT_PROTECT_MESSAGE
    || String(error?.cause || '').trim().toLowerCase() === 'protecting-bot'
}

export function observeCommandMap() {
  let observer = null

  const finishBotProtectFlow = () => {
    observer?.disconnect?.()
    CommandFakeLimit.setBotProtectHandler(null)
    cleanupCommandMapDom()
    try { ProtectingBot.redirect() } catch { /* intentionally empty */ }
  }

  const syncCommandMap = async () => {
    if (ProtectingBot['bot-protect-all-in-game'].active()) {
      throw ProtectingBot.error()
    }

    if (!document.querySelector("#target_fake")) {
      CommandFakeLimit.init()
    }

    if (!document.querySelector("#CStime") && isPlaceTryConfirm()) {
      CommandSenderDirect.addGlobalStyle(SENDER_DIRECT_STYLE)
      await CommandSenderDirect.init()
    }
  }

  const observerTarget = document.body || document.documentElement
  CommandFakeLimit.setBotProtectHandler(finishBotProtectFlow)

  observer = createQueuedMutationObserver(syncCommandMap, {
    target: observerTarget,
    onError(error) {
      if (isBotProtectError(error) || ProtectingBot['bot-protect-all-in-game'].active()) {
        finishBotProtectFlow()
        return
      }

      console.error("[command-map][observer]", error)
    }
  })

  return () => {
    observer.disconnect()
    CommandFakeLimit.setBotProtectHandler(null)
    cleanupCommandMapDom()
  }
}
