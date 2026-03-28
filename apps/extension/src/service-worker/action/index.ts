/// <reference types="chrome" />

const DEFAULT_TITLE = "Let's GO! - Player Assistant"
const DEFAULT_POPUP = 'popup.html'

export type ActionLicenseStatus =
  | 'unknown'
  | 'active'
  | 'warning'
  | 'inactive'
  | 'error'
  | null

export type ActionContextType = 'GAME' | 'LOGIN' | null

export type TabActionState = {
  tabId: number
  enabled: boolean
  active: boolean
  context: ActionContextType
  world: string | null
  t: number | null
  playerName: string | null
  isTryConfirm: boolean
  licenseStatus: ActionLicenseStatus
  botProtect?: boolean
}

function getIconFilename({
  enabled,
  context,
  licenseStatus,
}: Pick<TabActionState, 'enabled' | 'context' | 'licenseStatus'>) {
  if (!enabled) {
    return 'ico.gray.48.png'
  }

  if (licenseStatus === 'error' || licenseStatus === 'inactive') {
    return 'red.48.png'
  }

  if (licenseStatus === 'warning') {
    return 'yellow.48.png'
  }

  if (context === 'LOGIN') {
    return 'white-black.48.png'
  }

  return '48.png'
}

function getActionTitle({
  enabled,
  active,
  context,
  world,
  t,
  playerName,
  licenseStatus,
}: Omit<TabActionState, 'tabId' | 'isTryConfirm' | 'botProtect'>) {
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
    parts.push('License inactive')
  } else if (licenseStatus === 'error') {
    parts.push('License error')
  }

  parts.push(active ? 'Running' : 'Ready')

  return `Let's GO! - ${parts.join(' • ')}`
}

export async function syncTabAction({
  tabId,
  enabled,
  active,
  context,
  world,
  t,
  playerName,
  isTryConfirm,
  licenseStatus,
  botProtect = false,
}: TabActionState) {
  if (typeof tabId !== 'number') {
    return
  }

  const icon = getIconFilename({
    enabled,
    context,
    licenseStatus,
  })

  await chrome.action.setIcon({
    path: chrome.runtime.getURL(`icons/${icon}`),
    tabId,
  })

  await chrome.action.setTitle({
    tabId,
    title: getActionTitle({
      enabled,
      active,
      context,
      world,
      t,
      playerName,
      licenseStatus,
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

  if (active) {
    await chrome.action.setBadgeBackgroundColor({
      color: botProtect ? 'black' : (isTryConfirm ? '#7f1d1d' : 'orangered'),
      tabId,
    })
    await chrome.action.setBadgeTextColor({
      color: 'white',
      tabId,
    })
    await chrome.action.setBadgeText({
      tabId,
      text: botProtect ? '🤚' : (isTryConfirm ? '☢️' : '▶️'),
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
