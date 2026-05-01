import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document"
import { combineAbortControllerSignals, makeAjaxHeadersGet } from "@toolkit-tw-bot/browser"


export async function getAjaxMapFarm(template_id, target, { signal } = {}) {
  const gameData = getGameData()
  const url = new URL(`${gameData.link_base_pure}am_farm`, window.location.origin)
  url.searchParams.set('village', gameData.village.id)
  url.searchParams.set('screen', 'am_farm')
  url.searchParams.set('mode', 'farm')
  url.searchParams.set('ajaxaction', 'farm')
  url.searchParams.set('template_id', template_id)
  url.searchParams.set('target', target)
  url.searchParams.set('source', gameData.village.id)
  url.searchParams.set('json', '1')
  url.searchParams.set('h', csrf_token)

  const headers = makeAjaxHeadersGet();
  const timeoutCtrl = new AbortController();
  const t = setTimeout(() => timeoutCtrl.abort(new Error("timeout")), 8000);
  const combinedSignal = signal
    ? combineAbortControllerSignals([signal, timeoutCtrl.signal])
    : timeoutCtrl.signal;
  if (ProtectingBot["bot-protect-all-in-game"].active()) {
    clearTimeout(t);
    throw ProtectingBot.error();
  }
  const req = new Request(url.toString(), {
    method: "GET",
    headers,
    credentials: "include",
    referrerPolicy: "origin",
    cache: "no-store",
    signal: combinedSignal.signal
  });
  try {
    const res = await fetch(req);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}
