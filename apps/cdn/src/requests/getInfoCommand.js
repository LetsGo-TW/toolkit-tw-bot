import { combineAbortControllerSignals, makeAjaxHeadersGet } from '@toolkit-tw-bot/browser';
import { getGameData, ProtectingBot } from '@toolkit-tw-bot/document';

export async function getInfoCommand(commandId, { signal } = {}) {
  const gameData = getGameData();
  const url = new URL(
    `${gameData.link_base_pure}info_command&ajax=details&id=${commandId}`,
    window.origin
  );

  const headers = makeAjaxHeadersGet();

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

  try {
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
