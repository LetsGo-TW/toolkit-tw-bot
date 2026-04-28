import { getGameData } from '@toolkit-tw-bot/document'
import { printMessage } from '../components/printMessage'
import { createBtnCalendar } from '../components/go-buttons/calendar'
import {
  createBtnCrossedSwords,
  ICON_CROSSED_SWORDS_CENTERED,
} from '../components/go-buttons/crossed-swords'
import { isPlannerScheduleEnabled } from '../planner/featureFlags'

const CTX_BUTTON_ATTR = 'data-go-ctx-runtime-button'
const CLICK_SCHEDULE_SYNC_DELAY_MS = 24
const MAP_CTX_SYNC_INTERVAL_MS = 350
export const PLANNER_CTX_OPEN_EVENT = 'toolkit:planner:ctx-open'

function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeInt(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

function calcContinentFromCoords(x, y) {
  const nx = Number(x)
  const ny = Number(y)
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null
  return Math.floor(ny / 100) * 10 + Math.floor(nx / 100)
}

function parseCoordText(value = '') {
  const match = String(value || '').match(/(\d{1,3})\|(\d{1,3})/)
  if (!match) return null
  const x = Number(match[1])
  const y = Number(match[2])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

function parseIdFromHref(href = '') {
  try {
    const url = new URL(String(href || ''), window.location.origin)
    const raw = url.searchParams.get('id') || url.searchParams.get('target')
    const id = Number(raw)
    return Number.isFinite(id) ? id : null
  } catch {
    return null
  }
}

function normalizeCtxTarget(raw = null) {
  if (!raw || typeof raw !== 'object') return null

  const id = normalizeInt(
    raw.id
    ?? raw.villageId
    ?? raw.village_id
    ?? raw.target
    ?? raw.target_id
    ?? raw.dataId,
  )
  const playerId = normalizeInt(
    raw.playerId
    ?? raw.player_id
    ?? raw.player
    ?? raw.dataPlayer,
  )
  const x = Number(raw.x ?? raw.pos_x ?? raw.coord_x ?? raw.villageX ?? raw.targetX)
  const y = Number(raw.y ?? raw.pos_y ?? raw.coord_y ?? raw.villageY ?? raw.targetY)
  const coords = Number.isFinite(x) && Number.isFinite(y)
    ? { x, y }
    : parseCoordText(raw.name || raw.label || raw.text || raw.display_name || '')

  if (!coords) return null

  const name = normalizeText(raw.name || raw.label || raw.display_name || raw.text || '')

  return {
    id,
    playerId,
    x: coords.x,
    y: coords.y,
    k: calcContinentFromCoords(coords.x, coords.y),
    name: name || null,
  }
}

function sameTarget(left = null, right = null) {
  if (!left && !right) return true
  if (!left || !right) return false
  return (
    Number(left.id ?? NaN) === Number(right.id ?? NaN)
    && Number(left.playerId ?? NaN) === Number(right.playerId ?? NaN)
    && Number(left.x ?? NaN) === Number(right.x ?? NaN)
    && Number(left.y ?? NaN) === Number(right.y ?? NaN)
  )
}

function cloneTarget(target = null) {
  return target ? { ...target } : null
}

function isMapScreen() {
  try {
    const screen = String(getGameData()?.screen || '').trim().toLowerCase()
    if (screen) return screen === 'map'
  } catch {}

  try {
    const url = new URL(window.location.href, window.location.origin)
    return String(url.searchParams.get('screen') || '').trim().toLowerCase() === 'map'
  } catch {
    return false
  }
}

function readVillageAnchorCtxTargetFromEventTarget(target = null) {
  const anchorRoot = target?.closest?.('.village_anchor.contexted')
  if (!anchorRoot) return null

  const hrefNode = anchorRoot.querySelector('a[href]')
  const coords = parseCoordText(anchorRoot.textContent || '')
  if (!coords) return null

  return normalizeCtxTarget({
    id: anchorRoot.getAttribute('data-id') || parseIdFromHref(hrefNode?.getAttribute?.('href') || ''),
    playerId: anchorRoot.getAttribute('data-player'),
    x: coords.x,
    y: coords.y,
    name: normalizeText(anchorRoot.textContent || ''),
  })
}

function unwrapMapCtxCandidate(candidate = null) {
  if (!candidate || typeof candidate !== 'object') return null

  const normalizedDirect = normalizeCtxTarget(candidate)
  if (normalizedDirect) return normalizedDirect

  const responseCandidate = normalizeCtxTarget(candidate.response)
  if (responseCandidate) return responseCandidate

  return null
}

function readMapCtxTarget() {
  if (!isMapScreen()) return null

  const context = window?.TWMap?.context
  if (!context || typeof context !== 'object') return null

  const candidates = [
    context.data,
    context._data,
    context.popupData,
    context.popup_data,
    context._popupData,
    context._popup_data,
    context.villageData,
    context.village_data,
    context._villageData,
    context._village_data,
    context.currentVillageData,
    context._currentVillageData,
    context.villageInfo,
    context.village_info,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const normalized = unwrapMapCtxCandidate(item)
        if (normalized) return normalized
      }
      continue
    }

    const normalized = unwrapMapCtxCandidate(candidate)
    if (normalized) return normalized
  }

  return null
}
function removeCtxButtons(slot = null) {
  if (!(slot instanceof HTMLElement)) return
  slot.querySelectorAll(`[${CTX_BUTTON_ATTR}="1"]`).forEach((node) => node.remove())
}

function decorateCtxButton(button, tooltip) {
  if (!(button instanceof HTMLButtonElement)) return button
  const safeTooltip = normalizeText(tooltip)
  button.setAttribute(CTX_BUTTON_ATTR, '1')
  if (safeTooltip) {
    button.setAttribute('data-go-bot-view-tooltip', safeTooltip)
    button.setAttribute('aria-label', safeTooltip)
  }
  button.removeAttribute('title')
  return button
}

function formatTargetLabel(target = null) {
  if (!target) return ''
  const coords = Number.isFinite(Number(target?.x)) && Number.isFinite(Number(target?.y))
    ? `${Number(target.x)}|${Number(target.y)}`
    : ''
  const name = normalizeText(target?.name || '')
  if (name && coords && !name.includes(coords)) return `${name} (${coords})`
  return name || coords
}

function openPlannerFromCtxTarget(target = null, mode = 'send') {
  if (!target) return

  const detail = {
    id: target.id ?? null,
    x: target.x,
    y: target.y,
    k: target.k ?? calcContinentFromCoords(target.x, target.y),
    name: target.name || null,
    playerId: target.playerId ?? null,
    target: {
      id: target.id ?? null,
      x: target.x,
      y: target.y,
    },
    dispatchMode: mode,
    mode,
  }

  const handled = !window.dispatchEvent(new CustomEvent(PLANNER_CTX_OPEN_EVENT, {
    bubbles: false,
    cancelable: true,
    detail,
  }))

  if (!handled) {
    printMessage.warn('Ctx do planner ainda nao esta ligado.', 1800)
  }
}

export function installCtxRuntime({
  getBotView = null,
} = {}) {
  if (typeof getBotView !== 'function') {
    return () => {}
  }

  const state = {
    anchorTarget: null,
    mapTarget: null,
    clickSyncTimerId: null,
    intervalId: null,
    installed: true,
  }

  const render = () => {
    const botView = getBotView()
    const primarySlot = botView?.primarySlot
    if (!(primarySlot instanceof HTMLElement)) return

    removeCtxButtons(primarySlot)

    const activeTarget = state.mapTarget || state.anchorTarget
    if (!activeTarget) return

    const targetLabel = formatTargetLabel(activeTarget)
    const sendButton = createBtnCrossedSwords(primarySlot, {
      size: 20,
      className: 'go-bot-view-ctx-send',
      title: targetLabel ? `Planner: enviar para ${targetLabel}` : 'Planner: enviar',
      iconUri: ICON_CROSSED_SWORDS_CENTERED,
      onClick: () => {
        void openPlannerFromCtxTarget(activeTarget, 'send')
      },
    })
    decorateCtxButton(sendButton, targetLabel ? `Planner: enviar para ${targetLabel}` : 'Planner: enviar')

    if (isPlannerScheduleEnabled()) {
      const scheduleButton = createBtnCalendar(primarySlot, {
        size: 20,
        className: 'go-bot-view-ctx-schedule',
        title: targetLabel ? `Planner: agendar para ${targetLabel}` : 'Planner: agendar',
        onClick: () => {
          void openPlannerFromCtxTarget(activeTarget, 'schedule')
        },
      })
      decorateCtxButton(scheduleButton, targetLabel ? `Planner: agendar para ${targetLabel}` : 'Planner: agendar')
    }
  }

  const syncMapTarget = () => {
    const nextTarget = readMapCtxTarget()
    if (sameTarget(state.mapTarget, nextTarget)) return
    state.mapTarget = cloneTarget(nextTarget)
    render()
  }

  const scheduleMapSync = () => {
    if (state.clickSyncTimerId != null) {
      window.clearTimeout(state.clickSyncTimerId)
    }

    state.clickSyncTimerId = window.setTimeout(() => {
      state.clickSyncTimerId = null
      syncMapTarget()
    }, CLICK_SCHEDULE_SYNC_DELAY_MS)
  }

  const onDocumentClick = (event) => {
    const nextAnchorTarget = readVillageAnchorCtxTargetFromEventTarget(event.target)
    if (nextAnchorTarget && !sameTarget(state.anchorTarget, nextAnchorTarget)) {
      state.anchorTarget = cloneTarget(nextAnchorTarget)
      render()
    }

    if (isMapScreen()) {
      scheduleMapSync()
    }
  }

  const onDocumentKeyDown = (event) => {
    if (event.key !== 'Escape' && event.key !== 'Esc' && event.keyCode !== 27) return
    if (!state.anchorTarget && !state.mapTarget) return
    state.anchorTarget = null
    state.mapTarget = null
    render()
  }

  document.addEventListener('click', onDocumentClick, true)
  document.addEventListener('keydown', onDocumentKeyDown, true)

  if (isMapScreen()) {
    state.intervalId = window.setInterval(syncMapTarget, MAP_CTX_SYNC_INTERVAL_MS)
    syncMapTarget()
  }

  render()

  return () => {
    if (!state.installed) return
    state.installed = false

    document.removeEventListener('click', onDocumentClick, true)
    document.removeEventListener('keydown', onDocumentKeyDown, true)

    if (state.clickSyncTimerId != null) {
      window.clearTimeout(state.clickSyncTimerId)
      state.clickSyncTimerId = null
    }

    if (state.intervalId != null) {
      window.clearInterval(state.intervalId)
      state.intervalId = null
    }

    const botView = getBotView()
    removeCtxButtons(botView?.primarySlot)
  }
}
