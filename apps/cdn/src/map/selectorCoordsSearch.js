const VIEW_ID = 'go-map-collector-view'
const STYLE_ID = 'go-map-collector-view-style'
const MARKERS_ID = 'go-map-collector-markers'
const AREA_HINT_ID = 'go-map-collector-area-hint'
import {
  createBtnCalendar,
  ICON_CALENDAR
} from '../components/go-buttons/calendar'
import {
  createBtnCrossedSwords,
  ICON_CROSSED_SWORDS_CENTERED
} from '../components/go-buttons/crossed-swords'
import { svgToDataUri } from '../components/go-buttons/util'
import {
  mountPlannerDraftListButton,
  openPlannerFromNamedDraft,
  saveLastDraftAsNamed
} from '../components/go-buttons/mountPlannerActionButtons.js'
import { createCollectorBasePopup } from '../components/collector-base'
import { printMessage } from '../components/printMessage'
import '../components/go-buttons/planner-action-buttons.css'
import { createTargetsDraftButton } from '../planner/targets-draft/button'
import { createTargetsDraftCore } from '../planner/targets-draft/core.js'
import { orderCoordsFromCoords } from '../planner/manyTomany/orderCoordsFromCoords.js'
import { consoleDev } from '@toolkit-tw-bot/utils'
import { getGameData } from '@toolkit-tw-bot/document'
import Groups from '../groups'

const ICON_MODE_MOUSE = svgToDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<rect x="6.6" y="2.7" width="10.8" height="18.6" rx="5.4" fill="none" stroke="#111" stroke-width="3"/>' +
    '<rect x="6.6" y="2.7" width="10.8" height="18.6" rx="5.4" fill="none" stroke="#fff" stroke-width="1.6"/>' +
    '<path d="M12 3.8v5.5" stroke="#111" stroke-width="2.6" stroke-linecap="round"/>' +
    '<path d="M12 3.8v5.5" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>' +
  '</svg>'
)

const ICON_MODE_AREA = svgToDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<rect x="4.5" y="5.5" width="15" height="13" rx="1.5" fill="none" stroke="#111" stroke-width="3"/>' +
    '<rect x="4.5" y="5.5" width="15" height="13" rx="1.5" fill="none" stroke="#fff" stroke-width="1.6"/>' +
    '<path d="M8 5.5v4M4.5 9.5h4M16 18.5v-4M19.5 14.5h-4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>' +
  '</svg>'
)

const state = {
  selectedCoords: new Map(),
  areaStartCoord: null,
  lastMode: 'area',
  mapClickBound: false,
  areaHintBound: false,
  mapObserversBound: false,
  mapRootObserver: null,
  mapContainerObserver: null,
  observedMapContainerEl: null,
  scheduledMarkersRenderRaf: 0,
  viewPositionBound: false,
  viewDragged: false,
  viewDragSession: null,
  collectorPopup: null,
  sessionPayload: {
    root: null,
    token: null
  },
  targetsDraftListButton: null,
  targetsDraftButton: null,
  overwriteDraftMenuOpen: false,
  overwriteDraftMenuMode: null
}
let plannerOneToManyModulePromise = null

async function loadPlannerOneToMany() {
  if (!plannerOneToManyModulePromise) {
    plannerOneToManyModulePromise = import('../planner/index.js').then((module) => module?.plannerOneToMany)
  }
  const plannerOneToMany = await plannerOneToManyModulePromise
  if (typeof plannerOneToMany !== 'function') {
    throw new Error('[GO][Planner] plannerOneToMany not available')
  }
  return plannerOneToMany
}

const targetsDraftCore = createTargetsDraftCore()

function getCollectorSavedDraftPayload() {
  const draft = targetsDraftCore.readDraft?.()
  const draftItems = targetsDraftCore.parseDraftTargetsItems?.(draft) || []
  if (draftItems.length <= 1) return { draft: null, draftItems: [] }
  return { draft, draftItems }
}

function getCollectorDraftDispatchMode(draft = null) {
  const mode = String(draft?.dispatchMode || draft?.mode || '').trim().toLowerCase()
  return mode === 'schedule' ? 'schedule' : 'send'
}

async function buildOrderedTargetsForPlannerFromList(inputTargets = []) {
  const gameData = ensurePlannerActionRequirements()
  if (!gameData) return null

  const targets = (Array.isArray(inputTargets) ? inputTargets : [])
    .map((item = {}) => {
      const x = Number(item?.x)
      const y = Number(item?.y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      return {
        id: Number.isFinite(Number(item?.id)) ? Number(item.id) : null,
        x,
        y,
        ...(Object.prototype.hasOwnProperty.call(item, 'qty')
          ? { qty: Math.max(0, Math.floor(Number(item?.qty) || 0)) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(item, 'selected')
          ? { selected: Boolean(item?.selected) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(item, 'dispatchStatus')
          ? {
            dispatchStatus: (item?.dispatchStatus && typeof item.dispatchStatus === 'object')
              ? item.dispatchStatus
              : null
          }
          : {})
      }
    })
    .filter(Boolean)

  if (!targets.length) {
    printMessage.error('Selecione ao menos uma coordenada.', 2500)
    return null
  }

  let based = []
  try {
    const groups = new Groups()
    const groupId = Number(gameData?.group_id || 0)
    const groupData = await groups.villagesInGroup(groupId)
    based = Array.isArray(groupData?.villages)
      ? groupData.villages
          .map((v) => normalizeCoordStringToItem(v?.coord, v?.id))
          .filter(Boolean)
      : []
  } catch (error) {
    console.error('[GO][MapCollector] groups.villagesInGroup error', error)
  }

  if (!based.length) {
    const currentVillage = {
      id: Number(gameData?.village?.id || 0) || null,
      x: Number(gameData?.village?.x),
      y: Number(gameData?.village?.y)
    }
    if (Number.isFinite(currentVillage.x) && Number.isFinite(currentVillage.y)) {
      based = [currentVillage]
    }
  }

  const orderedTargets = based.length
    ? orderCoordsFromCoords(targets, based)
    : targets

  const initialTarget = orderedTargets[0] || null
  if (!initialTarget) {
    printMessage.error('Não foi possível definir alvo inicial.', 2500)
    return null
  }

  return { gameData, orderedTargets, initialTarget, basedCount: based.length }
}

async function openPlannerFromCollectorTargetsList(inputTargets = [], dispatchMode = 'send', meta = {}) {
  const mode = dispatchMode === 'schedule' ? 'schedule' : 'send'
  const prepared = await buildOrderedTargetsForPlannerFromList(inputTargets)
  if (!prepared) return false

  const { orderedTargets, initialTarget, basedCount } = prepared
  const targetVillage = getVillageFromCoord(initialTarget)
  const playerIdRaw = Number(targetVillage?.owner)
  const playerId = Number.isFinite(playerIdRaw) ? playerIdRaw : null
  const root = state.sessionPayload?.root || null
  const token = state.sessionPayload?.token || null

  consoleDev({
    event: meta?.event || 'action',
    action: mode,
    basedCount,
    initialTarget,
    root: Boolean(root),
    token: Boolean(token),
    selectedCoordsCount: state.selectedCoords.size,
    selectedCoords: orderedTargets
  }, { label: '[GO][MapCollector]' })

  closeSelectorView({ showLauncher: false })
  const plannerOneToMany = await loadPlannerOneToMany()
  await plannerOneToMany({
    ...initialTarget,
    playerId,
    target: initialTarget,
    targets: orderedTargets,
    dispatchMode: mode,
    mode,
    templateComponentState: (meta?.templateComponentState && typeof meta.templateComponentState === 'object')
      ? meta.templateComponentState
      : null,
    dispatchTargetScope: String(meta?.dispatchTargetScope || meta?.targetScope || '').trim() || null,
    targetScope: String(meta?.targetScope || meta?.dispatchTargetScope || '').trim() || null,
    scheduleDateTime: String(meta?.scheduleDateTime || '').trim() || null,
    root,
    token
  })
  return true
}

async function openPlannerFromCollectorSavedDraft({ mergeWithCurrent = false } = {}) {
  const { draft, draftItems } = getCollectorSavedDraftPayload()
  if (!draft || draftItems.length <= 1) {
    printMessage.error('Nenhum rascunho salvo válido encontrado.', 2500)
    return false
  }

  const currentTargets = selectedCoordsSnapshot().map(({ id, x, y }) => ({ id, x, y }))
  const targets = mergeWithCurrent
    ? (targetsDraftCore.mergeTargetListsPreferCurrent?.(currentTargets, draftItems) || currentTargets)
    : draftItems

  if (!Array.isArray(targets) || targets.length <= 1) {
    printMessage.error('Rascunho inválido para abrir no planner.', 2500)
    return false
  }

  return await openPlannerFromCollectorTargetsList(
    targets,
    getCollectorDraftDispatchMode(draft),
    {
      event: mergeWithCurrent ? 'draft:merge-open' : 'draft:open-saved',
      templateComponentState: (draft?.templateComponentState && typeof draft.templateComponentState === 'object')
        ? draft.templateComponentState
        : null,
      dispatchTargetScope: String(draft?.dispatchTargetScope || draft?.targetScope || '').trim() || null,
      targetScope: String(draft?.targetScope || draft?.dispatchTargetScope || '').trim() || null,
      scheduleDateTime: String(draft?.scheduleDateTime || '').trim() || null
    }
  )
}

function ensureCollectorTargetsDraftButton(view) {
  if (!view) return null
  const container = view.querySelector('[data-go-buttons]')
  if (!container) return null
  ensureCollectorTargetsDraftListButton(view)
  if (state.targetsDraftButton?.root?.()?.isConnected) return state.targetsDraftButton
  state.targetsDraftButton = createTargetsDraftButton(container, {
    variant: 'icon-button',
    onAction: (action, details = {}) => {
      if (action === 'open_saved') {
        void openPlannerFromCollectorSavedDraft({ mergeWithCurrent: false })
        return
      }
      if (action === 'merge_open') {
        void openPlannerFromCollectorSavedDraft({ mergeWithCurrent: true })
        return
      }
      if (action === 'discard') {
        targetsDraftCore.removeDraft?.()
        syncCollectorTargetsDraftButton(view)
        printMessage.warn('Últimos alvos salvos excluídos.', 2000)
        return
      }
      if (action === 'save_named') {
        const inputEl = details?.menuEl?.querySelector?.('[data-draft-input="save_named_name"]')
        const result = saveLastDraftAsNamed(String(inputEl?.value || ''), {
          onSaved: () => {
            syncCollectorTargetsDraftButton(view)
          }
        })
        if (!result?.ok) return false
      }
    }
  })
  return state.targetsDraftButton
}

function ensureCollectorTargetsDraftListButton(view) {
  if (!view) return null
  const container = view.querySelector('[data-go-buttons]')
  if (!container) return null
  if (state.targetsDraftListButton?.root?.()?.isConnected) return state.targetsDraftListButton
  state.targetsDraftListButton = mountPlannerDraftListButton(container, {
    visibleInContext: true,
    onOpen: ({ draftId }) => {
      closeSelectorView({ showLauncher: false })
      openPlannerFromNamedDraft(draftId, {
        root: state.sessionPayload?.root || null,
        token: state.sessionPayload?.token || null
      })
    },
    onDelete: () => {
      syncCollectorTargetsDraftButton(view)
    },
    onChange: () => {
      syncCollectorTargetsDraftButton(view)
    },
    getTooltipLabel: ({ entries }) => `Drafts salvos (${entries.length})`
  })
  return state.targetsDraftListButton
}

function syncCollectorTargetsDraftButton(view) {
  ensureCollectorTargetsDraftListButton(view)?.refresh?.()
  const button = ensureCollectorTargetsDraftButton(view)
  if (!button) return null
  const { draft, draftItems } = getCollectorSavedDraftPayload()
  const hasDraft = Boolean(draft && draftItems.length > 1)
  const currentTargets = selectedCoordsSnapshot().map(({ id, x, y }) => ({ id, x, y }))
  const mode = getCollectorDraftDispatchMode(draft)
  const pending = Math.max(0, Math.floor(Number(draft?.meta?.pendingRecoveryCount) || 0))
  const suggestedSaveName = hasDraft
    ? [
      mode === 'schedule' ? 'Agendar' : 'Enviar',
      (() => {
        const first = draftItems[0] || null
        const x = Number(first?.x)
        const y = Number(first?.y)
        return (Number.isFinite(x) && Number.isFinite(y)) ? `${x}|${y}` : ''
      })()
    ].filter(Boolean).join(' - ')
    : ''

  button.refresh?.({
    visible: hasDraft,
    label: hasDraft ? `Rascunho ${Math.max(0, Math.floor(Number(draft?.meta?.totalTargets) || draftItems.length))}` : 'Rascunho',
    title: hasDraft ? 'Últimos alvos salvos no planner.' : '',
    goTitle: hasDraft ? `Últimos alvos salvos (${mode === 'schedule' ? 'agendar' : 'enviar'})` : '',
    brandTooltip: true,
    pending: pending > 0,
    iconMode: mode,
    iconUri: mode === 'schedule' ? ICON_CALENDAR : ICON_CROSSED_SWORDS_CENTERED,
    iconFallbackUri: ICON_CROSSED_SWORDS_CENTERED || ICON_CALENDAR || '',
    iconAlt: mode === 'schedule' ? 'Rascunho de agendamento' : 'Rascunho de envio',
    actions: hasDraft ? [
      { id: 'open_saved', label: 'Abrir últimos alvos' },
      ...(currentTargets.length > 0 ? [{ id: 'merge_open', label: 'Mesclar e abrir' }] : []),
      { id: 'discard', label: 'Excluir', danger: true },
      {
        kind: 'input',
        inputKey: 'save_named_name',
        value: '',
        placeholder: 'Digite um nome',
        title: `Sugestão: ${suggestedSaveName || 'sem sugestão'}`
      },
      { id: 'save_named', label: 'Salvar na lista', primary: true }
    ] : []
  })
  return button
}

function collectorHasSavedDraftTargets() {
  const { draftItems } = getCollectorSavedDraftPayload()
  return draftItems.length > 1
}

function shouldConfirmOverwriteSavedDraftOnCollectorAction() {
  return collectorHasSavedDraftTargets() && state.selectedCoords.size > 1
}

function getCollectorOverwriteDraftMenu(view) {
  return view?.querySelector?.('[data-overwrite-draft-menu]') || null
}

function closeCollectorOverwriteDraftMenu(view = document.getElementById(VIEW_ID)) {
  const menu = getCollectorOverwriteDraftMenu(view)
  if (!menu) return
  menu.hidden = true
  menu.removeAttribute('data-mode')
  state.overwriteDraftMenuOpen = false
  state.overwriteDraftMenuMode = null
}

function openCollectorOverwriteDraftMenu(view, triggerBtn, mode = 'send') {
  const menu = getCollectorOverwriteDraftMenu(view)
  const footer = view?.querySelector?.('.go-mcv-footer')
  if (!menu || !footer || !triggerBtn) return

  menu.hidden = false
  menu.setAttribute('data-mode', mode === 'schedule' ? 'schedule' : 'send')
  state.overwriteDraftMenuOpen = true
  state.overwriteDraftMenuMode = menu.getAttribute('data-mode')

  const footerRect = footer.getBoundingClientRect()
  const btnRect = triggerBtn.getBoundingClientRect()
  const menuRect = menu.getBoundingClientRect()
  const gap = 4
  let left = Math.round((btnRect.right - footerRect.left) - menuRect.width)
  let top = Math.round((btnRect.bottom - footerRect.top) + gap)
  left = Math.max(0, Math.min(left, Math.max(0, Math.round(footerRect.width - menuRect.width))))
  top = Math.max(0, top)
  menu.style.left = `${left}px`
  menu.style.top = `${top}px`
}

function toggleCollectorOverwriteDraftMenu(view, triggerBtn, mode = 'send') {
  const nextMode = mode === 'schedule' ? 'schedule' : 'send'
  const menu = getCollectorOverwriteDraftMenu(view)
  if (!menu) return
  const isSameModeOpen = !menu.hidden && String(menu.getAttribute('data-mode') || '') === nextMode
  if (isSameModeOpen) {
    closeCollectorOverwriteDraftMenu(view)
    return
  }
  openCollectorOverwriteDraftMenu(view, triggerBtn, nextMode)
}

function stopAll(event) {
  if (!event) return
  event.preventDefault?.()
  event.stopPropagation?.()
  event.stopImmediatePropagation?.()
}

function selectedCoordsSnapshot() {
  return Array.from(state.selectedCoords.values())
}

function normalizeCoordStringToItem(coord, id = null) {
  const [xRaw, yRaw] = String(coord || '').split('|')
  const x = Number(xRaw)
  const y = Number(yRaw)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const numericId = Number(id)
  return {
    id: Number.isFinite(numericId) ? numericId : null,
    x,
    y
  }
}

function extractCoordItemsFromText(text = '') {
  const source = String(text || '')
  const regex = /\b(\d{1,3})\|(\d{1,3})\b/g
  const seen = new Set()
  const result = []
  let match = null

  while ((match = regex.exec(source))) {
    const x = Number(match[1])
    const y = Number(match[2])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    const key = `${x}|${y}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ x, y })
  }

  return result
}

function addCoordsListToSelection(coords = [], options = {}) {
  const list = Array.isArray(coords) ? coords : []
  const allowWithoutVillage = Boolean(options?.allowWithoutVillage)
  const beforeCount = state.selectedCoords.size
  let addedCount = 0
  let duplicatedCount = 0
  let skippedNoVillage = 0

  for (const coord of list) {
    const key = getCoordKey(coord)
    if (state.selectedCoords.has(key)) {
      duplicatedCount += 1
      continue
    }
    let item = toSelectedCoordItem(coord)
    if (!item && allowWithoutVillage) {
      const x = Number(coord?.x)
      const y = Number(coord?.y)
      if (Number.isFinite(x) && Number.isFinite(y)) {
        item = { id: null, x, y }
      }
    }
    if (!item) {
      skippedNoVillage += 1
      continue
    }
    state.selectedCoords.set(key, item)
    addedCount += 1
  }

  return {
    beforeCount,
    addedCount,
    duplicatedCount,
    skippedNoVillage,
    count: state.selectedCoords.size
  }
}

function getPlannerActionRequirements() {
  const gameData = getGameData()
  const premiumActive = Boolean(gameData?.features?.Premium?.active)
  const hasPlace = Number(gameData?.village?.buildings?.place || 0) > 0
  return { gameData, premiumActive, hasPlace }
}

function ensurePlannerActionRequirements() {
  const { gameData, premiumActive, hasPlace } = getPlannerActionRequirements()
  if (!premiumActive) {
    printMessage.error('É nescessário conta premium do TW ativa!', 3000)
    return null
  }
  if (!hasPlace) {
    printMessage.error('É preciso ter praça de reunião na vila!', 3000)
    return null
  }
  return gameData
}

async function buildOrderedTargetsForPlanner() {
  const gameData = ensurePlannerActionRequirements()
  if (!gameData) return null

  const targets = selectedCoordsSnapshot().map(({ id, x, y }) => ({ id, x, y }))
  if (!targets.length) {
    printMessage.error('Selecione ao menos uma coordenada.', 2500)
    return null
  }

  let based = []
  try {
    const groups = new Groups()
    const groupId = Number(gameData?.group_id || 0)
    const groupData = await groups.villagesInGroup(groupId)
    based = Array.isArray(groupData?.villages)
      ? groupData.villages
          .map((v) => normalizeCoordStringToItem(v?.coord, v?.id))
          .filter(Boolean)
      : []
  } catch (error) {
    console.error('[GO][MapCollector] groups.villagesInGroup error', error)
  }

  if (!based.length) {
    const currentVillage = {
      id: Number(gameData?.village?.id || 0) || null,
      x: Number(gameData?.village?.x),
      y: Number(gameData?.village?.y)
    }
    if (Number.isFinite(currentVillage.x) && Number.isFinite(currentVillage.y)) {
      based = [currentVillage]
    }
  }

  const orderedTargets = based.length
    ? orderCoordsFromCoords(targets, based)
    : targets

  const initialTarget = orderedTargets[0] || null
  if (!initialTarget) {
    printMessage.error('Não foi possível definir alvo inicial.', 2500)
    return null
  }

  return { gameData, orderedTargets, initialTarget, basedCount: based.length }
}

async function runPlannerActionFromCollector(dispatchMode) {
  const mode = dispatchMode === 'schedule' ? 'schedule' : 'send'
  const prepared = await buildOrderedTargetsForPlanner()
  if (!prepared) return

  const { orderedTargets, initialTarget, basedCount } = prepared
  const targetVillage = getVillageFromCoord(initialTarget)
  const playerIdRaw = Number(targetVillage?.owner)
  const playerId = Number.isFinite(playerIdRaw) ? playerIdRaw : null
  const root = state.sessionPayload?.root || null
  const token = state.sessionPayload?.token || null
  consoleDev({
    event: 'action',
    action: mode,
    basedCount,
    initialTarget,
    root: Boolean(root),
    token: Boolean(token),
    selectedCoordsCount: state.selectedCoords.size,
    selectedCoords: orderedTargets
  }, { label: '[GO][MapCollector]' })

  closeSelectorView({ showLauncher: false })
  const plannerOneToMany = await loadPlannerOneToMany()
  await plannerOneToMany({
    ...initialTarget,
    playerId,
    target: initialTarget,
    targets: orderedTargets,
    dispatchMode: mode,
    mode,
    root,
    token
  })
}

function scheduleMarkersRender() {
  if (state.scheduledMarkersRenderRaf) return
  state.scheduledMarkersRenderRaf = window.requestAnimationFrame(() => {
    state.scheduledMarkersRenderRaf = 0
    const view = document.getElementById(VIEW_ID)
    if (!view || !view.classList.contains('is-open')) return
    renderSelectedMarkers()
  })
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${VIEW_ID}{
      position: fixed;
      left: 50%;
      top: calc(50% + 28px);
      transform: translateX(-50%);
      z-index: 1000001;
      display: none;
      min-width: 200px;
      padding: 5px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,.35);
      background: rgba(20, 20, 20, .90);
      box-shadow: 0 4px 12px rgba(0,0,0,.35);
      color: #f3f4f6;
      font-family: Arial, sans-serif;
    }
    #${VIEW_ID}.is-open{
      display: block;
    }
    #${VIEW_ID} .go-mcv-title{
      display: block;
      margin: 0;
      font-size: 11px;
      font-weight: 700;
      color: #e5e7eb;
    }
    #${VIEW_ID} .go-mcv-header{
      display: flex;
      align-items: center;
      gap: 4px;
      margin: 0 20px 4px 0;
      min-height: 18px;
      cursor: move;
      user-select: none;
      -webkit-user-select: none;
    }
    #${VIEW_ID}.is-dragging .go-mcv-header{
      cursor: grabbing;
    }
    #${VIEW_ID} .go-mcv-bot-icon{
      width: 18px;
      height: 18px;
      display: block;
      border-radius: 999px;
      object-fit: contain;
      flex: 0 0 auto;
    }
    #${VIEW_ID} .go-mcv-close{
      position: absolute;
      top: 6px;
      right: 6px;
      width: 20px;
      height: 20px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.25);
      background: rgba(255,255,255,.06);
      color: #f3f4f6;
      font-size: 13px;
      line-height: 1;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }
    #${VIEW_ID} .go-mcv-close:hover{
      background: rgba(255,255,255,.12);
    }
    #${VIEW_ID} .go-mcv-actions{
      display: flex;
      gap: 6px;
      margin-bottom: 4px;
    }
    #${VIEW_ID} .go-mcv-btn{
      width: 30px;
      height: 24px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,.28);
      background: rgba(255,255,255,.06);
      color: #f3f4f6;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      cursor: pointer;
    }
    #${VIEW_ID} .go-mcv-btn img{
      width: 15px;
      height: 15px;
      display: block;
      pointer-events: none;
    }
    #${VIEW_ID} .go-mcv-btn:hover{
      background: rgba(255,255,255,.12);
    }
    #${VIEW_ID} .go-mcv-btn.is-active{
      background: rgba(37, 99, 235, .75);
      border-color: rgba(191, 219, 254, .85);
    }
    #${VIEW_ID} .go-mcv-status{
      margin: 0 0 6px;
      font-size: 10px;
      color: #d1d5db;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    #${VIEW_ID} .go-mcv-status-label{
      opacity: .92;
    }
    #${VIEW_ID} .go-mcv-count-badge{
      min-width: 18px;
      height: 16px;
      padding: 0 5px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.25);
      background: rgba(255,255,255,.10);
      color: #fff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
      line-height: 1;
    }
    #${VIEW_ID} .go-mcv-spacer{
      flex: 1 1 auto;
    }
    #${VIEW_ID} .go-mcv-mini-btn{
      width: 22px;
      height: 22px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,.24);
      background: rgba(255,255,255,.05);
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    #${VIEW_ID} .go-mcv-mini-btn:hover{
      background: rgba(255,255,255,.11);
    }
    #${VIEW_ID} .go-mcv-mini-btn:disabled{
      opacity: .45;
      cursor: not-allowed;
    }
    #${VIEW_ID} .go-mcv-mini-btn img{
      width: 14px;
      height: 14px;
      display: block;
      pointer-events: none;
    }
    #${VIEW_ID} .go-mcv-footer{
      position: relative;
      display: block;
      overflow: visible;
    }
    #${VIEW_ID} .go-planner-action-buttons.go-mcv-go-buttons{
      position: static;
      top: auto;
      right: auto;
      z-index: auto;
      display: inline-flex;
    }
    #${VIEW_ID} .go-planner-action-buttons.go-mcv-go-buttons .go-btn-inline:disabled{
      opacity: .45;
      cursor: not-allowed;
      transform: none;
      filter: none;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, .9), 0 1px 2px rgba(0, 0, 0, .2);
    }
    #${VIEW_ID} .go-mcv-overwrite-draft-menu{
      position: absolute;
      left: 0;
      top: 0;
      z-index: 1000004;
      min-width: 0;
      width: max-content;
      max-width: min(260px, calc(100vw - 32px));
      padding: 6px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,.22);
      background: rgba(22,22,22,.96);
      box-shadow: 0 10px 26px rgba(0,0,0,.34);
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    #${VIEW_ID} .go-mcv-overwrite-draft-menu[hidden]{
      display: none !important;
    }
    #${VIEW_ID} .go-mcv-overwrite-draft-text{
      color: #f3f4f6;
      font-size: 11px;
      line-height: 1.25;
      white-space: normal;
      max-width: 230px;
    }
    #${VIEW_ID} .go-mcv-overwrite-draft-actions{
      display: flex;
      justify-content: flex-end;
      gap: 4px;
    }
    #${VIEW_ID} .go-mcv-overwrite-draft-actions button{
      border: 1px solid rgba(255,255,255,.22);
      border-radius: 6px;
      background: rgba(255,255,255,.07);
      color: #f9fafb;
      padding: 4px 7px;
      font-size: 11px;
      font-weight: 600;
      line-height: 1;
      cursor: pointer;
      white-space: nowrap;
    }
    #${VIEW_ID} .go-mcv-overwrite-draft-actions button:hover{
      background: rgba(255,255,255,.13);
    }
    #${MARKERS_ID}{
      position: absolute;
      left: 0;
      top: 0;
      width: 0;
      height: 0;
      overflow: visible;
      z-index: 1000000;
      pointer-events: none;
      display: none;
    }
    #${MARKERS_ID}.is-open{
      display: block;
    }
    #${MARKERS_ID} .go-mcv-marker{
      position: absolute;
      width: 49px;
      height: 32px;
      border-radius: 999px;
      background:
        radial-gradient(ellipse at center,
          rgba(255,255,255,.28) 0%,
          rgba(255,255,255,.28) 52%,
          rgba(255,255,255,.20) 70%,
          rgba(255,255,255,.10) 84%,
          rgba(255,255,255,0) 100%),
        radial-gradient(ellipse at 50% 42%,
          rgba(255,255,255,.16) 0%,
          rgba(255,255,255,.10) 38%,
          rgba(255,255,255,0) 72%);
      filter: blur(.45px);
      transform: translate(-50%, -50%);
      opacity: .95;
    }
    #${MARKERS_ID} .go-mcv-marker.go-mcv-marker-area-start{
      width: 46px;
      height: 29px;
      box-sizing: border-box;
      background: none;
      border: 3px solid rgba(255,255,255,.78);
      box-shadow: 0 0 0 1px rgba(15, 15, 15, .30);
      filter: none;
      opacity: 1;
    }
    #${AREA_HINT_ID}{
      position: fixed;
      left: 0;
      top: 0;
      z-index: 1000002;
      display: none;
      padding: 4px 7px;
      border-radius: 5px;
      border: 1px solid rgba(255,255,255,.22);
      background: rgba(20, 20, 20, .88);
      color: #f3f4f6;
      font-family: Arial, sans-serif;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.1;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 2px 8px rgba(0,0,0,.28);
      transform: translate(12px, 12px);
    }
    #${AREA_HINT_ID}.is-open{
      display: block;
    }
  `
  document.head.appendChild(style)
}

function setLauncherVisible(visible) {
  const launcher = document.getElementById('go-map-collector-launcher')
  if (!launcher) return
  launcher.style.display = visible ? 'block' : 'none'
}

function isElementVisibleRect(el) {
  if (!el) return null
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden') return null
  const rect = el.getBoundingClientRect()
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  return rect
}

function rectIntersectionArea(a, b) {
  if (!a || !b) return 0
  const left = Math.max(a.left, b.left)
  const top = Math.max(a.top, b.top)
  const right = Math.min(a.right, b.right)
  const bottom = Math.min(a.bottom, b.bottom)
  if (right <= left || bottom <= top) return 0
  return (right - left) * (bottom - top)
}

function getSelectorPopupObstacleRects(view) {
  const rects = []
  const ctxRect = isElementVisibleRect(document.getElementById('map-ctx-buttons'))
  if (ctxRect) rects.push(ctxRect)

  // Popup nativo do TW (info da aldeia / outros painéis)
  const twPopupContent = document.querySelector('.popup_box_content')
  if (twPopupContent && !view.contains(twPopupContent)) {
    const popupRect = isElementVisibleRect(twPopupContent.closest('.popup_box') || twPopupContent)
    if (popupRect) rects.push(popupRect)
  }
  return rects
}

function positionSelectorView(view) {
  if (!view?.classList?.contains('is-open')) return
  if (state.viewDragged) return

  const launcher = document.getElementById('go-map-collector-launcher')
  const launcherRect = isElementVisibleRect(launcher)
  if (!launcherRect) {
    view.style.left = '50%'
    view.style.top = 'calc(50% + 28px)'
    view.style.transform = 'translateX(-50%)'
    return
  }

  const margin = 8
  const gap = 10
  const viewRect = view.getBoundingClientRect()
  const width = Math.round(viewRect.width)
  const height = Math.round(viewRect.height)
  if (!width || !height) return

  const obstacles = getSelectorPopupObstacleRects(view)

  const candidates = [
    { left: launcherRect.left - 8, top: launcherRect.bottom + gap }, // abaixo à esquerda
    { left: launcherRect.right - width + 8, top: launcherRect.bottom + gap }, // abaixo à direita
    { left: launcherRect.left - 8, top: launcherRect.top - height - gap }, // acima à esquerda
    { left: launcherRect.right - width + 8, top: launcherRect.top - height - gap }, // acima à direita
    { left: launcherRect.right + gap, top: launcherRect.top - (height - launcherRect.height) / 2 }, // direita
    { left: launcherRect.left - width - gap, top: launcherRect.top - (height - launcherRect.height) / 2 } // esquerda
  ]

  let best = null
  for (const candidate of candidates) {
    let left = candidate.left
    let top = candidate.top

    const overflowLeft = Math.max(0, margin - left)
    const overflowTop = Math.max(0, margin - top)
    const overflowRight = Math.max(0, (left + width) - (window.innerWidth - margin))
    const overflowBottom = Math.max(0, (top + height) - (window.innerHeight - margin))
    const overflowPenalty = (overflowLeft + overflowTop + overflowRight + overflowBottom) * 50

    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
    top = Math.max(margin, Math.min(top, window.innerHeight - height - margin))

    const rect = {
      left,
      top,
      right: left + width,
      bottom: top + height
    }

    const overlapPenalty = obstacles.reduce((sum, obstacle) => sum + rectIntersectionArea(rect, obstacle), 0) * 0.2
    const distancePenalty =
      Math.abs((left + width / 2) - (launcherRect.left + launcherRect.width / 2)) * 0.3 +
      Math.abs((top + height / 2) - (launcherRect.top + launcherRect.height / 2)) * 0.2

    const score = overflowPenalty + overlapPenalty + distancePenalty
    if (!best || score < best.score) best = { left, top, score }
  }

  if (!best) return
  view.style.left = `${Math.round(best.left)}px`
  view.style.top = `${Math.round(best.top)}px`
  view.style.transform = 'none'
}

function bindViewPositioningOnce() {
  if (state.viewPositionBound) return
  state.viewPositionBound = true
  window.addEventListener('resize', () => {
    const view = document.getElementById(VIEW_ID)
    if (!view || !view.classList.contains('is-open')) return
    positionSelectorView(view)
  })
}

function getOrCreateMarkersLayer() {
  const host = getMarkersHostElement()
  if (!host) return null
  let layer = document.getElementById(MARKERS_ID)
  if (layer && layer.parentElement !== host) {
    layer.remove()
    layer = null
  }
  if (layer) return layer

  const hostStyle = window.getComputedStyle(host)
  if (hostStyle.position === 'static') {
    host.style.position = 'relative'
  }

  layer = document.createElement('div')
  layer.id = MARKERS_ID
  host.appendChild(layer)
  return layer
}

function setMarkersVisible(visible) {
  const layer = getOrCreateMarkersLayer()
  if (!layer) return
  layer.classList.toggle('is-open', !!visible)
}

function getOrCreateAreaHint() {
  let el = document.getElementById(AREA_HINT_ID)
  if (el) return el
  el = document.createElement('div')
  el.id = AREA_HINT_ID
  document.body.appendChild(el)
  return el
}

function hideAreaHint() {
  const el = document.getElementById(AREA_HINT_ID)
  if (!el) return
  el.classList.remove('is-open')
}

function syncAreaHintText() {
  const view = document.getElementById(VIEW_ID)
  if (!view || !view.classList.contains('is-open')) {
    hideAreaHint()
    return
  }
  const mode = view.dataset.mode || state.lastMode || 'area'
  if (mode !== 'area') {
    hideAreaHint()
    return
  }
  const el = getOrCreateAreaHint()
  el.textContent = state.areaStartCoord
    ? 'Área: click na 2a coord'
    : 'Área: click na 1a coord'
}

function moveAreaHint(event) {
  const view = document.getElementById(VIEW_ID)
  if (!view || !view.classList.contains('is-open')) return hideAreaHint()
  const mode = view.dataset.mode || state.lastMode || 'area'
  if (mode !== 'area') return hideAreaHint()
  if (event?.target?.closest?.(`#${VIEW_ID}, #go-map-collector-launcher`)) return hideAreaHint()
  if (!isEventInsideMap(event)) return hideAreaHint()

  const el = getOrCreateAreaHint()
  syncAreaHintText()
  el.style.left = `${Math.round(event.clientX)}px`
  el.style.top = `${Math.round(event.clientY)}px`
  el.classList.add('is-open')
}

function bindAreaHintPointerMoveOnce() {
  if (state.areaHintBound) return
  state.areaHintBound = true
  document.addEventListener('pointermove', moveAreaHint, true)
}

function getMarkersHostElement() {
  return document.getElementById('map_container') || document.getElementById('map_big') || getMapGeometryElement()
}

function bindMapObserversOnce() {
  if (state.mapObserversBound) return
  state.mapObserversBound = true

  const bindMapContainerObserver = () => {
    const mapContainerEl = document.getElementById('map_container')
    if (state.observedMapContainerEl === mapContainerEl) return

    state.mapContainerObserver?.disconnect()
    state.mapContainerObserver = null
    state.observedMapContainerEl = mapContainerEl || null

    if (!mapContainerEl) return
    try {
      const mo = new MutationObserver(() => {
        // TW recria/adiciona chunks quando navega mais longe no mapa.
        scheduleMarkersRender()
      })
      mo.observe(mapContainerEl, {
        childList: true,
        subtree: false,
        attributes: true,
        attributeFilter: ['style']
      })
      state.mapContainerObserver = mo
    } catch (_) {}
  }

  bindMapContainerObserver()

  const mapRootEl = document.getElementById('map')
  if (!mapRootEl) return

  try {
    const mo = new MutationObserver(() => {
      bindMapContainerObserver()
      scheduleMarkersRender()
    })
    mo.observe(mapRootEl, {
      childList: true,
      subtree: false
    })
    state.mapRootObserver = mo
  } catch (_) {}
}

function closeSelectorView(options = {}) {
  const showLauncher = options.showLauncher !== false
  const view = document.getElementById(VIEW_ID)
  if (!view) return
  if (state.collectorPopup?.root?.() === view && view.classList.contains('is-open')) {
    state.collectorPopup.close?.({ notify: false })
  } else {
    view.classList.remove('is-open')
  }
  view.classList.remove('is-dragging')
  closeCollectorOverwriteDraftMenu(view)
  state.areaStartCoord = null
  state.viewDragSession = null
  updateViewStatus(view)
  setMarkersVisible(false)
  hideAreaHint()
  setLauncherVisible(showLauncher)
  consoleDev({
    event: 'close',
    selectedCoordsCount: state.selectedCoords.size,
    selectedCoords: selectedCoordsSnapshot()
  }, { label: '[GO][MapCollector]' })
}

function setActiveMode(view, mode) {
  const buttons = view.querySelectorAll('[data-mode]')
  buttons.forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-mode') === mode)
  })
  view.dataset.mode = mode
  state.lastMode = mode
}

function updateActionsState(view) {
  closeCollectorOverwriteDraftMenu(view)
  const hasCoords = state.selectedCoords.size > 0
  const sendBtn = view.querySelector('[data-action="send"]')
  const scheduleBtn = view.querySelector('[data-action="schedule"]')
  const clearBtn = view.querySelector('[data-collector-clear]')
  if (sendBtn) sendBtn.disabled = !hasCoords
  if (scheduleBtn) scheduleBtn.disabled = !hasCoords
  if (clearBtn) clearBtn.disabled = !hasCoords
}

function updateViewStatus(view) {
  if (!view) return
  if (state.collectorPopup?.root?.() === view) {
    state.collectorPopup.setCount?.(state.selectedCoords.size)
  }
  const statusEl = view.querySelector('[data-status]')
  if (statusEl) {
    const countEl = statusEl.querySelector('[data-count]')
    if (countEl) {
      countEl.textContent = String(state.selectedCoords.size)
    } else {
      statusEl.textContent = `selecionadas: ${state.selectedCoords.size}`
    }
  }
  syncCollectorTargetsDraftButton(view)
}

function getMapVisibleElement() {
  return document.getElementById('map') || document.querySelector('#map_container')
}

function getMapGeometryElement() {
  return document.getElementById('map') || document.getElementById('map_big') || document.querySelector('#map_container')
}

function isEventInsideMap(event) {
  const mapEl = getMapVisibleElement()
  if (!mapEl) return false
  const rect = mapEl.getBoundingClientRect()
  const x = Number(event?.clientX)
  const y = Number(event?.clientY)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function buildVisibleCoordPixelIndex() {
  const TWMap = window.TWMap
  const map = TWMap?.map
  const size = TWMap?.size
  const tileSize = TWMap?.tileSize
  const pos = map?.pos
  const coordByPixel = map?.coordByPixel
  if (!Array.isArray(size) || !Array.isArray(tileSize) || !pos || typeof coordByPixel !== 'function') return null

  const cols = Number(size[0] || 0)
  const rows = Number(size[1] || 0)
  const tileW = Number(tileSize[0] || 0)
  const tileH = Number(tileSize[1] || 0)
  const posX = Number(pos[0])
  const posY = Number(pos[1])
  if (!cols || !rows || !tileW || !tileH || !Number.isFinite(posX) || !Number.isFinite(posY)) return null

  const index = new Map()
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const worldX = posX + (tileW * col)
      const worldY = posY + (tileH * row)
      const sampleX = Math.floor(worldX + (tileW / 2))
      const sampleY = Math.floor(worldY + (tileH / 2))
      let coord = null
      try {
        coord = map.coordByPixel(sampleX, sampleY)
      } catch (_) {
        return null
      }
      const x = Array.isArray(coord) ? Number(coord[0]) : NaN
      const y = Array.isArray(coord) ? Number(coord[1]) : NaN
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      index.set(`${x}|${y}`, {
        left: col * tileW,
        top: row * tileH,
        tileW,
        tileH
      })
    }
  }
  return index
}

function getCoordFromMapClick(event) {
  const mapEl = getMapGeometryElement()
  if (!mapEl) return null

  const rect = mapEl.getBoundingClientRect()
  const localX = Math.floor(event.clientX - rect.left)
  const localY = Math.floor(event.clientY - rect.top)
  if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) return null

  const TWMap = window.TWMap
  const map = TWMap?.map
  const pos = map?.pos
  const coordByPixel = map?.coordByPixel
  if (typeof coordByPixel !== 'function' || !pos) return null

  const worldX = Math.floor(Number(pos[0]) + localX)
  const worldY = Math.floor(Number(pos[1]) + localY)
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return null

  try {
    const coord = map.coordByPixel(worldX, worldY)
    const x = Array.isArray(coord) ? Number(coord[0]) : NaN
    const y = Array.isArray(coord) ? Number(coord[1]) : NaN
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x, y, localX, localY, worldX, worldY }
  } catch (error) {
    return null
  }
}

function getCoordKey(coord) {
  return `${coord.x}|${coord.y}`
}

function getVillageIdFromCoord(coord) {
  const village = getVillageFromCoord(coord)
  if (!village) return null
  const id = Number(village?.id)
  return Number.isFinite(id) ? id : null
}

function getVillageFromCoord(coord) {
  const villages = window.TWMap?.villages
  if (!villages) return null
  return villages[String(coord.x) + String(coord.y)] || null
}

function toSelectedCoordItem(coord) {
  const id = getVillageIdFromCoord(coord)
  if (!Number.isFinite(id)) return null
  const maybeWorldX = Number(coord?.worldX)
  const maybeWorldY = Number(coord?.worldY)
  const item = {
    id,
    x: Number(coord.x),
    y: Number(coord.y)
  }
  if (Number.isFinite(maybeWorldX) && Number.isFinite(maybeWorldY)) {
    item.worldX = maybeWorldX
    item.worldY = maybeWorldY
  }
  return item
}

function toggleCoord(coord) {
  const key = getCoordKey(coord)
  if (state.selectedCoords.has(key)) {
    const item = state.selectedCoords.get(key)
    state.selectedCoords.delete(key)
    return { added: false, item }
  }
  const item = toSelectedCoordItem(coord)
  if (!item) {
    return { added: false, item: null, ignored: 'no-village' }
  }
  state.selectedCoords.set(key, item)
  return { added: true, item }
}

function addAreaCoords(a, b) {
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxY = Math.max(a.y, b.y)
  let added = 0
  let removed = 0
  let skippedNoVillage = 0
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const result = toggleCoord({ x, y })
      if (result.ignored === 'no-village') {
        skippedNoVillage++
        continue
      }
      if (result.added) added++
      else removed++
    }
  }
  return { added, removed, skippedNoVillage, minX, maxX, minY, maxY }
}

function renderSelectedMarkers() {
  const view = document.getElementById(VIEW_ID)
  const layer = getOrCreateMarkersLayer()
  if (!layer) return
  if (!view?.classList.contains('is-open')) {
    layer.classList.remove('is-open')
    return
  }

  // Estado (mundo): state.selectedCoords persiste independente do viewport.
  // Render (viewport): aqui só projetamos o estado atual para a área visível.
  const projection = getVisibleSelectedCoordsProjection()
  renderSelectedMarkersProjection(layer, projection)
  layer.classList.add('is-open')
}

function getVisibleSelectedCoordsProjection() {
  const visibleMarkers = []
  state.selectedCoords.forEach((item) => {
    const markerPixel = getMarkerPixelForCoord(item)
    if (!markerPixel) return // continua no estado; só não está visível agora
    visibleMarkers.push({
      coordKey: `${item.x}|${item.y}`,
      markerPixel
    })
  })

  const view = document.getElementById(VIEW_ID)
  const mode = view?.dataset?.mode || 'click'
  let areaStartMarker = null
  if (mode === 'area' && state.areaStartCoord) {
    const markerPixel = getMarkerPixelForAnyCoord(state.areaStartCoord)
    if (markerPixel) {
      areaStartMarker = {
        coordKey: `${state.areaStartCoord.x}|${state.areaStartCoord.y}`,
        markerPixel
      }
    }
  }

  return {
    totalSelected: state.selectedCoords.size,
    visibleCount: visibleMarkers.length,
    markers: visibleMarkers,
    areaStartMarker
  }
}

function renderSelectedMarkersProjection(layer, projection) {
  const frag = document.createDocumentFragment()
  projection.markers.forEach(({ coordKey, markerPixel }) => {
    const marker = document.createElement('span')
    marker.className = 'go-mcv-marker'
    marker.style.left = `${markerPixel.left}px`
    marker.style.top = `${markerPixel.top}px`
    marker.setAttribute('data-coord', coordKey)
    frag.appendChild(marker)
  })

  if (projection.areaStartMarker) {
    const marker = document.createElement('span')
    marker.className = 'go-mcv-marker go-mcv-marker-area-start'
    marker.style.left = `${projection.areaStartMarker.markerPixel.left}px`
    marker.style.top = `${projection.areaStartMarker.markerPixel.top}px`
    marker.setAttribute('data-coord', projection.areaStartMarker.coordKey)
    frag.appendChild(marker)
  }
  layer.replaceChildren(frag)
}

function getMarkerPixelForCoord(coord) {
  if (!Number.isFinite(Number(coord?.id))) return null
  const hostEl = getMarkersHostElement()
  if (!hostEl) return null

  const byVillageDom = getMarkerPixelForCoordFromVillageDom(coord, hostEl)
  if (byVillageDom) return byVillageDom

  const viewportEl = getMapGeometryElement()
  if (!viewportEl) return null
  const viewportRect = viewportEl.getBoundingClientRect()
  const hostRect = hostEl.getBoundingClientRect()
  const viewportOffsetLeft = Math.round(viewportRect.left - hostRect.left)
  const viewportOffsetTop = Math.round(viewportRect.top - hostRect.top)

  const mapPos = Array.isArray(window.TWMap?.map?.pos)
    ? [Number(window.TWMap.map.pos[0]), Number(window.TWMap.map.pos[1])]
    : null
  const hasWorldAnchor =
    Number.isFinite(Number(coord?.worldX)) &&
    Number.isFinite(Number(coord?.worldY)) &&
    Array.isArray(mapPos) &&
    Number.isFinite(mapPos[0]) &&
    Number.isFinite(mapPos[1])

  if (hasWorldAnchor) {
    const localLeft = Math.round(Number(coord.worldX) - mapPos[0])
    const localTop = Math.round(Number(coord.worldY) - mapPos[1])
    return {
      key: `${coord.x}|${coord.y}`,
      left: viewportOffsetLeft + localLeft,
      top: viewportOffsetTop + localTop
    }
  }

  const visibleIndex = buildVisibleCoordPixelIndex()
  if (!visibleIndex) return null
  const key = `${coord.x}|${coord.y}`
  const pos = visibleIndex.get(key)
  if (!pos) return null
  return {
    key,
    left: viewportOffsetLeft + Math.round(pos.left + (pos.tileW / 2)),
    top: viewportOffsetTop + Math.round(pos.top + (pos.tileH / 2))
  }
}

function getMarkerPixelForAnyCoord(coord) {
  const resolvedVillageId = getVillageIdFromCoord(coord)
  const item = coord && Number.isFinite(Number(coord.id))
    ? coord
    : (() => {
        const next = {
          id: Number.isFinite(Number(resolvedVillageId)) ? Number(resolvedVillageId) : null,
          x: Number(coord?.x),
          y: Number(coord?.y)
        }
        if (
          Number.isFinite(Number(coord?.worldX)) &&
          Number.isFinite(Number(coord?.worldY))
        ) {
          next.worldX = Number(coord.worldX)
          next.worldY = Number(coord.worldY)
        }
        return next
      })()

  if (Number.isFinite(Number(item.id))) {
    const byVillage = getMarkerPixelForCoord(item)
    if (byVillage) return byVillage
  }

  const hostEl = getMarkersHostElement()
  const viewportEl = getMapGeometryElement()
  if (!hostEl || !viewportEl) return null
  const viewportRect = viewportEl.getBoundingClientRect()
  const hostRect = hostEl.getBoundingClientRect()
  const viewportOffsetLeft = Math.round(viewportRect.left - hostRect.left)
  const viewportOffsetTop = Math.round(viewportRect.top - hostRect.top)

  const mapPos = Array.isArray(window.TWMap?.map?.pos)
    ? [Number(window.TWMap.map.pos[0]), Number(window.TWMap.map.pos[1])]
    : null
  const hasWorldAnchor =
    Number.isFinite(Number(item?.worldX)) &&
    Number.isFinite(Number(item?.worldY)) &&
    Array.isArray(mapPos) &&
    Number.isFinite(mapPos[0]) &&
    Number.isFinite(mapPos[1])

  if (hasWorldAnchor) {
    const localLeft = Math.round(Number(item.worldX) - mapPos[0])
    const localTop = Math.round(Number(item.worldY) - mapPos[1])
    return {
      key: `${item.x}|${item.y}`,
      left: viewportOffsetLeft + localLeft,
      top: viewportOffsetTop + localTop
    }
  }

  const visibleIndex = buildVisibleCoordPixelIndex()
  if (!visibleIndex) return null
  const key = `${item.x}|${item.y}`
  const pos = visibleIndex.get(key)
  if (!pos) return null
  return {
    key,
    left: viewportOffsetLeft + Math.round(pos.left + (pos.tileW / 2)),
    top: viewportOffsetTop + Math.round(pos.top + (pos.tileH / 2))
  }
}

function getMarkerPixelForCoordFromVillageDom(coord, hostEl) {
  const id = Number(coord?.id)
  if (!Number.isFinite(id)) return null
  const villageEl = document.getElementById(`map_village_${id}`)
  if (!villageEl) return null
  const chunkEl = villageEl.parentElement
  if (!(chunkEl instanceof HTMLElement)) return null

  const villageLeft = Number.parseFloat(villageEl.style.left || '0')
  const villageTop = Number.parseFloat(villageEl.style.top || '0')
  const chunkLeft = Number.parseFloat(chunkEl.style.left || '0')
  const chunkTop = Number.parseFloat(chunkEl.style.top || '0')
  const villageW = Number.parseFloat(villageEl.style.width || '') || villageEl.width || 53
  const villageH = Number.parseFloat(villageEl.style.height || '') || villageEl.height || 38
  if (
    !Number.isFinite(villageLeft) ||
    !Number.isFinite(villageTop) ||
    !Number.isFinite(chunkLeft) ||
    !Number.isFinite(chunkTop)
  ) return null

  return {
    key: `${coord.x}|${coord.y}`,
    left: Math.round(chunkLeft + villageLeft + (villageW / 2)),
    top: Math.round(chunkTop + villageTop + (villageH / 2)),
    width: Math.round(villageW),
    height: Math.round(villageH)
  }
}

function handleClickModeCoord(view, coord) {
  state.areaStartCoord = null
  hideAreaHint()
  const result = toggleCoord(coord)
  if (result.ignored === 'no-village') {
    consoleDev({
      event: 'click:skip-no-village',
      coord: { x: coord.x, y: coord.y },
      selectedCoordsCount: state.selectedCoords.size,
      selectedCoords: selectedCoordsSnapshot()
    }, { label: '[GO][MapCollector]' })
    updateActionsState(view)
    updateViewStatus(view)
    return
  }
  consoleDev({
    event: 'click',
    coord: result.item,
    action: result.added ? 'add' : 'remove',
    selectedCoordsCount: state.selectedCoords.size,
    selectedCoords: selectedCoordsSnapshot()
  }, { label: '[GO][MapCollector]' })
  updateActionsState(view)
  updateViewStatus(view)
  renderSelectedMarkers()
}

function bindMapClickCollectorOnce() {
  if (state.mapClickBound) return
  state.mapClickBound = true

  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    const view = document.getElementById(VIEW_ID)
    if (!view || !view.classList.contains('is-open')) return
    if (event.target?.closest?.(`#${VIEW_ID}, #go-map-collector-launcher`)) return
    if (!isEventInsideMap(event)) return

    // Intercepta cedo para o TW não abrir o contexto da vila.
    stopAll(event)

    const coord = getCoordFromMapClick(event)
    if (!coord) return

    const mode = view.dataset.mode || state.lastMode || 'area'
    if (mode === 'area') {
      if (!getVillageFromCoord(coord)) {
        consoleDev({
          event: 'area:skip-no-village',
          coord: { x: coord.x, y: coord.y },
          waitingSecondCoord: Boolean(state.areaStartCoord),
          selectedCoordsCount: state.selectedCoords.size,
          selectedCoords: selectedCoordsSnapshot()
        }, { label: '[GO][MapCollector]' })
        return
      }

      if (!state.areaStartCoord) {
        state.areaStartCoord = coord
        syncAreaHintText()
        consoleDev({
          event: 'area:start',
          coord,
          selectedCoordsCount: state.selectedCoords.size,
          selectedCoords: selectedCoordsSnapshot()
        }, { label: '[GO][MapCollector]' })
      } else {
        const start = state.areaStartCoord
        const result = addAreaCoords(start, coord)
        state.areaStartCoord = null
        syncAreaHintText()
        consoleDev({
          event: 'area:apply',
          start,
          end: coord,
          ...result,
          selectedCoordsCount: state.selectedCoords.size,
          selectedCoords: selectedCoordsSnapshot()
        }, { label: '[GO][MapCollector]' })
      }
      updateActionsState(view)
      updateViewStatus(view)
      renderSelectedMarkers()
    } else {
      handleClickModeCoord(view, coord)
    }
  }, true)

  // Alguns fluxos do TW ainda reagem no click após o pointerdown.
  document.addEventListener('click', (event) => {
    const view = document.getElementById(VIEW_ID)
    if (!view || !view.classList.contains('is-open')) return
    if (event.target?.closest?.(`#${VIEW_ID}, #go-map-collector-launcher`)) return
    if (!isEventInsideMap(event)) return
    stopAll(event)
  }, true)

  bindAreaHintPointerMoveOnce()
}

function createView() {
  const popup = createCollectorBasePopup({
    title: 'Coletor Master',
    statusLabel: 'selecionadas:',
    count: state.selectedCoords.size,
    onClose: () => closeSelectorView(),
    onClear: () => {
      const view = document.getElementById(VIEW_ID)
      if (view) closeCollectorOverwriteDraftMenu(view)
      if (state.selectedCoords.size > 0) {
        state.selectedCoords.clear()
        state.areaStartCoord = null
        if (view) {
          updateActionsState(view)
          updateViewStatus(view)
        }
        renderSelectedMarkers()
        syncAreaHintText()
      }
      consoleDev({
        event: 'clear',
        selectedCoordsCount: state.selectedCoords.size,
        selectedCoords: selectedCoordsSnapshot()
      }, { label: '[GO][MapCollector]' })
      return state.selectedCoords.size
    },
    onPaste: async () => {
      let clipboardText = ''
      let clipboardReadOk = false
      let usedFallbackPrompt = false

      try {
        clipboardText = await navigator?.clipboard?.readText?.()
        clipboardReadOk = true
      } catch (_) {
        clipboardReadOk = false
      }

      if (!clipboardReadOk) {
        const manualText = window.prompt?.('Cole aqui o texto com coordenadas:', '') ?? ''
        clipboardText = String(manualText || '')
        usedFallbackPrompt = true
      }

      const parsedCoords = extractCoordItemsFromText(clipboardText)
      const result = addCoordsListToSelection(parsedCoords, { allowWithoutVillage: true })
      const view = document.getElementById(VIEW_ID)
      if (view) {
        closeCollectorOverwriteDraftMenu(view)
        updateActionsState(view)
        updateViewStatus(view)
      }
      renderSelectedMarkers()
      syncAreaHintText()

      consoleDev({
        event: 'paste',
        ...result,
        parsedCount: parsedCoords.length,
        clipboardReadOk,
        usedFallbackPrompt
      }, { label: '[GO][MapCollector]' })

      if (parsedCoords.length === 0) {
        printMessage.warn('Nenhuma coordenada válida encontrada no texto.', 2500)
      } else {
        printMessage.warn(
          `Coletor: +${result.addedCount} coordenada(s) | repetidas: ${result.duplicatedCount} | inválidas/no-village: ${result.skippedNoVillage} | total: ${result.count}`,
          3000
        )
      }

      return result.count
    }
  })
  const wrap = popup?.root?.()
  if (!wrap) return document.createElement('div')

  state.collectorPopup = popup
  wrap.id = VIEW_ID
  wrap.dataset.mode = state.lastMode || 'area'

  const botIcon = wrap.querySelector('[data-collector-bot-icon]')
  if (botIcon) {
    botIcon.setAttribute('data-go-title', 'BOT')
    botIcon.setAttribute('data-go-brand-tooltip', '1')
  }

  const toolbarEl = popup.toolbar?.()
  if (toolbarEl) {
    toolbarEl.classList.add('go-mcv-actions')
    toolbarEl.innerHTML = `
      <button
        type="button"
        class="go-mcv-btn"
        data-mode="area"
        data-go-title="Selecione ou desmarque coords de uma área em 2 clicks"
        aria-label="Modo área"
      ><img src="${ICON_MODE_AREA}" alt=""></button>
      <button
        type="button"
        class="go-mcv-btn"
        data-mode="click"
        data-go-title="Selecione ou desmarque coords com 1 click"
        aria-label="Modo mouse"
      ><img src="${ICON_MODE_MOUSE}" alt=""></button>
    `
  }

  const footerEl = popup.footer?.()
  if (footerEl) {
    footerEl.innerHTML = `
      <div class="go-mcv-footer">
        <div class="go-planner-action-buttons go-mcv-go-buttons" data-go-buttons></div>
        <div class="go-mcv-overwrite-draft-menu" data-overwrite-draft-menu hidden>
          <div class="go-mcv-overwrite-draft-text">
            Os alvos salvos anteriormente serão excluídos. Continuar?
          </div>
          <div class="go-mcv-overwrite-draft-actions">
            <button type="button" data-overwrite-draft-confirm>Continuar</button>
            <button type="button" data-overwrite-draft-cancel>Voltar</button>
          </div>
        </div>
      </div>
    `
  }

  const stopAllInsideCollector = (event) => {
    // Preserve native click behavior for draft toggle/menu buttons while still
    // blocking propagation to map/TW handlers behind the collector popup.
    if (event.target?.closest?.('[data-collector-drag-handle]')) {
      state.viewDragged = true
    }
    if (event.target?.closest?.('[data-planner-targets-draft]')) {
      event.stopPropagation?.()
      event.stopImmediatePropagation?.()
      return
    }
    event.stopPropagation?.()
    event.stopImmediatePropagation?.()
  }

  wrap.addEventListener('pointerdown', stopAllInsideCollector, true)
  wrap.addEventListener('mousedown', stopAllInsideCollector, true)
  wrap.addEventListener('click', (event) => {
    if (event.target?.closest?.('[data-planner-targets-draft]')) {
      // Let draft toggle/menu clicks reach the component handler untouched.
      return
    }

    const overwriteConfirmBtn = event.target?.closest?.('[data-overwrite-draft-confirm]')
    if (overwriteConfirmBtn) {
      stopAll(event)
      const menu = getCollectorOverwriteDraftMenu(wrap)
      const mode = String(menu?.getAttribute?.('data-mode') || state.overwriteDraftMenuMode || 'send')
      closeCollectorOverwriteDraftMenu(wrap)
      void runPlannerActionFromCollector(mode)
      return
    }

    const overwriteCancelBtn = event.target?.closest?.('[data-overwrite-draft-cancel]')
    if (overwriteCancelBtn) {
      stopAll(event)
      closeCollectorOverwriteDraftMenu(wrap)
      return
    }

    if (event.target?.closest?.('[data-overwrite-draft-menu]')) {
      stopAll(event)
      return
    }

    const actionBtn = event.target?.closest?.('[data-action]')
    if (actionBtn) {
      stopAll(event)
      if (actionBtn.disabled) return
      const action = String(actionBtn.getAttribute('data-action') || '')
      if ((action === 'schedule' || action === 'send') && shouldConfirmOverwriteSavedDraftOnCollectorAction()) {
        toggleCollectorOverwriteDraftMenu(wrap, actionBtn, action)
        return
      }
      closeCollectorOverwriteDraftMenu(wrap)
      if (action === 'schedule' || action === 'send') {
        void runPlannerActionFromCollector(action)
      }
      return
    }

    const btn = event.target?.closest?.('[data-mode]')
    if (!btn) {
      closeCollectorOverwriteDraftMenu(wrap)
      return
    }
    stopAll(event)
    closeCollectorOverwriteDraftMenu(wrap)
    const mode = String(btn.getAttribute('data-mode') || '')
    setActiveMode(wrap, mode)
    state.areaStartCoord = null
    updateViewStatus(wrap)
    renderSelectedMarkers()
    syncAreaHintText()
    consoleDev({
      event: 'mode',
      mode,
      selectedCoordsCount: state.selectedCoords.size,
      selectedCoords: selectedCoordsSnapshot()
    }, { label: '[GO][MapCollector]' })
  }, true)

  bindViewPositioningOnce()
  const buttonsWrap = wrap.querySelector('[data-go-buttons]')
  const btnSchedule = createBtnCalendar(buttonsWrap, {
    size: 24,
    className: 'go-btn-inline go-btn-inline-calendar',
    title: 'Agendar comandos',
    onClick: async () => { await runPlannerActionFromCollector('schedule') }
  })
  const btnSend = createBtnCrossedSwords(buttonsWrap, {
    size: 24,
    className: 'go-btn-inline go-btn-inline-sword',
    title: 'Enviar comandos',
    iconUri: ICON_CROSSED_SWORDS_CENTERED,
    onClick: async () => { await runPlannerActionFromCollector('send') }
  })
  btnSchedule.setAttribute('data-action', 'schedule')
  btnSend.setAttribute('data-action', 'send')
  btnSchedule.setAttribute('data-go-title', 'Agendar comandos')
  btnSend.setAttribute('data-go-title', 'Enviar comandos')
  btnSchedule.setAttribute('data-go-brand-tooltip', '1')
  btnSend.setAttribute('data-go-brand-tooltip', '1')
  btnSchedule.removeAttribute('title')
  btnSend.removeAttribute('title')

  updateActionsState(wrap)
  updateViewStatus(wrap)
  syncCollectorTargetsDraftButton(wrap)
  popup.refreshLayout?.()
  return wrap
}

function getOrCreateView() {
  ensureStyle()
  return document.getElementById(VIEW_ID) || createView()
}

export function selectorCoordsSearch(payload = {}) {
  const view = getOrCreateView()
  if (payload && (payload.root || payload.token)) {
    state.sessionPayload = {
      root: payload.root || state.sessionPayload?.root || null,
      token: payload.token || state.sessionPayload?.token || null
    }
  }
  bindMapClickCollectorOnce()
  bindMapObserversOnce()
  if (state.collectorPopup?.root?.() === view) {
    state.collectorPopup.open?.()
  } else {
    view.classList.add('is-open')
  }
  view.classList.remove('is-dragging')
  state.viewDragSession = null
  setLauncherVisible(false)
  setMarkersVisible(true)
  setActiveMode(view, view.dataset.mode || state.lastMode || 'area')
  updateViewStatus(view)
  syncCollectorTargetsDraftButton(view)
  renderSelectedMarkers()
  syncAreaHintText()
  positionSelectorView(view)
  consoleDev({
    event: 'open',
    payload,
    selectedCoordsCount: state.selectedCoords.size,
    selectedCoords: selectedCoordsSnapshot()
  }, { label: '[GO][MapCollector]' })
}

export default selectorCoordsSearch
