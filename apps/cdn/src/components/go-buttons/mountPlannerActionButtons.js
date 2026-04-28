import { createInlinePlannerActionButtons } from './inline-planner-actions';
import { isPlannerScheduleEnabled, PLANNER_SCHEDULE_DISABLED_MESSAGE } from '../../planner/featureFlags';
import { ICON_CALENDAR } from './calendar';
import { ICON_CROSSED_SWORDS_CENTERED } from './crossed-swords';
import { svgToDataUri } from './util';
import { createTargetsDraftCore } from '../../planner/targets-draft/core';
import { createTargetsDraftButton } from '../../planner/targets-draft/button';
import {
  applyUnexpectedInterruptionRecovery,
  getUnexpectedInterruptionState,
  matchesUnexpectedInterruptionState,
  readPlannerLastReport,
  writePlannerLastReport
} from '../../planner/recovery';
import { printMessage } from '../printMessage';
import Tooltip from '@toolkit-tw-bot/document/tooltip';
import { createPlacePlannerTargetTracker } from './placePlannerTargetTracker';
import './tw.css';
import { extensionId } from '@toolkit-tw-bot/release';

const sharedTargetsDraftCore = createTargetsDraftCore()
let plannerModulePromise = null
let plannerWarmupIdleTimerId = null
let plannerWarmupIdleCallbackId = null
let plannerWarmupPromise = null

async function loadPlannerModule() {
  if (!plannerModulePromise) {
    plannerModulePromise = import('../../planner')
      .catch((error) => {
        plannerModulePromise = null
        throw error
      })
  }
  return plannerModulePromise
}

async function loadPlannerOneToMany() {
  const plannerModule = await loadPlannerModule()
  const plannerOneToMany = plannerModule?.plannerOneToMany
  if (typeof plannerOneToMany !== 'function') {
    throw new Error('[GO][Planner] plannerOneToMany not available')
  }
  return plannerOneToMany
}

function warmupPlannerModule(level = 'idle') {
  if (!plannerWarmupPromise) {
    plannerWarmupPromise = (async () => {
      const plannerModule = await loadPlannerModule()
      const warmupPlanner = plannerModule?.warmupPlanner
      if (typeof warmupPlanner === 'function') {
        await warmupPlanner({ level })
      }
    })()
      .catch((error) => {
        plannerWarmupPromise = null
        console.debug('[GO][planner][warmup]', error)
      })
  }
  return plannerWarmupPromise
}

function schedulePlannerWarmupIdle() {
  if (plannerWarmupIdleTimerId != null || plannerWarmupIdleCallbackId != null) return
  const run = () => {
    plannerWarmupIdleTimerId = null
    plannerWarmupIdleCallbackId = null
    void warmupPlannerModule('idle')
  }
  if (typeof window?.requestIdleCallback === 'function') {
    plannerWarmupIdleCallbackId = window.requestIdleCallback(run, { timeout: 1800 })
    return
  }
  plannerWarmupIdleTimerId = window.setTimeout(run, 1200)
}

function cancelPlannerWarmupIdle() {
  if (plannerWarmupIdleTimerId != null) {
    window.clearTimeout(plannerWarmupIdleTimerId)
    plannerWarmupIdleTimerId = null
  }
  if (plannerWarmupIdleCallbackId != null && typeof window?.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(plannerWarmupIdleCallbackId)
    plannerWarmupIdleCallbackId = null
  }
}

async function runPlannerOneToMany(payload) {
  const plannerOneToMany = await loadPlannerOneToMany()
  return plannerOneToMany(payload)
}
const ICON_DRAFT_LIST = svgToDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect x="3" y="4" width="14" height="12" rx="2" stroke="#1f2937" stroke-width="1.6"/>
    <path d="M6 7.5h8M6 10h8M6 12.5h5" stroke="#1f2937" stroke-width="1.6" stroke-linecap="round"/>
  </svg>
`)
const DEFAULT_BOT_ICON_URL = `chrome-extension://${extensionId}/icons/ico.green.128.png`;

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

function readSavedTargetsDraftList() {
  const draft = sharedTargetsDraftCore.readDraft?.()
  const draftItems = sharedTargetsDraftCore.parseDraftTargetsItems?.(draft) || []
  if (draftItems.length <= 1) return null
  return { draft, draftItems }
}

function listSavedNamedTargetsDrafts() {
  return (sharedTargetsDraftCore.listNamedDrafts?.() || [])
    .map((draft) => {
      const draftItems = sharedTargetsDraftCore.parseDraftTargetsItems?.(draft) || []
      if (draftItems.length <= 1) return null
      return { draft, draftItems }
    })
    .filter(Boolean)
}

function getSavedDraftDispatchMode(draft = null) {
  const mode = String(draft?.dispatchMode || draft?.mode || '').trim().toLowerCase()
  return mode === 'schedule' ? 'schedule' : 'send'
}

function formatSavedDraftTitle(draft = null) {
  if (!draft || typeof draft !== 'object') return 'Últimos alvos salvos'
  const totalTargets = Math.max(0, Math.floor(Number(draft?.meta?.totalTargets || (Array.isArray(draft?.targets) ? draft.targets.length : 0)) || 0))
  const totalCommands = Math.max(0, Math.floor(Number(draft?.meta?.totalCommands) || 0))
  const pending = Math.max(0, Math.floor(Number(draft?.meta?.pendingRecoveryCount) || 0))
  const mode = getSavedDraftDispatchMode(draft)
  const updatedAt = Number(draft?.updatedAt)
  const lines = ['Últimos alvos salvos']
  lines.push(`Modo: ${mode === 'schedule' ? 'agendar' : 'enviar'}`)
  if (totalTargets > 0) lines.push(`Alvos: ${totalTargets}`)
  if (totalCommands > 0) lines.push(`Comandos: ${totalCommands}`)
  if (pending > 0) lines.push(`Pendências: ${pending}`)
  if (Number.isFinite(updatedAt)) {
    try { lines.push(`Atualizado: ${new Date(updatedAt).toLocaleString('pt-BR')}`) } catch (_) {}
  }
  return lines.join('<br>')
}

function mapDraftItemsToTargets(draftItems = []) {
  return (Array.isArray(draftItems) ? draftItems : [])
    .map((item) => {
      const x = Number(item?.x)
      const y = Number(item?.y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      const id = Number(item?.id)
      return {
        id: Number.isFinite(id) ? id : null,
        x,
        y,
        qty: Math.max(0, Math.floor(Number(item?.qty) || 0)),
        selected: Boolean(item?.selected),
        dispatchStatus: (item?.dispatchStatus && typeof item.dispatchStatus === 'object')
          ? item.dispatchStatus
          : null
      }
    })
    .filter(Boolean)
}

function buildPlannerPayloadFromDraft({ draft = null } = {}) {
  const draftItems = sharedTargetsDraftCore.parseDraftTargetsItems?.(draft) || []
  const targets = mapDraftItemsToTargets(draftItems)
  if (targets.length <= 1) return null
  const seedRaw = draft?.seedTarget || targets[0] || null
  const sx = Number(seedRaw?.x)
  const sy = Number(seedRaw?.y)
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null
  const sid = Number(seedRaw?.id)
  const dispatchMode = getSavedDraftDispatchMode(draft)
  return {
    id: Number.isFinite(sid) ? sid : (Number.isFinite(Number(targets[0]?.id)) ? Number(targets[0].id) : null),
    x: sx,
    y: sy,
    target: {
      id: Number.isFinite(sid) ? sid : null,
      x: sx,
      y: sy
    },
    targets,
    dispatchMode,
    mode: dispatchMode,
    templateComponentState: (draft?.templateComponentState && typeof draft.templateComponentState === 'object')
      ? draft.templateComponentState
      : null,
    dispatchTargetScope: String(draft?.dispatchTargetScope || draft?.targetScope || '').trim() || null,
    targetScope: String(draft?.targetScope || draft?.dispatchTargetScope || '').trim() || null,
    scheduleDateTime: String(draft?.scheduleDateTime || '').trim() || null,
    targetsDraftId: String(draft?.draftId || '').trim() || null,
    draftId: String(draft?.draftId || '').trim() || null
  }
}

function formatNamedDraftListItemTitle(draft = null) {
  if (!draft || typeof draft !== 'object') return ''
  const totalTargets = Math.max(0, Math.floor(Number(draft?.meta?.totalTargets || 0) || 0))
  const totalCommands = Math.max(0, Math.floor(Number(draft?.meta?.totalCommands || 0) || 0))
  const pending = Math.max(0, Math.floor(Number(draft?.meta?.pendingRecoveryCount) || 0))
  const mode = getSavedDraftDispatchMode(draft)
  const updatedAt = Number(draft?.updatedAt)
  const lines = [String(draft?.name || 'Draft').trim() || 'Draft']
  lines.push(`Modo: ${mode === 'schedule' ? 'agendar' : 'enviar'}`)
  if (totalTargets > 0) lines.push(`Alvos: ${totalTargets}`)
  if (totalCommands > 0) lines.push(`Comandos: ${totalCommands}`)
  if (pending > 0) lines.push(`Pendências: ${pending}`)
  if (Number.isFinite(updatedAt)) {
    try { lines.push(`Atualizado: ${new Date(updatedAt).toLocaleString('pt-BR')}`) } catch (_) {}
  }
  return lines.join('<br>')
}

function buildDraftPromptDefaultName(draft = null) {
  const mode = getSavedDraftDispatchMode(draft)
  const target = draft?.seedTarget || (Array.isArray(draft?.targets) ? draft.targets[0] : null)
  const x = Number(target?.x)
  const y = Number(target?.y)
  const coord = (Number.isFinite(x) && Number.isFinite(y)) ? `${x}|${y}` : null
  const stamp = (() => {
    try {
      return new Date().toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).replace(',', '')
    } catch (_) {
      return ''
    }
  })()
  return [mode === 'schedule' ? 'Agendar' : 'Enviar', coord, stamp].filter(Boolean).join(' - ')
}

async function getUnexpectedInterruptionRecoveryState() {
  await sharedTargetsDraftCore.ready?.()
  return await getUnexpectedInterruptionState({
    report: await readPlannerLastReport(),
    draftCore: sharedTargetsDraftCore
  })
}

async function recoverUnexpectedInterruptionIfNeeded(draftId = '') {
  const state = await getUnexpectedInterruptionRecoveryState()
  if (!matchesUnexpectedInterruptionState(state, draftId)) return null
  return await applyUnexpectedInterruptionRecovery({
    state,
    draftCore: sharedTargetsDraftCore,
    writeReport: writePlannerLastReport
  })
}

async function recoverAnyUnexpectedInterruption() {
  const state = await getUnexpectedInterruptionRecoveryState()
  if (!state) return null
  return await applyUnexpectedInterruptionRecovery({
    state,
    draftCore: sharedTargetsDraftCore,
    writeReport: writePlannerLastReport
  })
}

function buildPlannerPayloadFromUnexpectedState(state = null) {
  if (!state || typeof state !== 'object') return null
  const recovered = state?.draft && typeof state.draft === 'object' ? state.draft : null
  const fromDraft = recovered ? buildPlannerPayloadFromDraft({ draft: recovered }) : null
  if (fromDraft) {
    const draftId = String(state?.draftId || '').trim()
    if (draftId) {
      fromDraft.targetsDraftId = draftId
      fromDraft.draftId = draftId
    }
    return fromDraft
  }

  const reportTarget = (state?.report?.target && typeof state.report.target === 'object') ? state.report.target : null
  const x = Number(reportTarget?.x)
  const y = Number(reportTarget?.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const id = Number(reportTarget?.id)
  return {
    id: Number.isFinite(id) ? id : null,
    x,
    y,
    target: {
      id: Number.isFinite(id) ? id : null,
      x,
      y
    }
  }
}

async function buildSingleDispatchStatusFromLastReport(targetPayload = null) {
  const report = await readPlannerLastReport()
  if (!report || typeof report !== 'object' || !targetPayload) return null
  const reportTarget = (report?.target && typeof report.target === 'object') ? report.target : null
  const reportX = Number(reportTarget?.x)
  const reportY = Number(reportTarget?.y)
  const targetX = Number(targetPayload?.x)
  const targetY = Number(targetPayload?.y)
  if (!Number.isFinite(reportX) || !Number.isFinite(reportY) || reportX !== targetX || reportY !== targetY) return null
  const settings = (report?.settings && typeof report.settings === 'object') ? report.settings : {}
  const execution = (report?.execution && typeof report.execution === 'object') ? report.execution : {}
  const requestedQty = Math.max(
    0,
    Math.floor(Number(settings?.distributedCount || settings?.totalCommands || settings?.selectedVillageCount || execution?.total) || 0)
  )
  const sendOkQty = Math.max(0, Math.floor(Number(settings?.sentCount || execution?.success) || 0))
  const sendFailQty = Math.max(0, Math.floor(Number(settings?.errorCount || execution?.failed) || 0))
  const sendPendingQty = Math.max(0, Math.floor(Number(execution?.pending) || 0))
  const retryQty = Math.max(0, sendFailQty + sendPendingQty)
  if (![requestedQty, sendOkQty, sendFailQty, sendPendingQty, retryQty].some((value) => value > 0)) return null
  return {
    stage: 'sent',
    requestedQty,
    distributedQty: requestedQty,
    remainingQty: 0,
    bnBlockedCount: 0,
    sendOkQty,
    sendFailQty,
    sendPendingQty,
    retryQty,
    diagnostics: (execution?.diagnostics && typeof execution.diagnostics === 'object') ? execution.diagnostics : null
  }
}

async function enrichSinglePlannerPayloadWithRecoveredStatus(payload = null) {
  if (!payload || typeof payload !== 'object') return payload
  const dispatchStatus = await buildSingleDispatchStatusFromLastReport(payload)
  if (!dispatchStatus) return payload
  return {
    ...payload,
    dispatchStatus
  }
}

export function saveLastDraftAsNamed(name = '', { onSaved = null } = {}) {
  const payload = readSavedTargetsDraftList()
  const draft = payload?.draft || null
  if (!draft) {
    printMessage.error('Nenhum último rascunho para salvar.', 2500)
    return { ok: false, error: 'missing_last_draft' }
  }
  const proposedName = String(name || '').trim() || buildDraftPromptDefaultName(draft)
  const result = sharedTargetsDraftCore.promoteLastDraftToNamed?.(proposedName)
  if (!result?.ok) {
    printMessage.error(result?.error || 'Não foi possível salvar draft.', 2500)
    return { ok: false, error: 'save_failed' }
  }
  printMessage.success('Draft salvo na lista.', 2000)
  onSaved?.(result)
  return result
}

export function promptSaveLastDraftAsNamed({ onSaved = null } = {}) {
  const payload = readSavedTargetsDraftList()
  const draft = payload?.draft || null
  if (!draft) {
    printMessage.error('Nenhum último rascunho para salvar.', 2500)
    return { ok: false, error: 'missing_last_draft' }
  }
  const suggested = buildDraftPromptDefaultName(draft)
  const rawName = window.prompt('Nome do draft salvo:', suggested)
  if (rawName == null) return { ok: false, cancelled: true }
  return saveLastDraftAsNamed(rawName, { onSaved })
}

export function deleteNamedDraftById(draftId = '', { silent = false } = {}) {
  const id = String(draftId || '').trim()
  if (!id) return false
  sharedTargetsDraftCore.removeNamedDraft?.(id)
  if (!silent) printMessage.warn('Draft excluído da lista.', 2000)
  return true
}

export async function openPlannerFromNamedDraft(draftId = '') {
  const id = String(draftId || '').trim()
  if (!id) {
    printMessage.error('Draft inválido.', 2500)
    return false
  }
  try {
    await sharedTargetsDraftCore.ready?.()
    await recoverUnexpectedInterruptionIfNeeded(id)
    const draft = sharedTargetsDraftCore.readNamedDraft?.(id)
    if (!draft) {
      printMessage.error('Draft salvo não encontrado.', 2500)
      return false
    }
    const plannerPayload = buildPlannerPayloadFromDraft({ draft })
    if (!plannerPayload) {
      printMessage.error('Draft inválido para recuperação.', 2500)
      return false
    }
    plannerPayload.targetsDraftId = id
    plannerPayload.draftId = id
    void runPlannerOneToMany(plannerPayload)
    return true
  } catch (error) {
    console.error('[planner:draft:open:named]', error)
    printMessage.error(error?.message || 'Erro ao abrir draft salvo.', 2500)
    return false
  }
}

export function mountPlannerDraftListButton(container, {
  visibleInContext = true,
  onOpen = null,
  onDelete = null,
  onChange = null,
  getTooltipLabel = null
} = {}) {
  if (!container) return null
  const ACTION_OPEN_PREFIX = 'open_saved_named:'
  const ACTION_DELETE_PREFIX = 'delete_saved_named:'

  const button = createTargetsDraftButton(container, {
    variant: 'icon-button',
    onAction: (action) => {
      const raw = String(action || '').trim()
      if (!raw) return
      if (raw.startsWith(ACTION_OPEN_PREFIX)) {
        const draftId = raw.slice(ACTION_OPEN_PREFIX.length)
        const draft = sharedTargetsDraftCore.readNamedDraft?.(draftId) || null
        if (!draft) {
          printMessage.error('Draft salvo não encontrado.', 2500)
          refresh()
          onChange?.()
          return
        }
        onOpen?.({ draftId, draft })
      } else if (raw.startsWith(ACTION_DELETE_PREFIX)) {
        const draftId = raw.slice(ACTION_DELETE_PREFIX.length)
        const draft = sharedTargetsDraftCore.readNamedDraft?.(draftId) || null
        if (deleteNamedDraftById(draftId, { silent: true })) {
          onDelete?.({ draftId, draft })
          printMessage.warn('Draft excluído da lista.', 2000)
        }
      }
      refresh()
      onChange?.()
    }
  })

  const refresh = () => {
    const entries = visibleInContext ? listSavedNamedTargetsDrafts() : []
    const hasList = entries.length > 0
    const tooltipLabel = typeof getTooltipLabel === 'function'
      ? (getTooltipLabel({ entries }) || '')
      : 'Lista de drafts salvos'
    button.refresh({
      visible: hasList,
      label: hasList ? `Drafts ${entries.length}` : 'Drafts',
      title: hasList ? `Drafts salvos: ${entries.length}` : '',
      goTitle: hasList ? String(tooltipLabel || 'Lista de drafts salvos') : '',
      brandTooltip: true,
      iconMode: 'list',
      iconUri: ICON_DRAFT_LIST,
      iconFallbackUri: ICON_DRAFT_LIST,
      iconAlt: 'Lista de drafts',
      actions: hasList ? entries.map(({ draft }) => {
        const id = String(draft?.draftId || '').trim()
        const mode = getSavedDraftDispatchMode(draft)
        const itemIcon = mode === 'schedule' ? ICON_CALENDAR : ICON_CROSSED_SWORDS_CENTERED
        const name = String(draft?.name || '').trim() || `Draft ${id.slice(-4)}`
        return {
          id: `${ACTION_OPEN_PREFIX}${id}`,
          label: name,
          title: formatNamedDraftListItemTitle(draft),
          iconUri: itemIcon,
          secondaryId: `${ACTION_DELETE_PREFIX}${id}`,
          secondaryLabel: '✕',
          secondaryTitle: `Excluir "${name}"`,
          secondaryDanger: true
        }
      }) : []
    })
    return entries
  }

  refresh()
  return {
    root: () => button?.root?.() || null,
    refresh,
    destroy: () => button?.destroy?.()
  }
}

export function mountPlannerDraftButton(container, {
  visibleInContext = true,
  getCurrentTargets = null,
  canMerge = null,
  onRecover = null,
  onMerge = null,
  onDelete = null,
  onSave = null,
  getTooltipLabel = null,
  onChange = null
} = {}) {
  if (!container) return null

  const button = createTargetsDraftButton(container, {
    variant: 'icon-button',
    onAction: (action, details = {}) => {
      const payload = readSavedTargetsDraftList()
      if (!payload?.draft) return
      if (action === 'recover') onRecover?.(payload)
      if (action === 'merge') onMerge?.(payload)
      if (action === 'discard') {
        sharedTargetsDraftCore.removeDraft?.()
        onDelete?.(payload)
      }
      if (action === 'save_named') {
        const inputEl = details?.menuEl?.querySelector?.('[data-draft-input="save_named_name"]')
        const proposedName = String(inputEl?.value || '').trim()
        const saveResult = onSave?.(payload, {
          name: proposedName,
          inputEl,
          details
        })
        if (saveResult === false) return false
      }
      refresh()
      onChange?.()
    }
  })

  const refresh = () => {
    const payload = visibleInContext ? readSavedTargetsDraftList() : null
    const draft = payload?.draft || null
    const hasDraft = Boolean(draft)
    const pending = Math.max(0, Math.floor(Number(draft?.meta?.pendingRecoveryCount) || 0))
    const currentTargets = typeof getCurrentTargets === 'function' ? (getCurrentTargets() || []) : []
    const currentCount = Array.isArray(currentTargets) ? currentTargets.length : 0
    const mode = getSavedDraftDispatchMode(draft)
    const iconUri = mode === 'schedule' ? ICON_CALENDAR : ICON_CROSSED_SWORDS_CENTERED
    const iconAlt = mode === 'schedule' ? 'Rascunho de agendamento' : 'Rascunho de envio'
    const suggestedSaveName = hasDraft ? buildDraftPromptDefaultName(draft) : ''
    const tooltipLabel = typeof getTooltipLabel === 'function'
      ? (getTooltipLabel({ draft, payload, currentTargets }) || '')
      : 'Últimos alvos salvos'
    const showMerge = hasDraft && (typeof canMerge === 'function'
      ? Boolean(canMerge({ draft, payload, currentTargets }))
      : currentCount > 0)
    button.refresh({
      visible: hasDraft,
      label: hasDraft ? `Rascunho ${Math.max(0, Math.floor(Number(draft?.meta?.totalTargets) || 0))}` : 'Rascunho',
      title: hasDraft ? formatSavedDraftTitle(draft) : '',
      goTitle: hasDraft ? String(tooltipLabel || 'Últimos alvos salvos') : '',
      brandTooltip: true,
      pending: pending > 0,
      iconMode: mode,
      iconUri,
      iconFallbackUri: ICON_CROSSED_SWORDS_CENTERED || ICON_CALENDAR || '',
      iconAlt,
      actions: hasDraft ? [
        { id: 'recover', label: 'Abrir últimos alvos' },
        ...(showMerge ? [{ id: 'merge', label: 'Mesclar' }] : []),
        { id: 'discard', label: 'Excluir', danger: true },
        ...(typeof onSave === 'function' ? [{
          kind: 'input',
          inputKey: 'save_named_name',
          value: '',
          placeholder: 'Digite um nome',
          title: `Sugestão: ${suggestedSaveName || 'sem sugestão'}`
        }] : []),
        ...(typeof onSave === 'function' ? [{ id: 'save_named', label: 'Salvar na lista', primary: true }] : [])
      ] : []
    })
    return payload
  }

  refresh()

  return {
    root: () => button?.root?.() || null,
    refresh,
    destroy: () => button?.destroy?.()
  }
}

export async function openPlannerFromSavedDraft() {
  try {
    await sharedTargetsDraftCore.ready?.()
    await recoverUnexpectedInterruptionIfNeeded()
    const payload = readSavedTargetsDraftList()
    if (!payload?.draft) {
      printMessage.error('Nenhum rascunho salvo encontrado.', 2500)
      return false
    }
    const plannerPayload = buildPlannerPayloadFromDraft({ draft: payload.draft })
    if (!plannerPayload) {
      printMessage.error('Rascunho inválido para recuperação.', 2500)
      return false
    }
    void runPlannerOneToMany(plannerPayload)
    return true
  } catch (error) {
    console.error('[planner:draft:open:last]', error)
    printMessage.error(error?.message || 'Erro ao abrir últimos alvos salvos.', 2500)
    return false
  }
}

export async function openPlannerFromUnexpectedInterruptionState(state = null) {
  if (!state || typeof state !== 'object') {
    printMessage.error('Último envio inválido para recuperação.', 2500)
    return false
  }
  try {
    const draftId = String(state?.draftId || '').trim()
    const recoveryResult = draftId
      ? await recoverUnexpectedInterruptionIfNeeded(draftId)
      : await applyUnexpectedInterruptionRecovery({
        state,
        draftCore: sharedTargetsDraftCore,
        writeReport: writePlannerLastReport
      })
    const nextState = (() => {
      if (recoveryResult?.draft || recoveryResult?.report) {
        return {
          ...state,
          ...(recoveryResult?.draft ? { draft: recoveryResult.draft } : {}),
          ...(recoveryResult?.report ? { report: recoveryResult.report } : {})
        }
      }
      return state
    })()
    const plannerPayload = buildPlannerPayloadFromUnexpectedState(nextState)
    if (!plannerPayload) {
      printMessage.error('Último envio indisponível para abrir.', 2500)
      return false
    }
    void runPlannerOneToMany(plannerPayload)
    return true
  } catch (error) {
    console.error('[planner:draft:open:unexpected]', error)
    printMessage.error(error?.message || 'Erro ao recuperar último envio.', 2500)
    return false
  }
}

export function mountPlannerActionButtons(data) {
  const url = new URL(location.href, origin);

  const isPlace = () => url.searchParams.has('screen', 'place') && !url.searchParams.has('try', 'confirm');
  const isInfoVillage = () => url.searchParams.has('screen', 'info_village')

  if (!isInfoVillage() && !isPlace()) return;

  const target = document.querySelector('#content_value > table');
  const parent = target?.parentElement;
  if (!parent) return;
  parent.style.position = 'relative';

  // Reinit-safe: remove instâncias anteriores no mesmo container (ex.: script reinjetado/reexecutado).
  parent.querySelectorAll('.go-planner-action-buttons, .go-btn-info-village, .go-planner-targets-draft').forEach((node) => {
    node?.remove?.()
  })

  const buttonsWrap = document.createElement('div')
  buttonsWrap.className = 'go-planner-action-buttons'
  buttonsWrap.setAttribute('data-go-planner-action-buttons-mounted', '1')
  let placeTargetTracker = null
  let unbindPlaceTracker = null

  const getPlannerPayload = () => {
    const url = new URL(location.href, origin);
    if (isInfoVillage()) {
      const id = url.searchParams.get('id')
      if (!id) return null;
      const coord = document.querySelector('#content_value td[valign="top"]')?.innerText?.match(/(\d{1,3})\|(\d{1,3})/)?.[0];
      if (!coord) return null;
      const [x, y] = coord.split('|');
      if (!x || !y) return null;
      return { id, x: Number(x), y: Number(y), ...data }
    }
    if (isPlace()) {
      const tracked = placeTargetTracker?.getActiveTarget?.() || null
      if (!tracked) return null
      return {
        id: Number.isFinite(Number(tracked?.id)) ? Number(tracked.id) : null,
        x: Number(tracked.x),
        y: Number(tracked.y),
        ...data
      }
    }
  }

  const onClickSchedule = () => {
    void (async() => {
      try {
        if (!isPlannerScheduleEnabled()) {
          printMessage.warn(PLANNER_SCHEDULE_DISABLED_MESSAGE, 2200)
          return
        }
        await recoverAnyUnexpectedInterruption()
        const payload = await enrichSinglePlannerPayloadWithRecoveredStatus(getPlannerPayload())
        if (!payload) return
        void runPlannerOneToMany({ ...payload, dispatchMode: 'schedule', mode: 'schedule' })
      } catch (error) {
        console.error('[planner:action:schedule]', error)
        printMessage.error(error?.message || 'Erro ao abrir planner para agendar.', 2500)
      }
    })()
  }

  const onClickSend = () => {
    void (async() => {
      try {
        await recoverAnyUnexpectedInterruption()
        const payload = await enrichSinglePlannerPayloadWithRecoveredStatus(getPlannerPayload())
        if (!payload) return
        void runPlannerOneToMany({ ...payload, dispatchMode: 'send', mode: 'send' })
      } catch (error) {
        console.error('[planner:action:send]', error)
        printMessage.error(error?.message || 'Erro ao abrir planner para enviar.', 2500)
      }
    })()
  }

  const buttons = createInlinePlannerActionButtons(buttonsWrap, {
    size: 24,
    wrapperClass: 'go-planner-action-buttons-group',
    tooltipAttr: 'data-go-title',
    scheduleDisabled: !isPlannerScheduleEnabled(),
    scheduleDisabledTitle: PLANNER_SCHEDULE_DISABLED_MESSAGE,
    onSchedule: onClickSchedule,
    onSend: onClickSend
  })
  const btnCal = buttons?.btnCal
  const btnSword = buttons?.btnSword
  const onWarmupIntent = () => {
    void warmupPlannerModule('intent')
  }
  const setBtnDisabledState = (btn, {
    disabled = false,
    title = ''
  } = {}) => {
    if (!btn) return
    btn.disabled = Boolean(disabled)
    btn.setAttribute('aria-disabled', disabled ? 'true' : 'false')
    if (title) btn.setAttribute('data-go-title', String(title))
  }
  const syncPlaceButtonsState = () => {
    if (!isPlace()) return
    const hasTarget = Boolean(placeTargetTracker?.hasTarget?.())
    setBtnDisabledState(btnSword, {
      disabled: !hasTarget,
      title: hasTarget ? 'Enviar comandos' : 'Selecione um alvo na praça'
    })
    setBtnDisabledState(btnCal, {
      disabled: (!hasTarget) || !isPlannerScheduleEnabled(),
      title: !hasTarget
        ? 'Selecione um alvo na praça'
        : (!isPlannerScheduleEnabled() ? PLANNER_SCHEDULE_DISABLED_MESSAGE : 'Agendar comandos')
    })
  }
  let draftUi = null
  let draftListUi = null
  const refreshDraftButtons = () => {
    draftListUi?.refresh?.()
    draftUi?.refresh?.()
  }
  void sharedTargetsDraftCore.ready?.()
    .then(() => {
      refreshDraftButtons()
    })
    .catch((error) => {
      console.debug('[planner:draft:ready]', error)
    })
  draftListUi = mountPlannerDraftListButton(buttonsWrap, {
    visibleInContext: true,
    onOpen: ({ draftId }) => {
      void openPlannerFromNamedDraft(draftId)
    },
    onDelete: () => {},
    onChange: () => {
      refreshDraftButtons()
    },
    getTooltipLabel: ({ entries }) => {
      return `Drafts salvos (${entries.length})`
    }
  })
  draftUi = mountPlannerDraftButton(buttonsWrap, {
    visibleInContext: true,
    getCurrentTargets: () => [],
    canMerge: () => false,
    onRecover: () => {
      void openPlannerFromSavedDraft()
    },
    onDelete: () => {
      printMessage.warn('Rascunho excluído.', 2000)
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
      const mode = getSavedDraftDispatchMode(draft)
      return `Últimos alvos salvos (${mode === 'schedule' ? 'agendar' : 'enviar'})`
    },
    onChange: () => {
      refreshDraftButtons()
    }
  })
  const tooltip = new Tooltip()
  const unbindTooltip = tooltip.bind(document.body, '.go-planner-action-buttons [data-go-title]', (el) => {
    const value = String(el?.getAttribute?.('data-go-title') || '').trim()
    return renderBotTooltip(value)
  })

  if (isPlace()) {
    placeTargetTracker = createPlacePlannerTargetTracker({
      onChange: () => {
        syncPlaceButtonsState()
      }
    })
    unbindPlaceTracker = placeTargetTracker?.subscribe?.(() => {
      syncPlaceButtonsState()
    })
    syncPlaceButtonsState()
  }

  schedulePlannerWarmupIdle()
  btnCal?.addEventListener('pointerenter', onWarmupIntent, { passive: true })
  btnSword?.addEventListener('pointerenter', onWarmupIntent, { passive: true })
  btnCal?.addEventListener('focus', onWarmupIntent, { passive: true })
  btnSword?.addEventListener('focus', onWarmupIntent, { passive: true })
  btnCal?.addEventListener('pointerdown', onWarmupIntent, { passive: true })
  btnSword?.addEventListener('pointerdown', onWarmupIntent, { passive: true })

  parent.insertBefore(buttonsWrap, target);
  return () => {
    cancelPlannerWarmupIdle()
    unbindPlaceTracker?.()
    placeTargetTracker?.destroy?.()
    unbindTooltip?.()
    draftListUi?.destroy?.()
    draftUi?.destroy?.()
    btnCal?.removeEventListener('pointerenter', onWarmupIntent)
    btnSword?.removeEventListener('pointerenter', onWarmupIntent)
    btnCal?.removeEventListener('focus', onWarmupIntent)
    btnSword?.removeEventListener('focus', onWarmupIntent)
    btnCal?.removeEventListener('pointerdown', onWarmupIntent)
    btnSword?.removeEventListener('pointerdown', onWarmupIntent)
    btnCal.removeEventListener('click', onClickSchedule)
    btnSword.removeEventListener('click', onClickSend)
  }
}

// Compat temporário para não quebrar imports legados durante a migração de nomenclatura.
export const insertInInfoVilage = mountPlannerActionButtons
