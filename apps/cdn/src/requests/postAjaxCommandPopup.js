import { parseTwJsonText } from "./utils/parseTwResponseText";
import { applyTemplateBuildTargetToPayloadEntries } from "./utils/applyTemplateBuildTargetToPayloadEntries.js";
import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document";
import { combineAbortControllerSignals, makeAjaxBody, makeAjaxHeadersPost } from "@toolkit-tw-bot/browser";
import { consoleDev } from "@toolkit-tw-bot/utils";

function toPayloadEntries(payloadCommand) {
  if (Array.isArray(payloadCommand)) {
    return payloadCommand.reduce((acc, entry) => {
      if (!Array.isArray(entry) || entry.length < 2) return acc
      const [name, value] = entry
      if (!name) return acc
      acc.push([String(name), value ?? ''])
      return acc
    }, [])
  }
  if (payloadCommand && typeof payloadCommand === 'object') {
    return Object.entries(payloadCommand).reduce((acc, [name, value]) => {
      if (!name) return acc
      acc.push([String(name), value ?? ''])
      return acc
    }, [])
  }
  return []
}

export async function postAjaxCommandPopup(payloadConfirm, {
  signal,
  templateNormalized
} = {}) {
  const gameData = getGameData()
  const url = new URL(
    `${gameData.link_base_pure}place&ajaxaction=popup_command`,
    window.origin
  )
  const payloadEntries = applyTemplateBuildTargetToPayloadEntries(payloadConfirm, {
    templateNormalized
  })
  const body = makeAjaxBody(payloadEntries)
  const headers = makeAjaxHeadersPost()
  const timeoutCtrl = new AbortController()
  const t = setTimeout(() => timeoutCtrl.abort(new Error("timeout")), 8000)
  const combinedSignal = signal
    ? combineAbortControllerSignals([signal, timeoutCtrl.signal])
    : timeoutCtrl.signal
  const req = new Request(url.toString(), {
    method: "POST",
    headers,
    body,
    credentials: "include",
    referrerPolicy: "origin",
    cache: "no-store",
    signal: combinedSignal
  })

  if (ProtectingBot["bot-protect-all-in-game"].active()) {
    clearTimeout(t)
    throw ProtectingBot.error()
  }

  try {
    let responseJson = null
    const res = await fetch(req)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    responseJson = parseTwJsonText(
      await res.text(),
      "planner.postAjaxCommandPopup:response"
    )
    const { game_data, response, error } = responseJson || {}
    if (error || !response) {
      consoleDev.error({
        event: 'tw-response-error',
        stage: 'phase3-send',
        request: {
          fn: 'postAjaxCommandPopup',
          url: url.toString()
        },
        responseJson
      }, { label: '[GO][TW][PH3][popup_command]', color: '#ef4444' })
      throw new Error(error || response?.toString?.() || 'Erro no envio final.')
    }

    const timeGenerated = Number(game_data?.time_generated)
    const message = String(response?.message || '').trim()
    const targetVillage = response?.target_village ?? null
    const sourceVillage = response?.source_village ?? null

    return {
      timeGenerated: Number.isFinite(timeGenerated) ? timeGenerated : null,
      message,
      targetVillage,
      sourceVillage,
      raw: response
    }
  } catch (e) {
    if (!String(e?.message || '').includes('HTTP ')) {
      consoleDev.error({
        event: 'request-catch',
        stage: 'phase3-send',
        request: {
          fn: 'postAjaxCommandPopup',
          url: url.toString()
        },
        error: {
          name: e?.name,
          message: e?.message,
          cause: e?.cause
        }
      }, { label: '[GO][TW][PH3][popup_command]', color: '#ef4444' })
    }
    console.error(e)
    throw e
  } finally {
    clearTimeout(t)
  }
}
