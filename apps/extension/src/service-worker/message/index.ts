// src/service-worker/message/index.js
/// <reference types="chrome" />
import { validateEnvelope } from "./validate";
import { handleMessage } from "./routes";

// Handler único para onMessage e onMessageExternal
export const onReceived = (received: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  let responded = false;
  const safeRespond = (payload: any) => {
    if (responded) return;
    responded = true;
    try {
      sendResponse(payload);
    } catch (e) {
      // Em SW MV3 às vezes o canal fecha se o worker suspende.
      console.warn("[SW] sendResponse falhou:", e, chrome.runtime?.lastError);
    }
  };

  (async () => {
    try {
      await validateEnvelope(received, sender);
      const result = await handleMessage({ received, sender });
      safeRespond(result);
    } catch (error) {
      console.error("[SW][Error]", error);
      safeRespond({ ok: false, error: (error instanceof Error) ? error.message : String(error) });
    }
  })();

  // Mantém o canal aberto para resposta assíncrona
  return true;
};
