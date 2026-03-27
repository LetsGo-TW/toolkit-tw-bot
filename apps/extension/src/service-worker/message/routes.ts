/// <reference types="chrome" />

import { MessageEnvelope } from "../../types";
import { getConnectState, registerPreparedContext } from "../runner";

export async function handleMessage({ received, sender }: MessageEnvelope): Promise<any> {
  switch (received?.type) {
    case "CONNECT":
      return getConnectState(sender as chrome.runtime.MessageSender);
    case "PREPARED":
      return registerPreparedContext(
        received,
        sender as chrome.runtime.MessageSender,
      );
    case "GAME":
      return { ok: true, message: "Not implements GAME!"};
    case "LOGIN":
      return { ok: true, message: "Not implements LOGIN!"};
    default:
      return { ok: false, error: `Unknown type "${String(received?.type)}"` };
  }
}
