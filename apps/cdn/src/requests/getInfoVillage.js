import { combineAbortControllerSignals, makeAjaxHeadersGetDoc } from "@toolkit-tw-bot/browser";
import { getGameData } from "@toolkit-tw-bot/document";
import { assertNoCaptchaInGame } from "../shared/assertNoCaptchaInGame";
import { assertNoGameUpdateOrBlockedRequest } from "../shared/assertNoGameUpdateOrBlockedRequest";

export async function getInfoVillage(village, { signal } = {}) {
  const gameData = getGameData()
  const url = new URL(`${gameData.link_base_pure}info_village&id=${village.id}`, window.origin)
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
  assertNoCaptchaInGame(document, 'getInfoVillage:pre-fetch')
  try {
    const res = await fetch(req);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const response = await res.text();
    const html = new DOMParser().parseFromString(response, "text/html");
    assertNoCaptchaInGame(html, 'getInfoVillage:html-response')
    assertNoGameUpdateOrBlockedRequest(html, { context: 'getInfoVillage:html-response' })
    return html
  } finally {
    clearTimeout(t);
  }
}
