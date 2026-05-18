import { combineAbortControllerSignals, DOC_REQUEST_TIMEOUT_MS, makeAjaxHeadersGetDoc } from "@toolkit-tw-bot/browser"
import { ProtectingBot } from "@toolkit-tw-bot/document"
import { assertNoGameUpdateOrBlockedRequest } from "../../../shared/assertNoGameUpdateOrBlockedRequest"

function canReadBusinessFromMarketPage(doc = document) {
  return Array.from(doc?.querySelectorAll?.("#market_status_bar table") || []).length > 1
}

function hasCurrentVillageMarket(gameData = null) {
  return Number(gameData?.village?.buildings?.market || 0) > 0
}

async function getMarketPageDocument(gameData = null, { signal, preferCurrentDocument = true } = {}) {
  if (!hasCurrentVillageMarket(gameData)) {
    return null
  }

  if (preferCurrentDocument && canReadBusinessFromMarketPage(document)) {
    return document
  }

  if (ProtectingBot["bot-protect-all-in-game"].active(document)) {
    throw ProtectingBot.error()
  }

  const linkBasePure = String(gameData?.link_base_pure || "").trim()
  if (!linkBasePure) {
    throw new Error("Missing link_base_pure to fetch market page.")
  }

  const url = new URL(`${linkBasePure}market`, window.origin)
  const headers = makeAjaxHeadersGetDoc()
  const timeoutCtrl = new AbortController()
  const t = setTimeout(() => timeoutCtrl.abort(new Error("timeout")), DOC_REQUEST_TIMEOUT_MS)
  const combinedSignal = signal
    ? combineAbortControllerSignals([signal, timeoutCtrl.signal])
    : timeoutCtrl.signal

  const req = new Request(url.toString(), {
    method: "GET",
    headers,
    credentials: "include",
    referrerPolicy: "origin",
    cache: "no-store",
    signal: combinedSignal,
  })

  try {
    const response = await fetch(req)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const text = await response.text()
    const html = new DOMParser().parseFromString(text, "text/html")

    if (ProtectingBot["bot-protect-all-in-game"].active(html)) {
      throw ProtectingBot.error()
    }

    assertNoGameUpdateOrBlockedRequest(html, {
      context: "exchange:market-page",
    })

    return html
  } finally {
    clearTimeout(t)
  }
}

export {
  canReadBusinessFromMarketPage,
  getMarketPageDocument,
}
