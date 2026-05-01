import { loaderGame } from "../components/loaderGame"
import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document"
import { nDateTime } from "@toolkit-tw-bot/core"
import { getStoredSenderOffsetMs, scheduleSenderDispatch } from "./timing"

class CommanderSchedules {
  confirmButton = null
  init = function( arrDateTimeMs ) {
    this.confirmButton = window.$('#troop_confirm_submit');
    (function() {
      const gameData = getGameData();
      const offset = getStoredSenderOffsetMs(gameData)
      const attackTime = nDateTime(arrDateTimeMs[0], arrDateTimeMs[1], arrDateTimeMs[2])
      CommandSenderSchedules.confirmButton.addClass('btn-disabled')
      loaderGame.insert()
      scheduleSenderDispatch({
        targetSendMs: attackTime,
        offsetMs: offset,
        beforeDispatch() {
          if (ProtectingBot['bot-protect-all-in-game'].active()) {
            throw ProtectingBot.error()
          }
        },
        onDispatch() {
          CommandSenderSchedules.confirmButton.click()
        },
        onError(error) {
          loaderGame.remove()
          console.error("[sender-schedules][schedule]", error)
        }
      })
    }())
  }
}

export const CommandSenderSchedules = new CommanderSchedules()
