import { combineAbortControllerSignals, DOC_REQUEST_TIMEOUT_MS, makeAjaxBody, makeAjaxHeadersGetDoc } from "@toolkit-tw-bot/browser"
import { assertNoCaptchaInGame } from "../shared/assertNoCaptchaInGame"
import { assertNoGameUpdateOrBlockedRequest } from "../shared/assertNoGameUpdateOrBlockedRequest"
import { gameData } from "./context"

async function fetchHtmlByRequest(request, { preCaptchaContext = "", postCaptchaContext = "" } = {}) {
  assertNoCaptchaInGame(document, preCaptchaContext)

  const response = await fetch(request)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const text = await response.text()
  const html = new DOMParser().parseFromString(text, "text/html")

  assertNoCaptchaInGame(html, postCaptchaContext)
  assertNoGameUpdateOrBlockedRequest(html, { context: postCaptchaContext })

  return html
}

async function setPageSize(pageSize, screen, newPageSize = 1000, { signal } = {}) {
  if (!pageSize || Number(pageSize) === Number(newPageSize)) return

  const url = new URL(`${gameData.link_base_pure}${screen}&action=change_page_size`, window.origin)
  const payloadSenders = {
    page_size: newPageSize,
    h: gameData.csrf
  }

  const body = makeAjaxBody(payloadSenders)
  const headers = makeAjaxHeadersGetDoc()
  const timeoutCtrl = new AbortController()
  const t = setTimeout(() => timeoutCtrl.abort(new Error("timeout")), DOC_REQUEST_TIMEOUT_MS)

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

  try {
    await fetchHtmlByRequest(req, {
      preCaptchaContext: "setPageSize:pre-fetch",
      postCaptchaContext: "setPageSize:html-response"
    })
  } finally {
    clearTimeout(t)
  }
}

async function getProductionPageHtml(groupId = 0, page = -1, { signal } = {}) {
  const url = new URL(`${gameData.link_base_pure}overview_villages&mode=prod&group=${groupId}&page=${page}`, window.origin)
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
    signal: combinedSignal
  })

  try {
    return await fetchHtmlByRequest(req, {
      preCaptchaContext: "getProduction:pre-fetch",
      postCaptchaContext: "getProduction:html-response"
    })
  } finally {
    clearTimeout(t)
  }
}

async function getOverviewVillagesHtml({ signal } = {}) {
  const url = new URL(`${gameData.link_base_pure}overview_villages`, window.origin)
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
    signal: combinedSignal
  })

  try {
    return await fetchHtmlByRequest(req, {
      preCaptchaContext: "getOverviewVillages:pre-fetch",
      postCaptchaContext: "getOverviewVillages:html-response"
    })
  } finally {
    clearTimeout(t)
  }
}

export {
  getOverviewVillagesHtml,
  getProductionPageHtml,
  setPageSize
}
