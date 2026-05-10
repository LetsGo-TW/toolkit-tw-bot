import { combineAbortControllerSignals, makeAjaxBody, makeAjaxHeadersPost } from "@toolkit-tw-bot/browser"
import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document"
import { parseTwJsonText } from "../../requests/utils/parseTwResponseText";

export async function postAjaxFarmFilter(action, paramName, value, { signal } = {}) {
  const gameData = getGameData()
  const url = new URL(`${gameData.link_base_pure}am_farm`, window.location.origin)
  url.searchParams.set('village', gameData.village.id)
  url.searchParams.set('ajaxaction', action)
  url.searchParams.set('json', '1')
  url.searchParams.set('h', csrf_token)

  const payload = {
    extended: 1,
    target_screen: 'am_farm',
    [paramName]: value,
    h: gameData.csrf
  }
  const body = makeAjaxBody(payload);
  const headers = makeAjaxHeadersPost();
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
    method: "POST",
    headers,
    body,
    credentials: "include",
    referrerPolicy: "origin",
    cache: "no-store",
    signal: combinedSignal.signal
  });
  try {
    const res = await fetch(req);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseTwJsonText(await res.text(), 'map:search-barbarians:post-ajax-farm-filter');
  } finally {
    clearTimeout(t);
  }
}
