/// <reference types="chrome" />

import { onReceived } from "./message/index";
import { onCompletedWebRequest, onCompletedWebRequestFilter } from "./on-completed-web-request";
import { onInstalledExtension } from "./on-installed";
import {
  createOnPreparedContextCleanupAlarmListener,
  ensurePreparedContextCleanupAlarm,
} from "./prepared-context/alarm";
import { createOnTabActivatedListener } from "./runner-tabs/onActivated";
import { createOnTabAttachedListener } from "./runner-tabs/onAttached";
import { createOnTabDetachedListener } from "./runner-tabs/onDetached";
import { createOnTabRemovedListener } from "./runner-tabs/onRemoved";
import { createOnTabUpdatedListener } from "./runner-tabs/onUpdated";
import {
  initializeRuntime,
  reconcileActiveRunner,
} from "./runtime";

const onTabActivated = createOnTabActivatedListener({
  reconcileActiveRunner,
})
const onTabAttached = createOnTabAttachedListener({
  reconcileActiveRunner,
})
const onTabDetached = createOnTabDetachedListener()
const onTabRemoved = createOnTabRemovedListener({
  reconcileActiveRunner,
})
const onTabUpdated = createOnTabUpdatedListener()
const onPreparedContextCleanupAlarm = createOnPreparedContextCleanupAlarmListener()

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
if (!chrome.alarms.onAlarm.hasListener(onPreparedContextCleanupAlarm)) {
  chrome.alarms.onAlarm.addListener(onPreparedContextCleanupAlarm);
}

if (!chrome.tabs.onActivated.hasListener(onTabActivated)) {
  chrome.tabs.onActivated.addListener(onTabActivated);
}
if (!chrome.tabs.onRemoved.hasListener(onTabRemoved)) {
  chrome.tabs.onRemoved.addListener(onTabRemoved);
}
if (!chrome.tabs.onAttached.hasListener(onTabAttached)) {
  chrome.tabs.onAttached.addListener(onTabAttached);
}
if (!chrome.tabs.onDetached.hasListener(onTabDetached)) {
  chrome.tabs.onDetached.addListener(onTabDetached);
}
if (!chrome.tabs.onUpdated.hasListener(onTabUpdated)) {
  chrome.tabs.onUpdated.addListener(onTabUpdated);
}
if (!chrome.webRequest.onCompleted.hasListener(onCompletedWebRequest)) {
  chrome.webRequest.onCompleted.addListener(
    onCompletedWebRequest, 
    onCompletedWebRequestFilter
  )
}
void ensurePreparedContextCleanupAlarm()
void initializeRuntime()
