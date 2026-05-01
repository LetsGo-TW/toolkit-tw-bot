import { dateServer, getGameData, normalizeDateTwString, timeServer } from "@toolkit-tw-bot/document"
import { nDateTime } from "@toolkit-tw-bot/core"
import { isPlaceTryConfirm } from "../shared/isPlaceTryConfirm"
import {
  getStoredSenderOffsetMs,
  reconcileStoredSenderOffsetMs,
  setStoredSenderOffsetMs
} from "../senders/timing"

export function afterCommand(html = document) {
  if (isPlaceTryConfirm(html)) return;
  const gameData = getGameData();
  const confirmStorageKey = `__confirm:date:time:mode:${gameData.world}:${gameData.player.id}`
  const beforeStorageKey = `__comm:before:${gameData.world}:${gameData.player.id}`
  const confirmRaw = localStorage.getItem(confirmStorageKey)
  if (!confirmRaw) return false;
  const beforeRaw = localStorage.getItem(beforeStorageKey)
  if (!beforeRaw) return false;

  const dTmTmode = JSON.parse(confirmRaw)
  const idsBefore = JSON.parse(beforeRaw)
  if (!html.querySelector("#commands_outgoings > table.vis")) return false;
  const commandCountText = html.querySelector("#commands_outgoings span.commands-command-count")?.innerText || ''
  const command_count = Number(commandCountText.match(/[0-9]{1,}/g)?.[0] || 0)
  if (command_count > 1000) return false;
  const idsAfter = Array.from(html.querySelector("#commands_outgoings > table.vis").querySelectorAll('span.quickedit-out')).map((e)=> e.dataset.id)
  const id = idsBefore.length === 0 ? idsAfter[0] : idsAfter.filter(e => idsBefore.indexOf(e) === -1)?.[0]
  if ( !id ) return false;
  const indice = idsAfter.indexOf(id)
  const tr_delay = Array.from(html.querySelector("#commands_outgoings > table.vis").querySelectorAll('tr.command-row'))[indice]
  if (!tr_delay) return false
  const strDate = normalizeDateTwString(tr_delay.querySelectorAll('td')[1].innerText)
  const strTime = tr_delay.querySelectorAll('td')[1].innerText.match( /[0-9]{2}[:][0-9]{2}[:][0-9]{2}/ig )[0]
  const strMs = tr_delay.querySelectorAll('td')[1].innerText.match( /[:][0-9]{3}$/ig )[0].replace(":", "")
  const arrival = nDateTime( strDate, strTime, strMs )
  const shipping = Number(dTmTmode[0])
  const oldOffset = getStoredSenderOffsetMs(gameData)
  const offsetAdjustment = reconcileStoredSenderOffsetMs({
    oldOffsetMs: oldOffset,
    desiredArrivalMs: shipping,
    actualArrivalMs: arrival
  })
  const goOffset = setStoredSenderOffsetMs(offsetAdjustment.offsetMs, gameData)
  const lastOffset = nDateTime( dateServer(), timeServer() )
  localStorage.setItem(`__offset:last:${gameData.world}:${gameData.player.id}`, lastOffset)
  localStorage.removeItem(confirmStorageKey)
  localStorage.removeItem(beforeStorageKey)
  // --- apaga comando quando for teste
  if (dTmTmode[ 1 ] === "delay") {
    tr_delay.querySelector("a.command-cancel").click()
  }
  return {
    updated: true,
    offsetMs: goOffset,
    errorMs: offsetAdjustment.errorMs,
    appliedStepMs: offsetAdjustment.appliedStepMs,
    level: offsetAdjustment.level
  }
}
