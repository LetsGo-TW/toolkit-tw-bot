/// <reference types="chrome" />
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
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
  if (myId !== RELEASE_EXTENSION_ID) {
    throw new Error("Installed extensionId does not match release metadata");
  }
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
  if (received.extensionId !== RELEASE_EXTENSION_ID) {
    throw new Error("Invalid extensionId");
  }
}
