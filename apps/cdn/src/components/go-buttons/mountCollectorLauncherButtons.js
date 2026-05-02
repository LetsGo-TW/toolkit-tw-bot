import { createBtnSearch } from './search'
import { createCollectorBasePopup } from '../collector-base'
import { createCoordDragSelect } from '../coord-drag-select'
import { printMessage } from '../printMessage'
import { isPlannerScheduleEnabled, PLANNER_SCHEDULE_DISABLED_MESSAGE } from '../../planner/featureFlags'
import { createInlinePlannerActionButtons } from './inline-planner-actions'
import {
  mountPlannerDraftButton,
  mountPlannerDraftListButton,
  openPlannerFromNamedDraft,
  saveLastDraftAsNamed
} from './mountPlannerActionButtons'
import { createTargetsDraftCore } from '../../planner/targets-draft/core'
import './planner-action-buttons.css'
import { getGameData } from '@toolkit-tw-bot/document'
import Tooltip from '@toolkit-tw-bot/document/tooltip'
import { extensionId } from '@toolkit-tw-bot/release'
import { svgToDataUri } from './util'

const SUPPORTED_SCREENS = new Set(['forum', 'memo', 'report', 'mail', 'info_player', 'accountmanager'])
const SUPPORTED_ALLY_MODES = new Set(['members_defense', 'members_troops', 'reservations'])
const SUPPORTED_MAIL_MODES = new Set(['', 'in', 'view'])
const UNSUPPORTED_REPORT_MODES = new Set(['event', 'filter', 'groups'])
const BOT_VIEW_COLLECTOR_LAUNCHER_ID = 'go-slot-collector'
const MAP_COLLECTOR_LAUNCHER_ID = 'go-map-collector-launcher'
const BOT_VIEW_SLOT_COLLECTOR_SELECTOR = '#go-extension-bot-view-slot-collector'
const BOT_VIEW_COLLECTOR_ICON_URL = svgToDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24">' +
    '<circle cx="11" cy="11" r="6.8" fill="none" stroke="#dcfce7" stroke-width="3.6"/>' +
    '<circle cx="11" cy="11" r="6.8" fill="none" stroke="#50fa7b" stroke-width="2.1"/>' +
    '<circle cx="9.2" cy="9.2" r="1.9" fill="#50fa7b" opacity="0.22"/>' +
    '<line x1="16.6" y1="16.6" x2="21" y2="21" stroke="#dcfce7" stroke-width="4.2" stroke-linecap="round"/>' +
    '<line x1="16.6" y1="16.6" x2="21" y2="21" stroke="#50fa7b" stroke-width="2.3" stroke-linecap="round"/>' +
  '</svg>'
)
let unbindCollectorLauncherTooltip = null
let collectorBasePreviewPopup = null
let collectorBasePreviewCoordSelector = null
let collectorBasePreviewPlannerUi = null
const collectorPreviewCtx = {
  screen: '',
}
const DEFAULT_BOT_ICON_URL = `chrome-extension://${extensionId}/icons/ico.green.128.png`;
const collectorPreviewTargetsDraftCore = createTargetsDraftCore()
let plannerOneToManyModulePromise = null
let botViewCollectorLauncherBooted = false
let botViewCollectorLauncherHashListenerBound = false
let botViewCollectorLauncherStateListenerBound = false
let botViewCollectorLauncherBodyObserver = null
let botViewCollectorLauncherContentObserver = null
let botViewCollectorLauncherObservedContent = null
let botViewCollectorLauncherSyncFrame = 0

async function loadPlannerOneToMany() {
  if (!plannerOneToManyModulePromise) {
    plannerOneToManyModulePromise = import('../../planner').then((module) => module?.plannerOneToMany)
  }
  const plannerOneToMany = await plannerOneToManyModulePromise
  if (typeof plannerOneToMany !== 'function') {
    throw new Error('[GO][Planner] plannerOneToMany not available')
  }
  return plannerOneToMany
}

function getCurrentScreenName() {
  try {
    const url = new URL(location.href, origin)
    return String(url.searchParams.get('screen') || '').trim().toLowerCase()
  } catch (_) {
    return ''
  }
}

function getCurrentModeName() {
  try {
    const url = new URL(location.href, origin)
    return String(url.searchParams.get('mode') || '').trim().toLowerCase()
  } catch (_) {
    return ''
  }
}

function isMapScreen(screen = '') {
  return String(screen || '').trim().toLowerCase() === 'map'
}

function isSupportedScreen(screen, mode = '') {
  const normalized = String(screen || '').trim().toLowerCase()
  const normalizedMode = String(mode || '').trim().toLowerCase()
  if (!normalized) return false
  if (normalized === 'mail') {
    return SUPPORTED_MAIL_MODES.has(normalizedMode)
  }
  if (normalized === 'report' && UNSUPPORTED_REPORT_MODES.has(normalizedMode)) {
    return false
  }
  if (normalized === 'ally') {
    return SUPPORTED_ALLY_MODES.has(normalizedMode)
  }
  if (SUPPORTED_SCREENS.has(normalized)) return true
  return normalized.startsWith('overview_')
}

function isOverviewLikeScreen(screen = '') {
  const normalized = String(screen || '').trim().toLowerCase()
  if (!normalized) return false
  return normalized.startsWith('overview_')
}

function isAccountManagerScreen(screen = '') {
  return String(screen || '').trim().toLowerCase() === 'accountmanager'
}

function isInlineLauncherLayoutScreen(screen = '') {
  return isOverviewLikeScreen(screen) || isAccountManagerScreen(screen)
}

function getOverviewLikeAnchor() {
  const target = document.querySelector('.vis.overview_table')
  if (!target?.parentElement) return null
  return {
    contentValue: document.querySelector('#content_value') || target.parentElement,
    target,
    parent: target.parentElement
  }
}

function getAccountManagerAnchor() {
  const target = document.querySelector('#am_overview')
  if (!target?.parentElement) return null
  return {
    contentValue: document.querySelector('#content_value') || target.parentElement,
    target,
    parent: target.parentElement
  }
}

function getBotTooltipIconUrl() {
  const candidates = [
    window.ICON_48_URL,
    DEFAULT_BOT_ICON_URL
  ]
  return candidates
    .map((value) => String(value || '').trim())
    .find((url) => (
      /^https?:\/\//i.test(url)
      || /^chrome-extension:\/\//i.test(url)
      || /^moz-extension:\/\//i.test(url)
      || /^data:image\//i.test(url)
    )) || ''
}

function renderBotTooltip(text) {
  const safeText = String(text || '').trim()
  if (!safeText) return null
  const iconUrl = getBotTooltipIconUrl()
  if (!iconUrl) return `<span>${safeText}</span>`
  return `
    <div style="display:flex;align-items:center;gap:6px;">
      <span style="
        width:16px;
        height:16px;
        border-radius:999px;
        display:inline-block;
        flex:0 0 auto;
        background-image:url('${iconUrl}');
        background-position:center;
        background-repeat:no-repeat;
        background-size:contain;
      "></span>
      <span>${safeText}</span>
    </div>
  `
}

function ensureCollectorLauncherTooltipOnce() {
  if (unbindCollectorLauncherTooltip) return
  const tooltip = new Tooltip()
  const shouldRenderBotIconInCollectorTooltip = (el) => {
    if (!el) return false
    return el.getAttribute?.('data-go-brand-tooltip') === '1'
  }
  unbindCollectorLauncherTooltip = tooltip.bind(
    document.body,
    '.go-collector-launcher-buttons [data-go-title], .go-collector-base [data-go-title]',
    (el) => {
      const value = String(el?.getAttribute?.('data-go-title') || '').trim()
      if (!value) return null
      if (!shouldRenderBotIconInCollectorTooltip(el)) return value
      return renderBotTooltip(value)
    }
  )
}

function stopLauncherEvent(event) {
  event?.preventDefault?.()
  event?.stopPropagation?.()
}

function getMountAnchor(screen = '') {
  const normalizedScreen = String(screen || '').trim().toLowerCase()

  if (isAccountManagerScreen(normalizedScreen)) {
    const accountManagerAnchor = getAccountManagerAnchor()
    if (accountManagerAnchor?.parent) return accountManagerAnchor
  }

  if (isOverviewLikeScreen(normalizedScreen)) {
    const overviewAnchor = getOverviewLikeAnchor()
    if (overviewAnchor?.parent) return overviewAnchor
  }

  const contentValue = document.querySelector('#content_value')
  if (!contentValue) return null

  const target =
    contentValue.querySelector(':scope > table') ||
    contentValue.querySelector(':scope > form > table') ||
    contentValue.firstElementChild ||
    contentValue

  const parent = target?.parentElement || contentValue
  if (!parent) return null

  return { contentValue, target, parent }
}

function applyScreenSpecificLayoutFixes(screen) {
  if (screen === 'mail') {
    const mailSearchbar = document.querySelector('#mail_searchbar')
    if (mailSearchbar) mailSearchbar.style.marginRight = '50px'
    return
  }

  if (screen === 'memo') {
    const memoActionLink = document.querySelector('#content_value > a')
    if (!memoActionLink) return
    memoActionLink.style.float = 'right'
    memoActionLink.style.marginRight = '50px'
  }
}

function buildDefaultClickHandler({ screen = '' } = {}) {
  return (event) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    printMessage.warn('Coletor Master em preparação.', 2200)
    console.debug('[GO][CollectorLauncher]', {
      screen
    })
  }
}

function shouldUseCollectorBasePreview(screen = '') {
  return Boolean(String(screen || '').trim())
}

function isOwnInfoPlayerScreen(screen = '') {
  if (String(screen || '').trim().toLowerCase() !== 'info_player') return false
  const gameData = getGameData?.() || window.game_data || null
  const myPlayerId = Number(gameData?.player?.id)
  const infoPlayerId = Number(window?.InfoPlayer?.player_id)
  return Number.isFinite(myPlayerId) && Number.isFinite(infoPlayerId) && myPlayerId === infoPlayerId
}

function getOrCreateCollectorBasePreviewPopup({ screen = '' } = {}) {
  const currentRoot = collectorBasePreviewPopup?.root?.()
  if (currentRoot?.isConnected) {
    collectorBasePreviewPopup.setTitle?.('Coletor Master')
    collectorBasePreviewPopup.setCount?.(collectorBasePreviewCoordSelector?.getSelectedCount?.() || 0)
    ensureCollectorBasePreviewBodyHint(collectorBasePreviewPopup)
    ensureCollectorBasePreviewPlannerActions(collectorBasePreviewPopup)
    return collectorBasePreviewPopup
  }

  collectorBasePreviewPopup = createCollectorBasePopup({
    title: 'Coletor Master',
    statusLabel: 'selecionadas:',
    count: 0,
    onClose: () => {
      collectorBasePreviewCoordSelector?.stop?.()
    },
    onPaste: async () => {
      const coordSelector = getOrCreateCollectorBasePreviewCoordSelector({
        popup: collectorBasePreviewPopup,
        screen: collectorPreviewCtx.screen || screen
      })
      collectorBasePreviewPopup?.setPasteDisabled?.(true)
      try {
        const result = await coordSelector?.pasteFromClipboard?.()
        const parsedCount = Math.max(0, Math.floor(Number(result?.parsedCount) || 0))
        const addedCount = Math.max(0, Math.floor(Number(result?.addedCount) || 0))
        const totalCount = Math.max(0, Math.floor(Number(result?.count) || coordSelector?.getSelectedCount?.() || 0))
        const duplicatedCount = Math.max(0, parsedCount - addedCount)
        if (parsedCount <= 0) {
          printMessage.error('Nenhuma coordenada encontrada no texto colado.', 2600)
        } else if (addedCount <= 0) {
          printMessage.warn(`Nenhuma coordenada nova. (${parsedCount} encontrada(s), todas repetidas)`, 2600)
        } else {
          const duplicateLabel = duplicatedCount > 0 ? ` | repetidas: ${duplicatedCount}` : ''
          printMessage.warn(`Coletor: +${addedCount} coordenada(s)${duplicateLabel} | total: ${totalCount}`, 3000)
        }
        refreshCollectorPreviewPlannerUi()
        return { count: totalCount }
      } catch (error) {
        console.error('[GO][CollectorPreviewPaste]', error)
        printMessage.error(`Falha ao colar coordenadas: ${error?.message || 'erro'}`, 3000)
        return { count: coordSelector?.getSelectedCount?.() || 0 }
      } finally {
        collectorBasePreviewPopup?.setPasteDisabled?.(false)
      }
    },
    onClear: () => {
      const result = collectorBasePreviewCoordSelector?.clear?.()
      refreshCollectorPreviewPlannerUi()
      return { count: Number(result?.count) || 0 }
    }
  })

  ensureCollectorBasePreviewBodyHint(collectorBasePreviewPopup)
  ensureCollectorBasePreviewPlannerActions(collectorBasePreviewPopup)

  return collectorBasePreviewPopup
}

function ensureCollectorBasePreviewBodyHint(popup) {
  const toolbar = popup?.toolbar?.()
  if (!toolbar) return
  if (!toolbar.querySelector('[data-go-collector-preview-hint]')) {
    const hint = document.createElement('div')
    hint.setAttribute('data-go-collector-preview-hint', '1')
    hint.style.font = '11px/1.25 Arial, sans-serif'
    hint.style.color = '#f0c15a'
    hint.style.textShadow = '0 1px 0 rgba(0,0,0,.25)'
    hint.style.maxWidth = '230px'
    hint.style.flex = '1 1 auto'
    hint.style.whiteSpace = 'normal'
    hint.textContent = 'Arraste na tela para selecionar coordenadas. O contador mostra coords únicas.'
    toolbar.appendChild(hint)
    popup?.refreshLayout?.()
  }
}

function getCollectorContentRoot() {
  return document.querySelector('#content_value')
}

function hasRenderableCoordsInContentRoot(root) {
  if (!root?.isConnected) return false
  const text = String(root.innerText || '')
  return /\b\d{1,3}\|\d{1,3}\b/.test(text)
}

function getCollectorSelectionRoot() {
  return getCollectorContentRoot() || document.body
}

function parseCoordKeyToTarget(coordKey = '') {
  const match = String(coordKey || '').trim().match(/^(\d{1,3})\|(\d{1,3})$/)
  if (!match) return null
  return {
    id: null,
    x: Number(match[1]),
    y: Number(match[2])
  }
}

function getCollectorPreviewCurrentTargets() {
  const coordKeys = collectorBasePreviewCoordSelector?.getSelectedCoords?.() || []
  return coordKeys.map(parseCoordKeyToTarget).filter(Boolean)
}

function getCollectorDraftDispatchMode(draft = null) {
  const mode = String(draft?.dispatchMode || draft?.mode || '').trim().toLowerCase()
  return mode === 'schedule' ? 'schedule' : 'send'
}

function collectorPreviewHasSavedDraftTargets() {
  const draft = collectorPreviewTargetsDraftCore.readDraft?.() || null
  const draftItems = collectorPreviewTargetsDraftCore.parseDraftTargetsItems?.(draft) || []
  return Boolean(draft && draftItems.length > 1)
}

function shouldConfirmOverwriteSavedDraftOnCollectorPreviewAction() {
  return collectorPreviewHasSavedDraftTargets() && getCollectorPreviewCurrentTargets().length > 1
}

function positionCollectorPreviewOverwriteDraftMenu({ menuEl = null, footerEl = null, triggerBtn = null } = {}) {
  if (!menuEl || !footerEl) return
  if (!triggerBtn) {
    menuEl.style.left = '0px'
    menuEl.style.top = '30px'
    return
  }
  const footerRect = footerEl.getBoundingClientRect()
  const btnRect = triggerBtn.getBoundingClientRect()
  const menuRect = menuEl.getBoundingClientRect()
  const gap = 4
  let left = Math.round((btnRect.right - footerRect.left) - menuRect.width)
  let top = Math.round((btnRect.bottom - footerRect.top) + gap)
  left = Math.max(0, Math.min(left, Math.max(0, Math.round(footerRect.width - menuRect.width))))
  top = Math.max(0, top)
  menuEl.style.left = `${left}px`
  menuEl.style.top = `${top}px`
}

async function openPlannerFromCollectorPreviewTargets({
  targets = [],
  dispatchMode = 'send',
  meta = {}
} = {}) {
  const normalizedTargets = (Array.isArray(targets) ? targets : [])
    .map((item) => {
      const x = Number(item?.x)
      const y = Number(item?.y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      const id = Number(item?.id)
      return {
        id: Number.isFinite(id) ? id : null,
        x,
        y,
        ...(Object.prototype.hasOwnProperty.call(item || {}, 'qty')
          ? { qty: Math.max(0, Math.floor(Number(item?.qty) || 0)) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(item || {}, 'selected')
          ? { selected: Boolean(item?.selected) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(item || {}, 'dispatchStatus')
          ? {
            dispatchStatus: (item?.dispatchStatus && typeof item.dispatchStatus === 'object')
              ? item.dispatchStatus
              : null
          }
          : {})
      }
    })
    .filter(Boolean)

  if (!normalizedTargets.length) {
    printMessage.error('Selecione ao menos uma coordenada.', 2500)
    return false
  }

  const mode = dispatchMode === 'schedule' ? 'schedule' : 'send'
  const initialTarget = normalizedTargets[0]
  collectorBasePreviewPopup?.close?.()
  const plannerOneToMany = await loadPlannerOneToMany()

  await plannerOneToMany({
    ...initialTarget,
    playerId: Number.isFinite(Number(meta?.playerId)) ? Number(meta.playerId) : null,
    target: { id: initialTarget?.id ?? null, x: initialTarget.x, y: initialTarget.y },
    targets: normalizedTargets,
    dispatchMode: mode,
    mode,
    templateComponentState: (meta?.templateComponentState && typeof meta.templateComponentState === 'object')
      ? meta.templateComponentState
      : null,
    dispatchTargetScope: String(meta?.dispatchTargetScope || meta?.targetScope || '').trim() || null,
    targetScope: String(meta?.targetScope || meta?.dispatchTargetScope || '').trim() || null,
    scheduleDateTime: String(meta?.scheduleDateTime || '').trim() || null
  })

  return true
}

async function openPlannerFromCollectorPreviewSavedDraft({ mergeWithCurrent = false } = {}) {
  await collectorPreviewTargetsDraftCore.ready?.()
  const draft = collectorPreviewTargetsDraftCore.readDraft?.() || null
  const draftItems = collectorPreviewTargetsDraftCore.parseDraftTargetsItems?.(draft) || []
  if (!draft || draftItems.length <= 1) {
    printMessage.error('Nenhum rascunho salvo válido encontrado.', 2500)
    return false
  }

  const currentTargets = getCollectorPreviewCurrentTargets()
  const targets = mergeWithCurrent
    ? (collectorPreviewTargetsDraftCore.mergeTargetListsPreferCurrent?.(currentTargets, draftItems) || currentTargets)
    : draftItems

  if (!Array.isArray(targets) || targets.length <= 1) {
    printMessage.error('Rascunho inválido para abrir no planner.', 2500)
    return false
  }

  return await openPlannerFromCollectorPreviewTargets({
    targets,
    dispatchMode: getCollectorDraftDispatchMode(draft),
    meta: {
      templateComponentState: (draft?.templateComponentState && typeof draft.templateComponentState === 'object')
        ? draft.templateComponentState
        : null,
      dispatchTargetScope: String(draft?.dispatchTargetScope || draft?.targetScope || '').trim() || null,
      targetScope: String(draft?.targetScope || draft?.dispatchTargetScope || '').trim() || null,
      scheduleDateTime: String(draft?.scheduleDateTime || '').trim() || null
    }
  })
}

function refreshCollectorPreviewPlannerUi() {
  collectorBasePreviewPlannerUi?.syncDispatchButtonsState?.()
  collectorBasePreviewPlannerUi?.draftListUi?.refresh?.()
  collectorBasePreviewPlannerUi?.draftUi?.refresh?.()
}

function ensureCollectorBasePreviewPlannerActions(popup) {
  const slot = popup?.actionsSlot?.()
  const footerEl = popup?.footer?.()
  if (!slot) return null

  if (collectorBasePreviewPlannerUi?.root?.()?.isConnected) {
    refreshCollectorPreviewPlannerUi()
    return collectorBasePreviewPlannerUi
  }

  const overwriteDraftMenuEl = document.createElement('div')
  overwriteDraftMenuEl.className = 'go-collector-overwrite-draft-menu'
  overwriteDraftMenuEl.hidden = true
  overwriteDraftMenuEl.innerHTML = `
    <div class="go-collector-overwrite-draft-text">
      Os alvos salvos anteriormente serão excluídos. Continuar?
    </div>
    <div class="go-collector-overwrite-draft-actions">
      <button type="button" data-collector-overwrite-draft-confirm>Continuar</button>
      <button type="button" data-collector-overwrite-draft-cancel>Voltar</button>
    </div>
  `
  footerEl?.appendChild?.(overwriteDraftMenuEl)

  let overwriteDraftPendingAction = null
  let lastDispatchTriggerBtn = null

  const closeOverwriteDraftMenu = () => {
    overwriteDraftPendingAction = null
    overwriteDraftMenuEl.hidden = true
    overwriteDraftMenuEl.removeAttribute('data-mode')
  }

  const openOverwriteDraftMenu = ({ mode = 'send', triggerBtn = null, action = null } = {}) => {
    overwriteDraftPendingAction = typeof action === 'function' ? action : null
    overwriteDraftMenuEl.hidden = false
    overwriteDraftMenuEl.setAttribute('data-mode', mode === 'schedule' ? 'schedule' : 'send')
    const activeBtn = document.activeElement?.closest?.('.go-btn-inline') || null
    const resolvedTriggerBtn = triggerBtn || lastDispatchTriggerBtn || activeBtn || null
    positionCollectorPreviewOverwriteDraftMenu({
      menuEl: overwriteDraftMenuEl,
      footerEl,
      triggerBtn: resolvedTriggerBtn
    })
  }

  const popupRoot = popup?.root?.()
  const onPopupPointerDownCloseOverwriteMenu = (event) => {
    if (overwriteDraftMenuEl.hidden) return
    if (event.target?.closest?.('.go-collector-overwrite-draft-menu')) return
    if (event.target?.closest?.('.go-planner-action-buttons-group')) return
    closeOverwriteDraftMenu()
  }
  popupRoot?.addEventListener?.('pointerdown', onPopupPointerDownCloseOverwriteMenu, true)

  const runPreviewDispatchAction = (mode) => {
    const hasTargets = getCollectorPreviewCurrentTargets().length > 0
    if (!hasTargets) {
      printMessage.warn('Selecione ao menos 1 vila.', 2000)
      return
    }

    if (mode === 'schedule') {
      if (!isPlannerScheduleEnabled()) {
        printMessage.warn(PLANNER_SCHEDULE_DISABLED_MESSAGE, 2200)
        return
      }
      void openPlannerFromCollectorPreviewTargets({
        targets: getCollectorPreviewCurrentTargets(),
        dispatchMode: 'schedule'
      })
      return
    }

    void openPlannerFromCollectorPreviewTargets({
      targets: getCollectorPreviewCurrentTargets(),
      dispatchMode: 'send'
    })
  }

  const runPreviewDispatchActionWithConfirm = ({ mode = 'send', triggerBtn = null } = {}) => {
    if (shouldConfirmOverwriteSavedDraftOnCollectorPreviewAction()) {
      openOverwriteDraftMenu({
        mode,
        triggerBtn,
        action: () => runPreviewDispatchAction(mode)
      })
      return
    }
    closeOverwriteDraftMenu()
    runPreviewDispatchAction(mode)
  }

  const inline = createInlinePlannerActionButtons(slot, {
    size: 24,
    wrapperClass: 'go-planner-action-buttons-group',
    tooltipAttr: 'data-go-title',
    scheduleDisabled: !isPlannerScheduleEnabled(),
    scheduleDisabledTitle: PLANNER_SCHEDULE_DISABLED_MESSAGE,
    onSchedule: (event) => {
      const triggerBtn = event?.currentTarget || null
      runPreviewDispatchActionWithConfirm({ mode: 'schedule', triggerBtn })
    },
    onSend: (event) => {
      const triggerBtn = event?.currentTarget || null
      runPreviewDispatchActionWithConfirm({ mode: 'send', triggerBtn })
    }
  })
  inline?.btnCal?.setAttribute?.('data-go-brand-tooltip', '1')
  inline?.btnSword?.setAttribute?.('data-go-brand-tooltip', '1')

  const setDispatchButtonDisabledState = (btn, {
    disabled = false,
    title = ''
  } = {}) => {
    if (!btn) return
    btn.disabled = Boolean(disabled)
    btn.setAttribute('aria-disabled', disabled ? 'true' : 'false')
    if (title) btn.setAttribute('data-go-title', String(title))
  }

  const syncDispatchButtonsState = () => {
    const hasTargets = getCollectorPreviewCurrentTargets().length > 0

    setDispatchButtonDisabledState(inline?.btnSword, {
      disabled: !hasTargets,
      title: hasTargets ? 'Enviar comandos' : 'Selecione ao menos 1 vila'
    })

    const scheduleBlockedByFeatureFlag = !isPlannerScheduleEnabled()
    setDispatchButtonDisabledState(inline?.btnCal, {
      disabled: !hasTargets || scheduleBlockedByFeatureFlag,
      title: !hasTargets
        ? 'Selecione ao menos 1 vila'
        : (scheduleBlockedByFeatureFlag ? PLANNER_SCHEDULE_DISABLED_MESSAGE : 'Agendar comandos')
    })

    if (!hasTargets) closeOverwriteDraftMenu()
  }

  syncDispatchButtonsState()
  inline?.wrap?.addEventListener?.('pointerdown', (event) => {
    const btn = event.target?.closest?.('.go-btn-inline')
    if (btn) lastDispatchTriggerBtn = btn
    closeOverwriteDraftMenu()
  }, true)

  const onOverwriteDraftMenuClick = (event) => {
    const confirmBtn = event.target?.closest?.('[data-collector-overwrite-draft-confirm]')
    if (confirmBtn) {
      event.preventDefault?.()
      event.stopPropagation?.()
      const action = overwriteDraftPendingAction
      closeOverwriteDraftMenu()
      action?.()
      return
    }

    const cancelBtn = event.target?.closest?.('[data-collector-overwrite-draft-cancel]')
    if (cancelBtn) {
      event.preventDefault?.()
      event.stopPropagation?.()
      closeOverwriteDraftMenu()
      return
    }
  }
  overwriteDraftMenuEl.addEventListener('click', onOverwriteDraftMenuClick, true)

  let draftListUi = null
  let draftUi = null
  const refreshDraftButtons = () => {
    draftListUi?.refresh?.()
    draftUi?.refresh?.()
  }
  void collectorPreviewTargetsDraftCore.ready?.()
    .then(() => {
      refreshDraftButtons()
    })
    .catch((error) => {
      console.debug('[planner:collector:draft:ready]', error)
    })

  draftListUi = mountPlannerDraftListButton(slot, {
    visibleInContext: true,
    onOpen: ({ draftId }) => {
      collectorBasePreviewPopup?.close?.()
      void openPlannerFromNamedDraft(draftId)
    },
    onDelete: () => {
      refreshDraftButtons()
    },
    onChange: () => {
      refreshDraftButtons()
    },
    getTooltipLabel: ({ entries }) => `Drafts salvos (${entries.length})`
  })

  draftUi = mountPlannerDraftButton(slot, {
    visibleInContext: true,
    getCurrentTargets: () => getCollectorPreviewCurrentTargets(),
    canMerge: ({ currentTargets }) => Array.isArray(currentTargets) && currentTargets.length > 0,
    onRecover: () => {
      void openPlannerFromCollectorPreviewSavedDraft({ mergeWithCurrent: false })
    },
    onMerge: () => {
      void openPlannerFromCollectorPreviewSavedDraft({ mergeWithCurrent: true })
    },
    onDelete: () => {
      printMessage.warn('Rascunho excluído.', 2000)
      refreshDraftButtons()
    },
    onSave: (_payload, { name }) => {
      const result = saveLastDraftAsNamed(name, {
        onSaved: () => {
          refreshDraftButtons()
        }
      })
      if (!result?.ok) return false
    },
    getTooltipLabel: ({ draft }) => {
      const mode = getCollectorDraftDispatchMode(draft)
      return `Últimos alvos salvos (${mode === 'schedule' ? 'agendar' : 'enviar'})`
    },
    onChange: () => {
      refreshDraftButtons()
    }
  })

  collectorBasePreviewPlannerUi = {
    root: () => slot,
    inline,
    syncDispatchButtonsState,
    draftListUi,
    draftUi,
    refresh: refreshCollectorPreviewPlannerUi,
    destroy: () => {
      closeOverwriteDraftMenu()
      popupRoot?.removeEventListener?.('pointerdown', onPopupPointerDownCloseOverwriteMenu, true)
      overwriteDraftMenuEl.removeEventListener('click', onOverwriteDraftMenuClick, true)
      overwriteDraftMenuEl.remove()
      draftListUi?.destroy?.()
      draftUi?.destroy?.()
    }
  }

  popup?.refreshLayout?.()
  refreshCollectorPreviewPlannerUi()
  return collectorBasePreviewPlannerUi
}

function getOrCreateCollectorBasePreviewCoordSelector({ popup = null, screen = '' } = {}) {
  const root = getCollectorSelectionRoot()

  if (!collectorBasePreviewCoordSelector) {
    collectorBasePreviewCoordSelector = createCoordDragSelect({
      root,
      excludeSelector: '.go-collector-base, .go-collector-launcher-buttons',
      onCountChange: (count) => {
        popup?.setCount?.(count)
      },
      onSelectionChange: (coords) => {
        popup?.setCount?.(coords.length)
        refreshCollectorPreviewPlannerUi()
      },
      onCommit: (coords) => {
        console.debug('[GO][CollectorPreviewSelection]', {
          screen,
          count: coords.length,
          coords
        })
      }
    })
    return collectorBasePreviewCoordSelector
  }

  collectorBasePreviewCoordSelector.setRoot?.(root)
  refreshCollectorPreviewPlannerUi()
  return collectorBasePreviewCoordSelector
}

function hasActivePopup() {
  const collectorPopup = collectorBasePreviewPopup?.root?.()
  return Boolean(collectorPopup?.classList?.contains?.('is-open'))
}

function bindCollectorPopupStateSync(popupRoot, onSyncState) {
  if (!popupRoot || typeof onSyncState !== 'function') return

  let handlers = popupRoot.__goCollectorLauncherStateSyncHandlers
  if (!(handlers instanceof Set)) {
    handlers = new Set()
    popupRoot.__goCollectorLauncherStateSyncHandlers = handlers
  }

  if (handlers.has(onSyncState)) return
  handlers.add(onSyncState)
  popupRoot.addEventListener('go:collector-base:open', onSyncState)
  popupRoot.addEventListener('go:collector-base:close', onSyncState)
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max))
}

function positionPreviewPopupBelowButton(popup, button) {
  const popupRoot = popup?.root?.()
  if (!popupRoot?.isConnected || !button?.isConnected) return

  const buttonRect = button.getBoundingClientRect()
  const popupRect = popupRoot.getBoundingClientRect()
  const margin = 8
  const gap = 6

  const desiredLeft = Math.round(buttonRect.right - popupRect.width)
  const desiredTop = Math.round(buttonRect.bottom + gap)

  const maxLeft = Math.max(margin, window.innerWidth - popupRect.width - margin)
  const maxTop = Math.max(margin, window.innerHeight - popupRect.height - margin)

  popupRoot.style.left = `${clamp(desiredLeft, margin, maxLeft)}px`
  popupRoot.style.top = `${clamp(desiredTop, margin, maxTop)}px`
  popupRoot.style.transform = 'none'
}

function openCollectorBasePreviewFromButton({
  event = null,
  button = null,
  screen = '',
  onSyncState = null
} = {}) {
  stopLauncherEvent(event)
  ensureCollectorLauncherTooltipOnce()

  const popup = getOrCreateCollectorBasePreviewPopup({ screen })
  popup?.setTitle?.('Coletor Master')
  ensureCollectorBasePreviewPlannerActions(popup)

  const coordSelector = getOrCreateCollectorBasePreviewCoordSelector({ popup, screen })
  popup?.setCount?.(coordSelector?.getSelectedCount?.() || 0)

  const popupRoot = popup?.root?.()
  bindCollectorPopupStateSync(popupRoot, onSyncState)

  popup?.open?.()
  if (button) {
    positionPreviewPopupBelowButton(popup, button)
  }

  coordSelector?.start?.()
  refreshCollectorPreviewPlannerUi()
  onSyncState?.()
  return popup
}

function getBotViewCollectorSlot() {
  return document.querySelector(BOT_VIEW_SLOT_COLLECTOR_SELECTOR)
}

function removeBotViewCollectorLauncher() {
  document.getElementById(BOT_VIEW_COLLECTOR_LAUNCHER_ID)?.remove?.()
}

function removeMapCollectorLauncherIfNotOnMap(screen = getCurrentScreenName()) {
  if (isMapScreen(screen)) return
  document.getElementById(MAP_COLLECTOR_LAUNCHER_ID)?.remove?.()
}

function mountBotViewCollectorLauncherButton(btn) {
  const slotCollector = getBotViewCollectorSlot()
  if (!slotCollector || !btn) return null

  if (btn.parentElement !== slotCollector) {
    slotCollector.insertAdjacentElement('beforeend', btn)
  }

  return btn
}

function isBotViewCollectorLauncherAvailable(screen = getCurrentScreenName()) {
  if (!screen || isMapScreen(screen)) return false

  const contentRoot = getCollectorContentRoot()
  if (!contentRoot) return false

  return hasRenderableCoordsInContentRoot(contentRoot)
}

function syncBotViewCollectorLauncherState() {
  removeMapCollectorLauncherIfNotOnMap()

  const available = isBotViewCollectorLauncherAvailable()
  if (!available) {
    removeBotViewCollectorLauncher()
    return
  }

  const btn = getOrCreateBotViewCollectorLauncher()
  if (!btn) return

  const disabled = hasActivePopup()
  btn.disabled = disabled
  btn.setAttribute('aria-disabled', disabled ? 'true' : 'false')
  btn.setAttribute(
    'data-go-bot-view-tooltip',
    disabled ? 'Coletor Master já aberto' : 'Coletor Master'
  )
}

function scheduleBotViewCollectorLauncherSync() {
  if (botViewCollectorLauncherSyncFrame) return

  botViewCollectorLauncherSyncFrame = window.requestAnimationFrame(() => {
    botViewCollectorLauncherSyncFrame = 0
    bindBotViewCollectorContentObserver()
    syncBotViewCollectorLauncherState()
  })
}

function bindBotViewCollectorContentObserver() {
  const nextRoot = getCollectorContentRoot()
  if (botViewCollectorLauncherObservedContent === nextRoot) return

  botViewCollectorLauncherContentObserver?.disconnect?.()
  botViewCollectorLauncherContentObserver = null
  botViewCollectorLauncherObservedContent = nextRoot || null

  if (!nextRoot) return

  botViewCollectorLauncherContentObserver = new MutationObserver(() => {
    scheduleBotViewCollectorLauncherSync()
  })

  botViewCollectorLauncherContentObserver.observe(nextRoot, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden']
  })
}

function bindBotViewCollectorLauncherObserversOnce() {
  if (!botViewCollectorLauncherBodyObserver) {
    botViewCollectorLauncherBodyObserver = new MutationObserver(() => {
      scheduleBotViewCollectorLauncherSync()
    })

    botViewCollectorLauncherBodyObserver.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }

  bindBotViewCollectorContentObserver()
}

function openBotViewCollectorFromLauncher(event) {
  const button = event?.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : document.getElementById(BOT_VIEW_COLLECTOR_LAUNCHER_ID)

  if (!button || !isBotViewCollectorLauncherAvailable()) {
    syncBotViewCollectorLauncherState()
    return false
  }

  collectorPreviewCtx.screen = getCurrentScreenName()
  openCollectorBasePreviewFromButton({
    event,
    button,
    screen: collectorPreviewCtx.screen,
    onSyncState: syncBotViewCollectorLauncherState
  })

  return false
}

function createBotViewCollectorLauncherButton() {
  const btn = document.createElement('button')
  btn.id = BOT_VIEW_COLLECTOR_LAUNCHER_ID
  btn.type = 'button'
  btn.setAttribute('aria-label', 'Abrir coletor')
  btn.setAttribute('data-go-bot-view-tooltip', 'Coletor Master')

  const img = document.createElement('img')
  img.src = BOT_VIEW_COLLECTOR_ICON_URL
  img.alt = ''
  img.width = 18
  img.height = 18
  btn.append(img)

  btn.addEventListener('pointerdown', stopLauncherEvent, true)
  btn.addEventListener('mousedown', stopLauncherEvent, true)
  btn.addEventListener('touchstart', stopLauncherEvent, true)
  btn.addEventListener('click', openBotViewCollectorFromLauncher, true)

  return btn
}

function getOrCreateBotViewCollectorLauncher() {
  const existing = document.getElementById(BOT_VIEW_COLLECTOR_LAUNCHER_ID)
  const btn = existing instanceof HTMLButtonElement
    ? existing
    : createBotViewCollectorLauncherButton()

  if (existing && existing !== btn) {
    existing.remove()
  }

  return mountBotViewCollectorLauncherButton(btn)
}

export function mountCollectorLauncherButtons({
  onOpen = null
} = {}) {
  const screen = getCurrentScreenName()
  const mode = getCurrentModeName()
  if (!isSupportedScreen(screen, mode)) return null
  if (screen === 'info_player' && mode) return null
  if (isOwnInfoPlayerScreen(screen)) return null
  collectorPreviewCtx.screen = screen

  applyScreenSpecificLayoutFixes(screen)
  ensureCollectorLauncherTooltipOnce()

  const anchor = getMountAnchor(screen)
  if (!anchor?.parent) return null

  const { parent, target } = anchor
  parent.style.position = parent.style.position || 'relative'

  parent.querySelectorAll('.go-collector-launcher-buttons[data-go-collector-launcher-mounted="1"]').forEach((node) => {
    node?.remove?.()
  })

  const wrap = document.createElement('div')
  wrap.className = 'go-planner-action-buttons go-collector-launcher-buttons'
  wrap.setAttribute('data-go-collector-launcher-mounted', '1')
  wrap.setAttribute('data-go-collector-screen', screen)
  if (isInlineLauncherLayoutScreen(screen)) {
    wrap.style.position = 'static'
    wrap.style.top = 'auto'
    wrap.style.right = 'auto'
    wrap.style.width = '100%'
    wrap.style.justifyContent = 'flex-start'
  }

  const clickHandler = typeof onOpen === 'function'
    ? (event) => onOpen({
      event,
      screen,
      button: btnSearch,
      wrapper: wrap
    })
    : buildDefaultClickHandler({ screen })

  const btnSearch = createBtnSearch(wrap, {
    size: 24,
    className: 'go-btn-inline go-btn-inline-search',
    title: 'Abrir coletor',
    onClick: clickHandler
  })

  btnSearch.setAttribute('aria-label', `Abrir coletor (${screen})`)
  btnSearch.setAttribute('data-go-title', 'Coletor Master')
  btnSearch.setAttribute('data-go-brand-tooltip', '1')
  btnSearch.removeAttribute('title')

  const syncDisabledState = () => {
    const disabled = hasActivePopup()
    btnSearch.disabled = disabled
    btnSearch.setAttribute('aria-disabled', disabled ? 'true' : 'false')
  }

  const onDefaultOpenCollector = (event) => {
    if (typeof onOpen === 'function') return
    if (!shouldUseCollectorBasePreview(screen)) {
      clickHandler(event)
      return
    }
    openCollectorBasePreviewFromButton({
      event,
      button: btnSearch,
      screen,
      onSyncState: syncDisabledState
    })
  }

  btnSearch.removeEventListener?.('click', clickHandler)
  if (typeof onOpen !== 'function') {
    // Rebind para abrir a base do popup (exceto info_player), mantendo placeholder no info_player.
    btnSearch.addEventListener('click', onDefaultOpenCollector)
  }

  parent.insertBefore(wrap, target || parent.firstChild)

  syncDisabledState()

  return () => {
    wrap.remove()
  }
}

export function bootCollectorLauncherBotViewRunning() {
  const screen = getCurrentScreenName()
  removeMapCollectorLauncherIfNotOnMap(screen)

  ensureCollectorLauncherTooltipOnce()

  if (!botViewCollectorLauncherHashListenerBound) {
    botViewCollectorLauncherHashListenerBound = true
    window.addEventListener('hashchange', scheduleBotViewCollectorLauncherSync, { passive: true })
  }

  if (!botViewCollectorLauncherStateListenerBound) {
    botViewCollectorLauncherStateListenerBound = true
    document.addEventListener('go:collector-base:open', scheduleBotViewCollectorLauncherSync, true)
    document.addEventListener('go:collector-base:close', scheduleBotViewCollectorLauncherSync, true)
    document.addEventListener('go:planner:close', scheduleBotViewCollectorLauncherSync, true)
  }

  bindBotViewCollectorLauncherObserversOnce()

  if (!screen || isMapScreen(screen)) {
    removeBotViewCollectorLauncher()
  }

  if (botViewCollectorLauncherBooted) {
    scheduleBotViewCollectorLauncherSync()
    return
  }

  botViewCollectorLauncherBooted = true
  scheduleBotViewCollectorLauncherSync()
}

export default mountCollectorLauncherButtons
