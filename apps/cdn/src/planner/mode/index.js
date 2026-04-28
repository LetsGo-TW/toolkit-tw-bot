import './style.css'
import StorageLocalCompat from '../../shared/indexdb/storage-local-compat.js'
import {
  isPlannerScheduleEnabled,
  PLANNER_SCHEDULE_DISABLED_MESSAGE
} from '../featureFlags'
import { getGameData } from '@toolkit-tw-bot/document'
import { createInlinePlannerActionButtons } from '../../components/go-buttons/inline-planner-actions'
import { ICON_CROSSED_SWORDS, ICON_LIGHTNING_ARROW, ICON_PAPER_PLANE } from '../../components/go-buttons'
import { printMessage } from '../../components/printMessage'

const MODE_COMPONENT_PATH = ['planner', 'mode-component']
const SEND_ICON_VARIANT = 'crossed-swords'
const TW_CONTEXT_ICONS_SRC = 'https://dsbr.innogamescdn.com/asset/c4af3446/graphic/map/icons_context.webp'

let storageModeComponent = null
let modeComponentStateCache = {}
let modeComponentReady = false
let modeComponentReadyPromise = null
let modeComponentPersistQueue = Promise.resolve()

const getCurrentGameData = () => {
  if (typeof window !== "undefined" && typeof window.game_data !== "undefined") {
    return window.game_data
  }

  if (typeof document === "undefined") return null

  return getGameData()
}

function getStorage() {
  if (storageModeComponent) return storageModeComponent
  const gameData = getCurrentGameData()
  const world = String(gameData?.world || '').trim()
  const playerId = Number(gameData?.player?.id || 0)
  if (!world || !Number.isFinite(playerId) || playerId <= 0) return null
  storageModeComponent = StorageLocalCompat.create({
    world,
    playerId,
    path: MODE_COMPONENT_PATH,
  })
  return storageModeComponent
}

const getSendIconByVariant = (variant = SEND_ICON_VARIANT) => {
  if (variant === 'tw-context-swords') return TW_CONTEXT_ICONS_SRC
  if (variant === 'crossed-swords') return ICON_CROSSED_SWORDS
  if (variant === 'lightning-arrow') return ICON_LIGHTNING_ARROW
  return ICON_PAPER_PLANE
}

const normalizeMode = (mode) => {
  if (mode === 'schedule' && isPlannerScheduleEnabled()) return 'schedule'
  return 'send'
}

const normalizeConflictTroopsMode = (value) => {
  const mode = String(value || '').trim().toLowerCase()
  if (mode === 'abort' || mode === 'strict' || mode === 'estrito') return 'abort'
  return 'redistribute'
}

const cloneState = (value = {}) => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : {}
)

export async function readyPlannerModeStorage() {
  if (modeComponentReady) return cloneState(modeComponentStateCache)
  if (!modeComponentReadyPromise) {
    modeComponentReadyPromise = (async() => {
      try {
        const storage = getStorage()
        const state = await storage?.get?.()
        modeComponentStateCache = cloneState(state)
      } catch (error) {
        console.warn('[planner][mode][ready]', error?.message || error)
        modeComponentStateCache = {}
      } finally {
        modeComponentReady = true
      }
      return cloneState(modeComponentStateCache)
    })()
      .finally(() => {
        modeComponentReadyPromise = null
      })
  }
  return await modeComponentReadyPromise
}

const getStoredMode = () => {
  const stored = cloneState(modeComponentStateCache)
  return normalizeMode(stored?.mode)
}

const setStoredMode = (mode) => {
  const normalized = normalizeMode(mode)
  modeComponentStateCache = {
    ...cloneState(modeComponentStateCache),
    mode: normalized
  }
  const snapshot = cloneState(modeComponentStateCache)
  modeComponentPersistQueue = modeComponentPersistQueue
    .catch(() => null)
    .then(async() => {
      const storage = getStorage()
      if (!storage) return
      await storage.set?.(snapshot)
    })
    .catch((error) => {
      console.warn('[planner][mode][persist]', error?.message || error)
    })
  return normalized
}

export function plannerModeView(popUpBoxContent, config = {}) {
  const initialMode = normalizeMode(config?.mode || getStoredMode() || 'send')
  const onModeChange = typeof config?.onModeChange === 'function' ? config.onModeChange : null
  const onSendConflictTroopsModeChange = typeof config?.onSendConflictTroopsModeChange === 'function'
    ? config.onSendConflictTroopsModeChange
    : null
  const plannerModeEl = document.createElement('div')
  plannerModeEl.classList.add('go-mode-content')
  plannerModeEl.classList.add('is-top-compact')
  plannerModeEl.classList.add('go-mode-content-inline')

  const buttons = createInlinePlannerActionButtons(plannerModeEl, {
    size: 24,
    wrapperClass: 'go-planner-action-buttons-group go-planner-mode-inline',
    tooltipAttr: 'data-title',
    scheduleTitle: 'Agendar',
    scheduleDisabled: !isPlannerScheduleEnabled(),
    scheduleDisabledTitle: PLANNER_SCHEDULE_DISABLED_MESSAGE,
    sendTitle: 'Enviar',
    sendIconUri: getSendIconByVariant(),
    onSchedule: () => {
      if (!isPlannerScheduleEnabled()) {
        printMessage.warn(PLANNER_SCHEDULE_DISABLED_MESSAGE, 2200)
        return
      }
      setMode('schedule', { source: 'mode' })
    },
    onSend: () => setMode('send', { source: 'mode' })
  })

  const modeButtons = [buttons?.btnSword, buttons?.btnCal].filter(Boolean)
  if (buttons?.btnSword) {
    buttons.btnSword.dataset.commandMode = 'send'
    buttons.btnSword.setAttribute('aria-label', 'Enviar')
  }
  if (buttons?.btnCal) {
    buttons.btnCal.dataset.commandMode = 'schedule'
    buttons.btnCal.setAttribute('aria-label', isPlannerScheduleEnabled() ? 'Agendar' : 'Agendar (em preparação)')
  }
  modeButtons.forEach((button) => button.setAttribute('type', 'button'))

  let selectedMode = initialMode
  let sendConflictTroopsMode = 'redistribute'
  let emitModeChangeTimerId = null

  const emitModeChange = ({ source = 'mode', mode = selectedMode } = {}) => {
    const detail = {
      source,
      mode: normalizeMode(mode)
    }
    plannerModeEl.dispatchEvent(
      new CustomEvent('go:mode:change', {
        bubbles: true,
        detail
      })
    )
    onModeChange?.(detail)
  }

  const scheduleEmitModeChange = ({ source = 'mode', mode = selectedMode } = {}) => {
    if (emitModeChangeTimerId != null) {
      clearTimeout(emitModeChangeTimerId)
      emitModeChangeTimerId = null
    }
    emitModeChangeTimerId = setTimeout(() => {
      emitModeChangeTimerId = null
      emitModeChange({ source, mode })
    }, 0)
  }

  const renderButtons = () => {
    buttons?.setSelected(selectedMode)
  }

  const emitSendConflictTroopsModeChange = ({ source = 'mode' } = {}) => {
    onSendConflictTroopsModeChange?.({
      source,
      mode: sendConflictTroopsMode
    })
  }

  const setSendConflictTroopsMode = (mode, { emit = true, source = 'mode' } = {}) => {
    sendConflictTroopsMode = normalizeConflictTroopsMode(mode)
    if (emit) emitSendConflictTroopsModeChange({ source })
  }

  const setMode = (mode, {
    emit = true,
    persist = true,
    source = 'mode',
    keepSendOptionsOpen = false
  } = {}) => {
    selectedMode = normalizeMode(mode)
    renderButtons()
    if (persist) setStoredMode(selectedMode)
    if (emit) scheduleEmitModeChange({ source, mode: selectedMode })
  }

  renderButtons()
  setSendConflictTroopsMode('redistribute', { emit: true, source: 'mode:init' })
  setStoredMode(selectedMode)
  const modeSlot = document.querySelector('#go-planner-mode-slot')
  if (modeSlot) modeSlot.replaceChildren(plannerModeEl)
  else popUpBoxContent.insertAdjacentElement('beforeend', plannerModeEl)

  return {
    root: plannerModeEl,
    getMode: () => selectedMode,
    getSendConflictTroopsMode: () => sendConflictTroopsMode,
    setSendConflictTroopsMode,
    setMode,
    destroy: () => {
      if (emitModeChangeTimerId != null) {
        clearTimeout(emitModeChangeTimerId)
        emitModeChangeTimerId = null
      }
    },
    unbind: () => {
      if (emitModeChangeTimerId != null) {
        clearTimeout(emitModeChangeTimerId)
        emitModeChangeTimerId = null
      }
    }
  }
}

void readyPlannerModeStorage()
