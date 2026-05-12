/// <reference types="chrome" />

import { getParamsUrl } from '@toolkit-tw-bot/core'
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { LOGIN_MESSAGE_TYPE } from '../../../../../../service-worker/message/types'
import { setActiveTitle } from '../../../../shared/setActiveTitle'

const LOGIN_RECONNECT_HINT_ID = 'toolkit-tw-bot-login-reconnect-hint'
const LOGIN_RECONNECT_WRAP_SELECTOR = '#home > div.center > div.content.box-border.red > div.inner > div.right.login > div.wrap'

let reconnectTimerId: number | null = null

type LoginReconnectResponse = {
  ok?: boolean
  canReconnect?: boolean
  reconnectUrl?: string | null
  reconnectAt?: number | null
  reconnectReason?: string | null
  enabledByUser?: boolean
  reconnectOnSessionExpired?: boolean
  isAllowedByLicense?: boolean
  shouldCloseTab?: boolean
  data?: Record<string, unknown>
}

type LoginReconnectHintTone = 'success' | 'danger' | 'warn'

function isReconnectable(doc: Document = document) {
  return !doc.querySelector('#user')
}

function getLoginReconnectWrap(doc: Document = document) {
  const element = doc.querySelector(LOGIN_RECONNECT_WRAP_SELECTOR)

  return element instanceof HTMLElement
    ? element
    : null
}

function getOrCreateLoginReconnectHint(doc: Document = document) {
  const existing = doc.getElementById(LOGIN_RECONNECT_HINT_ID)

  if (existing instanceof HTMLParagraphElement) {
    return existing
  }

  const wrap = getLoginReconnectWrap(doc)

  if (!wrap) {
    return null
  }

  const hint = doc.createElement('p')
  hint.id = LOGIN_RECONNECT_HINT_ID
  hint.style.marginTop = '0.65rem'
  hint.style.display = 'flex'
  hint.style.alignItems = 'center'
  hint.style.gap = '0.45rem'
  hint.style.minHeight = '3rem'
  hint.style.fontSize = '0.8rem'
  hint.style.lineHeight = '1.35'
  wrap.appendChild(hint)

  return hint
}

function getLoginReconnectIconUrl(tone: LoginReconnectHintTone) {
  switch (tone) {
    case 'danger':
      return chrome.runtime.getURL('icons/ico.red.48.png')
    case 'warn':
      return chrome.runtime.getURL('icons/ico.yellow-black.48.png')
    default:
      return chrome.runtime.getURL('icons/ico.green.48.png')
  }
}

function getLoginReconnectHintColor(tone: LoginReconnectHintTone) {
  switch (tone) {
    case 'danger':
      return '#d61e1e'
    case 'warn':
      return '#9f530a'
    default:
      return '#29512b'
  }
}

function setLoginReconnectHint(
  text: string,
  tone: LoginReconnectHintTone,
  doc: Document = document,
) {
  const hint = getOrCreateLoginReconnectHint(doc)

  if (!hint) {
    return
  }

  hint.replaceChildren()
  hint.style.color = getLoginReconnectHintColor(tone)

  const icon = doc.createElement('img')
  icon.src = getLoginReconnectIconUrl(tone)
  icon.alt = ''
  icon.width = 24
  icon.height = 24
  icon.style.width = '1.5rem'
  icon.style.height = '1.5rem'
  icon.style.flexShrink = '0'

  const label = doc.createElement('span')
  label.textContent = text

  hint.append(icon, label)
}

function getReconnectReasonLabel(reason?: string | null) {
  switch (reason) {
    case 'short-break':
      return 'short break'
    case 'long-rest':
      return 'long rest'
    case 'session-expired':
      return 'session expired'
    default:
      return 'reconnect'
  }
}

function formatReconnectTime(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--:--'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '--:--'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function clearReconnectTimer() {
  if (reconnectTimerId !== null) {
    window.clearTimeout(reconnectTimerId)
    reconnectTimerId = null
  }
}

export async function maybeHandleLoginReconnect() {
  clearReconnectTimer()

  const runtimeParams = getParamsUrl(
    window.location.href,
    window.location.origin,
  )

  if (!runtimeParams.isInLogin) {
    return false
  }

  const response = await chrome.runtime.sendMessage({
    extensionId: RELEASE_EXTENSION_ID,
    type: LOGIN_MESSAGE_TYPE,
    isReconnectable: isReconnectable(),
  }) as LoginReconnectResponse

  if (response?.data) {
    setActiveTitle(response.data)
  }

  const reconnectReason = typeof response?.reconnectReason === 'string'
    ? response.reconnectReason
    : null
  const reconnectAt = typeof response?.reconnectAt === 'number'
    ? response.reconnectAt
    : null
  const isManagedReconnect = (
    runtimeParams.sessionExpired === true
    || reconnectReason === 'session-expired'
    || reconnectReason === 'short-break'
    || reconnectReason === 'long-rest'
  )

  if (!isManagedReconnect) {
    return false
  }

  if (response?.shouldCloseTab === true) {
    return true
  }

  if (!response?.ok) {
    setLoginReconnectHint('reconnect desabilitado.', 'warn')
    return true
  }

  if (response.isAllowedByLicense !== true) {
    setLoginReconnectHint('sem licença para reconnectar.', 'danger')
    return true
  }

  if (!response.canReconnect || !response.reconnectUrl) {
    setLoginReconnectHint('reconnect desabilitado.', 'warn')
    return true
  }

  setLoginReconnectHint(
    `aguarde para reconnectar. motivo: ${getReconnectReasonLabel(reconnectReason)}. horário: ${formatReconnectTime(reconnectAt)}.`,
    'success',
  )

  reconnectTimerId = window.setTimeout(() => {
    reconnectTimerId = null
    window.location.assign(response.reconnectUrl as string)
  }, Math.max(0, (reconnectAt ?? Date.now()) - Date.now()))

  return true
}
