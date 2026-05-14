import { combineAbortControllerSignals, DOC_REQUEST_TIMEOUT_MS, makeAjaxHeadersGetDoc } from "@toolkit-tw-bot/browser";
import { assertNoCaptchaInGame, assertNoGameUpdateOrBlockedRequest } from "@toolkit-tw-bot/document";

export async function getAmFarmDoc(url, { signal } = {}) {
  const headers = makeAjaxHeadersGetDoc();
  const timeoutCtrl = new AbortController();
  const t = setTimeout(() => timeoutCtrl.abort(new Error("timeout")), DOC_REQUEST_TIMEOUT_MS);
  const combinedSignal = signal
    ? combineAbortControllerSignals([signal, timeoutCtrl.signal])
    : timeoutCtrl.signal;
  const req = new Request(url, {
    method: "GET",
    headers,
    credentials: "include",
    referrerPolicy: "origin",
    cache: "no-store",
    signal: combinedSignal
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
