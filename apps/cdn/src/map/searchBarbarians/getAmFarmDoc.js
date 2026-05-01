import { combineAbortControllerSignals, makeAjaxHeadersGetDoc } from "@toolkit-tw-bot/browser";
import { assertNoCaptchaInGame, assertNoGameUpdateOrBlockedRequest } from "@toolkit-tw-bot/document";

export async function getAmFarmDoc(url, { signal } = {}) {
  const headers = makeAjaxHeadersGetDoc();
  const timeoutCtrl = new AbortController();
  const t = setTimeout(() => timeoutCtrl.abort(new Error("timeout")), 8000);
  const combinedSignal = signal
    ? combineAbortControllerSignals([signal, timeoutCtrl.signal])
    : timeoutCtrl.signal;
  const req = new Request(url, {
    method: "GET",
    headers,
    credentials: "include",
    referrerPolicy: "origin",
    cache: "no-store",
    signal: combinedSignal.signal
  });
  assertNoCaptchaInGame(document, 'getAmFarmDoc:pre-fetch')
  try {
    const res = await fetch(req);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const response = await res.text();
    const html = new DOMParser().parseFromString(response, "text/html");
    assertNoCaptchaInGame(html, 'getAmFarmDoc:html-response')
    assertNoGameUpdateOrBlockedRequest(html, { context: 'getAmFarmDoc:html-response' })
    return html
  } finally {
    clearTimeout(t);
  }
}
