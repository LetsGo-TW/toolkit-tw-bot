import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document";
import { combineAbortControllerSignals, makeAjaxBody, makeAjaxHeadersPost } from "@toolkit-tw-bot/browser";
import { parseTwJsonText } from "./utils/parseTwResponseText";

export async function postSender(data, groupId, { signal } = {}) {
  const gameData = getGameData()
  const url = new URL(`${gameData.link_base_pure}place&ajax=sender`, window.origin)
  const payloadSenders = {
    x: data.x,
    y: data.y,
    source_village: gameData.village.id,
    ...gameData.units.reduce((units, unit) => {
        if (!['militia'].includes(unit)) {
            units[unit] = 0
        }
        return units
    }, {}),
    group: groupId ?? gameData.group_id,
    attack: 'l',
    h: gameData.csrf
  }
  const body = makeAjaxBody(payloadSenders);
  const headers = makeAjaxHeadersPost();
  // controller só pro timeout
  const timeoutCtrl = new AbortController();
  const t = setTimeout(() => timeoutCtrl.abort(new Error("timeout")), 8000);
  // ✅ combina: abort externo + timeout
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
    signal: combinedSignal
  });
  try {
    const res = await fetch(req);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { response, error } = parseTwJsonText(
      await res.text(),
      "planner.postSender:response"
    );
    if (error || !response || !response.dialog) {
      throw new Error(
        error
          || response?.toString?.()
          || "TW sender sem response.dialog"
      )
    }
    const html = new DOMParser().parseFromString(response.dialog, "text/html");
    return html;
  } finally {
    clearTimeout(t);
  }
}
