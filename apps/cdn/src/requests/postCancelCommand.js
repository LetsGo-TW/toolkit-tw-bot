import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document";
import { combineAbortControllerSignals, makeAjaxBody, makeAjaxHeadersPost } from "@toolkit-tw-bot/browser";
import { parseTwJsonText } from "./utils/parseTwResponseText";

export async function postCancelCommand(commandId, homeId, { signal } = {}) {
  const gameData = getGameData()
  const url = new URL(`${gameData.link_base_pure}place&ajaxaction=cancel`, window.origin)
  const payload = {
    id: commandId,
    village: homeId,
    h: gameData.csrf
  }
  const body = makeAjaxBody(payload);
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
      "planner.postCancelCommand:response"
    );
    if (error || !response) throw new Error(error || "Not found!");
    return response;
  } finally {
    clearTimeout(t);
  }
}
