/// <reference types="chrome" />

import { getRuntimeStatus, type ExtensionLicenseState } from '../../types'

const DEFAULT_TITLE = "Let's GO! - Player Assistant"
const DEFAULT_POPUP = 'popup.html'

export type ActionContextType = 'GAME' | 'LOGIN' | null

export type TabActionState = {
  tabId: number
  enabled: boolean
  enabledByUser: boolean | null
  active: boolean
  context: ActionContextType
  world: string | null
  t: number | null
  playerName: string | null
  isTryConfirm: boolean
  isConnectServerError?: boolean
  isNetError?: boolean
  license: ExtensionLicenseState
  botProtect?: boolean
}

function getIconFilename({
  enabled,
  license,
}: Pick<TabActionState, 'enabled' | 'license'>) {
  const licenseStatus = license.status

  if (!enabled) {
    return 'ico.gray.48.png'
  }

  if (licenseStatus === 'error' || licenseStatus === 'inactive') {
    return licenseStatus === 'error' ? 'ico.red.48.png' : 'ico.white-black.48.png'
  }

  if (licenseStatus === 'session-expired') {
    return 'ico.yellow-black.48.png'
  }

  if (licenseStatus === 'warning') {
    return 'ico.yellow.48.png'
  }

  return 'ico.green.48.png'
}

function getActionTitle({
  enabled,
  enabledByUser,
  active,
  context,
  world,
  t,
  playerName,
  license,
  botProtect = false,
  isConnectServerError = false,
  isNetError = false,
}: Omit<TabActionState, 'tabId' | 'isTryConfirm'>) {
  const licenseStatus = license.status
  const isRunning = active && enabledByUser === true && license.allowedByLicense
  const runtimeStatus = getRuntimeStatus({
    active: isRunning,
    enabledByUser,
    hasPlayerIdentity: true,
    isNetError,
    isConnectServerError,
  })

  if (!enabled) {
    return DEFAULT_TITLE
  }

  const scope = world ? `${world}:${t ?? 'main'}` : 'unknown'
  const parts = [
    context || 'TW',
    playerName || 'Unknown player',
    scope,
  ]

  if (licenseStatus === 'warning') {
    parts.push('License warning')
  } else if (licenseStatus === 'inactive') {
    parts.push('No license')
  } else if (licenseStatus === 'session-expired') {
    parts.push('Session expired')
  } else if (licenseStatus === 'error') {
    parts.push('License error')
  }

  if (botProtect) {
    parts.push('hCaptcha identified')
  }

  switch (runtimeStatus) {
    case 'off':
      parts.push('Off')
      break
    case 'net-error':
      parts.push('NET:ERROR')
      break
    case 'connect-error':
      parts.push('CONNECT:ERROR')
      break
    case 'running':
      parts.push('Running')
      break
    default:
      parts.push('Ready')
      break
  }

  return `Let's GO! - ${parts.join(' • ')}`
}

export async function syncTabAction({
  tabId,
  enabled,
  enabledByUser,
  active,
  context,
  world,
  t,
  playerName,
  isTryConfirm,
  license,
  botProtect = false,
  isConnectServerError = false,
  isNetError = false,
}: TabActionState) {
  if (typeof tabId !== 'number') {
    return
  }

  const icon = getIconFilename({
    enabled,
    license,
  })

  await chrome.action.setIcon({
    path: chrome.runtime.getURL(`icons/${icon}`),
    tabId,
  })

  await chrome.action.setTitle({
    tabId,
    title: getActionTitle({
      enabled,
      enabledByUser,
      active,
      context,
      world,
      t,
      playerName,
      license,
      botProtect,
      isConnectServerError,
      isNetError,
    }),
  })

  if (!enabled) {
    await chrome.action.setBadgeText({
      tabId,
      text: '',
    })
    await chrome.action.setPopup({
      tabId,
      popup: '',
    })
    await chrome.action.disable(tabId)
    return
  }

  const isRunning = active && enabledByUser === true && license.allowedByLicense

  if (isConnectServerError) {
    await chrome.action.setBadgeBackgroundColor({
      color: '#6b7280',
      tabId,
    })
    await chrome.action.setBadgeTextColor({
      color: 'white',
      tabId,
    })
    await chrome.action.setBadgeText({
      tabId,
      text: '⏹',
    })
  } else if (isRunning) {
    await chrome.action.setBadgeBackgroundColor({
      color: botProtect ? 'black' : (isNetError ? 'black' : (isTryConfirm ? '#deb017' : 'orangered')),
      tabId,
    })
    await chrome.action.setBadgeTextColor({
      color: 'white',
      tabId,
    })
    await chrome.action.setBadgeText({
      tabId,
      text: botProtect ? '🤚' : (isNetError ? '📡' : (isTryConfirm ? '☢️' : '▶️')),
    })
  } else {
    await chrome.action.setBadgeText({
      tabId,
      text: '',
    })
  }

  await chrome.action.setPopup({
    tabId,
    popup: DEFAULT_POPUP,
  })
  await chrome.action.enable(tabId)
}
