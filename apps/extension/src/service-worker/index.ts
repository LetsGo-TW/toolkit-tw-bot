/// <reference types="chrome" />

import { onReceived } from "./message/index";
import { onInstalledExtension } from "./on-installed";
import { syncTabActionByTabId } from "./action-state";
import { createRunnerTabsListeners } from "./runner-tabs";
import {
  initializeRuntime,
  reconcileActiveRunner,
  syncSelectedRunnerState,
} from "./runtime";

const runnerTabsListeners = createRunnerTabsListeners({
  reconcileActiveRunner,
  syncSelectedRunnerState,
  syncTabActionByTabId,
})

// listeners com guard (evita duplicados ao recarregar o SW)
if (!chrome.runtime.onMessage.hasListener(onReceived)) {
  chrome.runtime.onMessage.addListener(onReceived);
}
if (!chrome.runtime.onMessageExternal.hasListener(onReceived)) {
  chrome.runtime.onMessageExternal.addListener(onReceived);
}
if (!chrome.runtime.onInstalled.hasListener(onInstalledExtension)) {
  chrome.runtime.onInstalled.addListener(onInstalledExtension);
}

if (!chrome.tabs.onActivated.hasListener(runnerTabsListeners.onTabActivated)) {
  chrome.tabs.onActivated.addListener(runnerTabsListeners.onTabActivated);
}
if (!chrome.tabs.onRemoved.hasListener(runnerTabsListeners.onTabRemoved)) {
  chrome.tabs.onRemoved.addListener(runnerTabsListeners.onTabRemoved);
}
if (!chrome.tabs.onAttached.hasListener(runnerTabsListeners.onTabAttached)) {
  chrome.tabs.onAttached.addListener(runnerTabsListeners.onTabAttached);
}
if (!chrome.tabs.onDetached.hasListener(runnerTabsListeners.onTabDetached)) {
  chrome.tabs.onDetached.addListener(runnerTabsListeners.onTabDetached);
}
if (!chrome.tabs.onUpdated.hasListener(runnerTabsListeners.onTabUpdated)) {
  chrome.tabs.onUpdated.addListener(runnerTabsListeners.onTabUpdated);
}
if (!chrome.windows.onFocusChanged.hasListener(runnerTabsListeners.onWindowFocusChanged)) {
  chrome.windows.onFocusChanged.addListener(runnerTabsListeners.onWindowFocusChanged);
}
if (!chrome.windows.onRemoved.hasListener(runnerTabsListeners.onWindowRemoved)) {
  chrome.windows.onRemoved.addListener(runnerTabsListeners.onWindowRemoved);
}

void initializeRuntime()

console.log('[SW] is running...')
// 🔹 Fim do "boot" do SW
