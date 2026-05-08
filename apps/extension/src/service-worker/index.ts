/// <reference types="chrome" />

import {
  createServiceWorkerController,
  SERVICE_WORKER_CONTROLLER_EVENTS,
} from "./controller";
import { ensureRunnerControllerInitialized } from "./controller/runner-controller";
import { onReceived } from "./message/index";
import { cleanupAttachedNativeDebuggers } from "./message/native";
import { onCompletedWebRequest, onCompletedWebRequestFilter } from "./on-completed-web-request";
import { onWebNavigationErrorOccurred } from "./on-navigation-error-ocurred";
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
import { ensureFarmMaxInitialized } from './farm-max'

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

// O index do SW só declara o wiring do bootstrap.
// O controller registra os listeners "simples" e roda as tasks de startup.
const controller = createServiceWorkerController({
  listeners: [
    { label: 'runtime.onMessage', event: chrome.runtime.onMessage, handler: onReceived },
    { label: 'runtime.onMessageExternal', event: chrome.runtime.onMessageExternal, handler: onReceived },
    { label: 'runtime.onInstalled', event: chrome.runtime.onInstalled, handler: onInstalledExtension },
    { label: 'alarms.onAlarm', event: chrome.alarms.onAlarm, handler: onPreparedContextCleanupAlarm },
    { label: 'tabs.onActivated', event: chrome.tabs.onActivated, handler: onTabActivated },
    { label: 'tabs.onRemoved', event: chrome.tabs.onRemoved, handler: onTabRemoved },
    { label: 'tabs.onAttached', event: chrome.tabs.onAttached, handler: onTabAttached },
    { label: 'tabs.onDetached', event: chrome.tabs.onDetached, handler: onTabDetached },
    { label: 'tabs.onUpdated', event: chrome.tabs.onUpdated, handler: onTabUpdated },
    { label: 'webNavigation.onErrorOccurred', event: chrome.webNavigation.onErrorOccurred, handler: onWebNavigationErrorOccurred },
  ],
  startupTasks: [
    {
      label: 'prepared-context.cleanup-alarm.ensure',
      run: () => ensurePreparedContextCleanupAlarm(),
    },
    {
      label: 'native-debugger.cleanup',
      run: () => cleanupAttachedNativeDebuggers({
        reason: 'sw-startup',
      }),
    },
    {
      label: 'runtime.initialize',
      run: () => initializeRuntime(),
    },
    {
      label: 'farm-max.controller.initialize',
      run: async () => {
        try {
          await ensureFarmMaxInitialized()
        } finally {
          await ensureRunnerControllerInitialized()
        }
      },
    },
  ],
})

// Tratamento mínimo centralizado para tasks assíncronas do boot.
controller.on(SERVICE_WORKER_CONTROLLER_EVENTS.TASK_ERROR, (event) => {
  console.error('[SW][CONTROLLER][TASK_ERROR]', event.detail?.label, event.detail?.error)
})

// webRequest usa assinatura com filter, então fica fora do controller por enquanto.
if (!chrome.webRequest.onCompleted.hasListener(onCompletedWebRequest)) {
  chrome.webRequest.onCompleted.addListener(
    onCompletedWebRequest,
    onCompletedWebRequestFilter
  )
}

controller.start()
