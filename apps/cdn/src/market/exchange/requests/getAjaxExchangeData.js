import { combineAbortControllerSignals, makeAjaxHeadersGet } from "@toolkit-tw-bot/browser";
import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document";

async function getAjaxExchangeData(villageId = null, { signal } = {}) {
  const gameData = getGameData();
  const url = new URL(`${gameData.link_base_pure}market&ajax=exchange_data`, window.origin);
  if (villageId) url.searchParams.set("village", villageId);

  const headers = makeAjaxHeadersGet();

  // controller só pro timeout
  const timeoutCtrl = new AbortController();
  const t = setTimeout(() => timeoutCtrl.abort(new Error("timeout")), 8000);

  // ✅ combina: abort externo + timeout
  const combinedSignal = signal
    ? combineAbortControllerSignals([signal, timeoutCtrl.signal])
    : timeoutCtrl.signal;

  try {
    if (ProtectingBot["bot-protect-all-in-game"].active()) {
      clearTimeout(t);
      throw new Error('Bot protection detected');
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers,
      credentials: "include",
      referrerPolicy: "origin",
      cache: "no-store",
      signal: combinedSignal,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const { response, error } = await res.json();
    if (error || !response) throw new Error(error || "Not found!");
    return response;
  } finally {
    clearTimeout(t);
  }
}

export { getAjaxExchangeData }
