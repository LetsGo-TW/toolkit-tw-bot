/// <reference types="chrome" />

import { onReceived } from "./message/index";
import { registerRunnerLifecycleListeners } from "./runner";

// listeners com guard (evita duplicados ao recarregar o SW)
if (!chrome.runtime.onMessage.hasListener(onReceived)) {
  chrome.runtime.onMessage.addListener(onReceived);
}
if (!chrome.runtime.onMessageExternal.hasListener(onReceived)) {
  chrome.runtime.onMessageExternal.addListener(onReceived);
}

void registerRunnerLifecycleListeners()

console.log('[SW] is running...')
// 🔹 Fim do "boot" do SW
