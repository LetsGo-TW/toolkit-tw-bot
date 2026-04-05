/// <reference types="chrome" />

import { syncTabActionByTabId } from "../action-state"
import { clearErrorAlarmForTab } from "../prepared-context/error-tabId"
import { scheduleProbeAlarm } from "../prepared-context/probe-scoped"
import { reconcileActiveRunner } from "../runtime"

export const onCompletedWebRequestFilter: chrome.webRequest.RequestFilter = {
  urls: chrome.runtime.getManifest().host_permissions,
  types: ['main_frame', 'sub_frame', 'xmlhttprequest'],
}

function getScopeKeyFromTwUrl(urlString: string) {
  const url = new URL(urlString)
  const world = url.hostname.split('.')[0]
  const t = url.searchParams.get('t')

  return `${world}:${t ?? 'main'}`
}

function isRelevantTwDoc(details: chrome.webRequest.OnCompletedDetails) {
  if (details.method !== 'GET') return false
  if (details.statusCode < 200 || details.statusCode >= 400) return false
  if (!['main_frame', 'sub_frame', 'xmlhttprequest'].includes(details.type)) return false
  const url = new URL(details.url)
  if (url.pathname !== '/game.php') return false
  if (url.searchParams.has('ajax')) return false
  if (url.searchParams.get('screen') === 'api') return false

  return true
}

export const onCompletedWebRequest = async (
  details: chrome.webRequest.OnCompletedDetails,
) => {
  const matched = isRelevantTwDoc(details)
  const scopeKey = getScopeKeyFromTwUrl(details.url)

  console.log('[webRequest]', {
    matched,
    type: details.type,
    method: details.method,
    statusCode: details.statusCode,
    url: details.url,
    scopeKey,
  })

  if (!matched) return

  const clearedNetError = await clearErrorAlarmForTab(details.tabId)

  if (clearedNetError) {
    await syncTabActionByTabId(details.tabId)

    void reconcileActiveRunner({
      reason: 'error-alarm-cleared',
      targetScopeKey: scopeKey,
    }).catch((error) => {
      console.error('[runner reconcile][error-alarm-cleared]', error)
    })
  }

  void scheduleProbeAlarm(scopeKey, true).catch((error) => {
    console.log('[schedule probe alarm]', error)
  })
}

