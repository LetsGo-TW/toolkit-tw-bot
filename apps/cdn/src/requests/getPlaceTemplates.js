import { getGameData } from "@toolkit-tw-bot/document";
import { combineAbortControllerSignals, makeAjaxHeadersGetDoc } from "@toolkit-tw-bot/browser";
import { assertNoCaptchaInGame } from "../shared/assertNoCaptchaInGame";
import { assertNoGameUpdateOrBlockedRequest } from "../shared/assertNoGameUpdateOrBlockedRequest";

export async function getPlaceTemplates({ signal } = {}) {
  const gameData = getGameData()
  const url = new URL(`${gameData.link_base_pure}place&mode=templates`, window.origin)
  const headers = makeAjaxHeadersGetDoc();
  // controller só pro timeout
  const timeoutCtrl = new AbortController();
  const t = setTimeout(() => timeoutCtrl.abort(new Error("timeout")), 8000);
  // ✅ combina: abort externo + timeout
  const combinedSignal = signal
    ? combineAbortControllerSignals([signal, timeoutCtrl.signal])
    : timeoutCtrl.signal;
  const req = new Request(url.toString(), {
    method: "GET",
    headers,
    credentials: "include",
    referrerPolicy: "origin",
    cache: "no-store",
    signal: combinedSignal
  });
  assertNoCaptchaInGame(document, 'getPlaceTemplates:pre-fetch')
  try {
    const res = await fetch(req);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();
    const html = new DOMParser().parseFromString(text, "text/html");
    assertNoCaptchaInGame(html, 'getPlaceTemplates:html-response')
    assertNoGameUpdateOrBlockedRequest(html, { context: 'getPlaceTemplates:html-response' })
    return html
  } finally {
    clearTimeout(t);
  }
}
