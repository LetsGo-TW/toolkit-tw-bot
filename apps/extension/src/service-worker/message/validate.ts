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
  const origin = getSenderOrigin(sender);
  if (!isAllowedOrigin(origin)) {
    throw new Error(`Origin not allowed: ${origin || "unknown"}`);
  }

  // valida extensionId
  const myId = chrome.runtime.id;
  if (received.extensionId !== myId) {
    throw new Error("Invalid extensionId");
  }
}
