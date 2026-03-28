/// <reference types="chrome" />
import { getSenderOrigin, isAllowedOrigin } from "./origins";

export async function validateEnvelope(received: any, sender: chrome.runtime.MessageSender) {
  if (!received || typeof received !== "object") {
    throw new Error("Empty message");
  }
  if (!received.type) {
    throw new Error("Missing message type");
  }

  // valida origin
  const myId = chrome.runtime.id;
  const isInternalSender = (
    sender.id === myId
    || sender.url?.startsWith(`chrome-extension://${myId}/`)
  );

  if (!isInternalSender) {
    const origin = getSenderOrigin(sender);
    if (!isAllowedOrigin(origin)) {
      throw new Error(`Origin not allowed: ${origin || "unknown"}`);
    }
  }

  // valida extensionId
  if (received.extensionId !== myId) {
    throw new Error("Invalid extensionId");
  }
}
