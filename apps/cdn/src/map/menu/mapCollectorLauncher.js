import Tooltip from '@toolkit-tw-bot/document/tooltip'
import { ProtectingBot } from '@toolkit-tw-bot/document'
import { printMessage } from '../../components/printMessage'
import { svgToDataUri } from '../../components/go-buttons/util'
import {
  getBotTooltipIconUrl,
  renderTooltipIconText,
  stopAll
} from './shared.js'

const MAP_COLLECTOR_LAUNCHER_ID = 'go-map-collector-launcher'
const MAP_COLLECTOR_SLOT_PRIMARY_SELECTOR = '#go-extension-bot-view-slot-primary'
const MAP_COLLECTOR_SLOT_CONFIG_SELECTOR = '#go-slot-primary-config'
const MAP_COLLECTOR_LAUNCHER_ICON_URL = svgToDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24">' +
    '<circle cx="11" cy="11" r="6.8" fill="none" stroke="#dcfce7" stroke-width="3.6"/>' +
    '<circle cx="11" cy="11" r="6.8" fill="none" stroke="#50fa7b" stroke-width="2.1"/>' +
    '<circle cx="9.2" cy="9.2" r="1.9" fill="#50fa7b" opacity="0.22"/>' +
    '<line x1="16.6" y1="16.6" x2="21" y2="21" stroke="#dcfce7" stroke-width="4.2" stroke-linecap="round"/>' +
    '<line x1="16.6" y1="16.6" x2="21" y2="21" stroke="#50fa7b" stroke-width="2.3" stroke-linecap="round"/>' +
  '</svg>'
)

let unbindMapCollectorTooltip = null
let mapCollectorLauncherBooted = false
let mapCollectorLauncherHashListenerBound = false
let mapCollectorLauncherStateListenerBound = false
let selectorCoordsSearchModulePromise = null

function getCurrentScreenName() {
  try {
    const url = new URL(location.href, origin)
    return String(url.searchParams.get('screen') || '').trim().toLowerCase()
  } catch (_) {
    return ''
  }
}

function isCurrentMapScreen() {
  return getCurrentScreenName() === 'map'
}

async function loadSelectorCoordsSearch() {
  if (!selectorCoordsSearchModulePromise) {
    selectorCoordsSearchModulePromise = import('../selectorCoordsSearch.js')
      .then((module) => module?.selectorCoordsSearch)
      .catch((error) => {
        selectorCoordsSearchModulePromise = null
        throw error
      })
  }
  const selectorCoordsSearch = await selectorCoordsSearchModulePromise
  if (typeof selectorCoordsSearch !== 'function') {
    selectorCoordsSearchModulePromise = null
    throw new Error('[GO][Collector] selectorCoordsSearch not available')
  }
  return selectorCoordsSearch
}

function shouldRenderBotIconInCollectorTooltip(el) {
  if (!el) return false
  return el.getAttribute?.('data-go-brand-tooltip') === '1'
}

function ensureMapCollectorTooltipOnce() {
  if (unbindMapCollectorTooltip) return
  const tooltip = new Tooltip()
  unbindMapCollectorTooltip = tooltip.bind(
    document.body,
    '#go-map-collector-view [data-go-title]',
    (el) => {
      const value = String(
        el?.getAttribute?.('data-go-title') ||
        el?.getAttribute?.('data-title') ||
        el?.getAttribute?.('title') ||
        ''
      ).trim()
      if (!value) return null
      if (!shouldRenderBotIconInCollectorTooltip(el)) return value
      return renderTooltipIconText(getBotTooltipIconUrl(), value)
    }
  )
}

function getMapCollectorSlot() {
  return document.querySelector(MAP_COLLECTOR_SLOT_PRIMARY_SELECTOR)
}

function removeMapCollectorLauncher() {
  document.getElementById(MAP_COLLECTOR_LAUNCHER_ID)?.remove?.()
}

function mountMapCollectorLauncherButton(btn) {
  const slotPrimary = getMapCollectorSlot()
  if (!slotPrimary || !btn) return null

  const configButton = slotPrimary.querySelector(MAP_COLLECTOR_SLOT_CONFIG_SELECTOR)
  if (configButton?.parentElement === slotPrimary) {
    if (configButton.nextElementSibling !== btn) {
      configButton.insertAdjacentElement('afterend', btn)
    }
    return btn
  }

  if (btn.parentElement !== slotPrimary) {
    slotPrimary.insertAdjacentElement('beforeend', btn)
  }

  return btn
}

function createMapCollectorLauncherButton() {
  const btn = document.createElement('button')
  btn.id = MAP_COLLECTOR_LAUNCHER_ID
  btn.type = 'button'
  btn.setAttribute('aria-label', 'Abrir coletor do mapa')
  btn.setAttribute('data-go-bot-view-tooltip', 'Coletor Master')

  const img = document.createElement('img')
  img.src = MAP_COLLECTOR_LAUNCHER_ICON_URL
  img.alt = ''
  img.width = 18
  img.height = 18
  btn.append(img)

  btn.addEventListener('pointerdown', stopAll, true)
  btn.addEventListener('mousedown', stopAll, true)
  btn.addEventListener('touchstart', stopAll, true)
  btn.addEventListener('click', openMapCollectorFromLauncher, true)

  return btn
}

function getOrCreateMapCollectorLauncher() {
  if (!isCurrentMapScreen()) {
    removeMapCollectorLauncher()
    return null
  }

  const existing = document.getElementById(MAP_COLLECTOR_LAUNCHER_ID)
  const btn = existing instanceof HTMLButtonElement
    ? existing
    : createMapCollectorLauncherButton()

  if (existing && existing !== btn) {
    existing.remove()
  }

  return mountMapCollectorLauncherButton(btn)
}

async function openMapCollectorFromLauncher(event) {
  stopAll(event)
  if (!isCurrentMapScreen()) {
    removeMapCollectorLauncher()
    return false
  }
  try {
    if (window.TWMap?.context?._visible && typeof window.TWMap.context.hide === 'function') {
      window.TWMap.context.hide()
    }
  } catch (_) {}

  try {
    const selectorCoordsSearch = await loadSelectorCoordsSearch()
    selectorCoordsSearch({
      hash: String(location.hash || ''),
      href: location.href
    })
  } catch (error) {
    console.error('[GO][Collector] failed to open selector', error)
    printMessage.error('Erro ao abrir coletor no mapa.')
    return false
  }

  syncMapCollectorLaunchersState()
  return false
}

function isMapCollectorPopupOpen() {
  return Boolean(document.querySelector('#go-map-collector-view.is-open'))
}

function syncMapCollectorLaunchersState() {
  if (!isCurrentMapScreen()) {
    removeMapCollectorLauncher()
    return
  }

  const btn = getOrCreateMapCollectorLauncher()
  if (!btn) return

  const isOpen = isMapCollectorPopupOpen()
  btn.hidden = false
  btn.disabled = isOpen
  btn.setAttribute('aria-disabled', isOpen ? 'true' : 'false')
  btn.setAttribute(
    'data-go-bot-view-tooltip',
    isOpen ? 'Coletor Master já aberto' : 'Coletor Master'
  )
}

function bindMapCollectorLauncherStateListenersOnce() {
  if (mapCollectorLauncherStateListenerBound) return
  mapCollectorLauncherStateListenerBound = true

  const syncState = () => {
    syncMapCollectorLaunchersState()
  }

  document.addEventListener('go:collector-base:open', syncState, true)
  document.addEventListener('go:collector-base:close', syncState, true)
  document.addEventListener('go:planner:close', syncState, true)
}

function ensureMapCollectorLauncher() {
  if (!isCurrentMapScreen()) {
    removeMapCollectorLauncher()
    return null
  }

  ensureMapCollectorTooltipOnce()
  bindMapCollectorLauncherStateListenersOnce()
  return getOrCreateMapCollectorLauncher()
}

export function destroyMapCollectorLauncher() {
  removeMapCollectorLauncher()
}

export function bootMapCollectorLauncherRunning() {
  if (!mapCollectorLauncherHashListenerBound) {
    mapCollectorLauncherHashListenerBound = true
    window.addEventListener('hashchange', () => {
      try {
        ensureMapCollectorLauncher()
      } catch (_) {}
    }, { passive: true })
  }

  if (mapCollectorLauncherBooted) {
    ensureMapCollectorLauncher()
    syncMapCollectorLaunchersState()
    return
  }

  let tries = 0
  const timer = setInterval(() => {
    tries++
    const ready = Boolean(window.TWMap?.context)
    if (ready) {
      mapCollectorLauncherBooted = true
      ensureMapCollectorLauncher()
      syncMapCollectorLaunchersState()
    }
    if (ready || tries > 200) clearInterval(timer)
    if (ProtectingBot['bot-protect-all-in-game'].active()) {
      clearInterval(timer)
      throw ProtectingBot.error()
    }
  }, 150)
}
