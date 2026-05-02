// Map/planner/view/index.js
import buttonRefresh from './button-refresh.html'
import './style.css'
import { postSender } from '../../requests/postSender';
import { inputDateTimeView } from '../../components/input-date-time';
import { useGoTiming } from "../../hooks/useGoTiming";
import { bringData } from '../../bringData';
import { getTargeSelection } from '../../requests/getTargetSelection';
import { getAjaxMapInfo, getCachedAjaxMapInfo } from '../../requests/getAjaxMapInfo';
import { computeSlowestUnit } from '../shared/slowestUnit';
import { dataUnits, minSpyCommand } from '..';
import { getUnitData, getWorldUnitsOrder } from '../../unit';
import { postCommandDistribute } from '../../requests/postCommandDistribute';
import {
  createTargetsDraftCore,
  serializeTargetsDraft as serializeTargetsDraftImpl
} from '../targets-draft/core';
import { isPlannerScheduleEnabled } from '../featureFlags';
import {
  applyUnexpectedInterruptionRecovery,
  clearPlannerPendingSendSession,
  getUnexpectedInterruptionState,
  removePlannerPendingSendCommands,
  readPlannerLastReport as readPlannerLastReportStorage,
  writePlannerLastReport as writePlannerLastReportStorage,
  startPlannerPendingSendSession
} from '../recovery';
import {
  getPlannerProductionVillageByIdMap,
  refreshPlannerProductionSnapshot
} from '../production-snapshot';
import { getGameData, ProtectingBot } from '@toolkit-tw-bot/document';
import { printMessage } from '../../components/printMessage';
import { consoleDev } from '@toolkit-tw-bot/utils';
import { loaderGame } from '../../components/loaderGame';
import { Distance } from '@toolkit-tw-bot/core';
import youtubeLinkImage from '../../components/youtube-link-image';
import Running from '../../running';

const cancelEvents = {}
let defaultGroupId;
let dateTimeValue;
let sendersDataCurrent;
let calculateDistance;
let templateStatsCurrent;
let templateStatsHintCurrent;
let templateStatsTimer;
let lastTemplateStatsSeq = 0;
let fakeLimitPercent = null;
let snobMaxDistance = null;
let nightBonusConfigWorld = null;
let nightBonusConfigTarget = null;
let nightBonusConfig = null;
let playerNightMoralState = []
let playerNightMoralStateById = new Map()
let playerNightMoralStateRequestByPlayerId = new Map()
let manyToManyWorldConfigCurrent = null;
let dispatchController = null;
let modeController = null;
let inputDateTimeController = null;
let initialDispatchMode = null;
let renderSendersTableCurrent = null;
let dispatchModeSwitchTimerId = null;
let dispatchModeSwitchRafId = null;
let isModeSwitchRenderPending = false;
let currentTableDispatchMode = null;
let plannerTargetCurrent = null;
let executionFeedController = null;
let senderVillageByIdCache = null;
let sendConflictTroopsMode = 'redistribute'
let targetsNavigatorQtyByKey = new Map()
let targetsNavigatorSelectedKeys = new Set()
let targetsNavigatorMetaByKey = new Map()
let targetsNavigatorEnrichSeq = 0
let targetsNavigatorSignature = null
let targetsNavigatorCurrentTargets = []
let targetsNavigatorMapInfoRequestByKey = new Set()
let dispatchTargetScope = 'current'
let dispatchTargetScopeHasExplicitInput = false
let dispatchTargetScopeAutoDefaultApplied = false
const DISTRIBUTION_OPTIMIZED_MAX_PAIRS = 200000
let syncDispatchScopeUiCurrent = null
let syncTargetsNavigatorTogglePreviewUiCurrent = null
let rerenderTargetsNavigatorRowsCurrent = null
let syncPlannerLastReportIndicatorUiCurrent = null
let syncPlannerTargetCardPreviewCurrent = null
let plannerDataCurrent = null
let plannerSeedTargetCurrent = null
let targetsNavigatorActiveKeyCurrent = null
let targetsDraftPersistSignatureCurrent = null
let activeTargetsDraftIdCurrent = null
const plannerSendRunning = new Running('plannerSend')
let plannerSendPreemptPausedKeys = []
let plannerExecutionModulePromise = null
let plannerTemplatesModulePromise = null
let plannerDispatchModulePromise = null
let plannerTableModulePromise = null
let plannerTableViewApi = null
let plannerTargetModulesPromise = null
let plannerTargetApi = null
let plannerExecutionFeedModulePromise = null
let plannerTargetsMapInfoModulePromise = null
let plannerTargetsMapInfoApi = null
let plannerNormalizeTemplateModulePromise = null
let plannerDispatchExecutionModulePromise = null
let plannerPopupModulePromise = null
let plannerTargetsNavigatorModulePromise = null
let plannerTargetsNavigatorApi = null
let plannerModeModulePromise = null
let plannerSendersTickModulePromise = null

const gameData = getGameData();

// Flag de debug local para testes do guard sem bridge de vilas.
const DEBUG_DISABLE_TARGETS_VILLAGES_BRIDGE = false

const SEND_CONFLICT_TROOPS_STORAGE_KEY = `__plan:send:conflict:troops:mode:${gameData?.world}:${gameData?.player?.id}`
const PLANNER_TARGETS_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const plannerTargetsDraftCore = createTargetsDraftCore({
  ttlMs: PLANNER_TARGETS_DRAFT_TTL_MS
})

export const commandCache = new Map();   // commandId -> html
export const inFlight = new Map();       // commandId -> Promise<html>

const MAX = 100;

const normalizeIncomingDispatchMode = (value) => {
  const mode = String(value || '').trim().toLowerCase()
  if (mode === 'send' || mode === 'enviar') return 'send'
  if (mode === 'schedule' || mode === 'schedules' || mode === 'agendar') return 'schedule'
  return null
}

async function loadPlannerExecutionModule() {
  if (!plannerExecutionModulePromise) {
    plannerExecutionModulePromise = import('../execution')
      .then((module) => {
        const createExecutionView = module?.createExecutionView
        const executeSendPhases = module?.executeSendPhases
        if (typeof createExecutionView !== 'function' || typeof executeSendPhases !== 'function') {
          throw new Error('Módulo de execução do planner inválido.')
        }
        return { createExecutionView, executeSendPhases }
      })
      .catch((error) => {
        plannerExecutionModulePromise = null
        throw error
      })
  }
  return plannerExecutionModulePromise
}

async function loadPlannerTableModule() {
  if (!plannerTableModulePromise) {
    plannerTableModulePromise = import('./table')
      .then(async(module) => {
        const plannerTableView = module?.plannerTableView
        if (!plannerTableView || typeof plannerTableView.insert !== 'function') {
          throw new Error('Módulo de tabela do planner inválido.')
        }
        if (typeof plannerTableView.ready === 'function') {
          await plannerTableView.ready()
        }
        plannerTableViewApi = plannerTableView
        return { plannerTableView }
      })
      .catch((error) => {
        plannerTableModulePromise = null
        plannerTableViewApi = null
        throw error
      })
  }
  return plannerTableModulePromise
}

async function loadPlannerTargetModules() {
  if (!plannerTargetModulesPromise) {
    plannerTargetModulesPromise = Promise.all([
      import('../target/view'),
      import('../target/view/schedules')
    ])
      .then(([targetViewModule, schedulesModule]) => {
        const plannerTargetView = targetViewModule?.plannerTargetView
        const updatePlannerTargetCard = targetViewModule?.updatePlannerTargetCard
        const actionIncomingTargetInit = targetViewModule?.actionIncomingTargetInit
        const actionSchedulesTargetInit = schedulesModule?.actionSchedulesTargetInit
        const actionSchedulesSenderInit = schedulesModule?.actionSchedulesSenderInit
        if (
          typeof plannerTargetView !== 'function'
          || typeof updatePlannerTargetCard !== 'function'
          || typeof actionIncomingTargetInit !== 'function'
          || typeof actionSchedulesTargetInit !== 'function'
          || typeof actionSchedulesSenderInit !== 'function'
        ) {
          throw new Error('Módulo de alvo do planner inválido.')
        }
        plannerTargetApi = {
          plannerTargetView,
          updatePlannerTargetCard,
          actionIncomingTargetInit,
          actionSchedulesTargetInit,
          actionSchedulesSenderInit
        }
        return plannerTargetApi
      })
      .catch((error) => {
        plannerTargetModulesPromise = null
        plannerTargetApi = null
        throw error
      })
  }
  return plannerTargetModulesPromise
}

async function loadPlannerExecutionFeedModule() {
  if (!plannerExecutionFeedModulePromise) {
    plannerExecutionFeedModulePromise = import('../../components/execution-feed')
      .then((module) => {
        const createExecutionFeed = module?.createExecutionFeed
        if (typeof createExecutionFeed !== 'function') {
          throw new Error('Módulo de feed de execução do planner inválido.')
        }
        return { createExecutionFeed }
      })
      .catch((error) => {
        plannerExecutionFeedModulePromise = null
        throw error
      })
  }
  return plannerExecutionFeedModulePromise
}

async function loadPlannerTargetsMapInfoModule() {
  if (!plannerTargetsMapInfoModulePromise) {
    plannerTargetsMapInfoModulePromise = import('./targets-map-info')
      .then((module) => {
        const applyMapInfoToTargetsNavigatorMeta = module?.applyMapInfoToTargetsNavigatorMeta
        const ensureTargetsNavigatorPreviewMapInfo = module?.ensureTargetsNavigatorPreviewMapInfo
        const buildPlannerTargetCardVillageFromNavigatorPreview = module?.buildPlannerTargetCardVillageFromNavigatorPreview
        if (
          typeof applyMapInfoToTargetsNavigatorMeta !== 'function'
          || typeof ensureTargetsNavigatorPreviewMapInfo !== 'function'
          || typeof buildPlannerTargetCardVillageFromNavigatorPreview !== 'function'
        ) {
          throw new Error('Módulo map-info do planner inválido.')
        }
        plannerTargetsMapInfoApi = {
          applyMapInfoToTargetsNavigatorMeta,
          ensureTargetsNavigatorPreviewMapInfo,
          buildPlannerTargetCardVillageFromNavigatorPreview
        }
        return plannerTargetsMapInfoApi
      })
      .catch((error) => {
        plannerTargetsMapInfoModulePromise = null
        plannerTargetsMapInfoApi = null
        throw error
      })
  }
  return plannerTargetsMapInfoModulePromise
}

async function loadPlannerNormalizeTemplateModule() {
  if (!plannerNormalizeTemplateModulePromise) {
    plannerNormalizeTemplateModulePromise = import('../../send/utils/normalizeTemplateForCommand')
      .then((module) => {
        const normalizeTemplateForCommand = module?.normalizeTemplateForCommand
        if (typeof normalizeTemplateForCommand !== 'function') {
          throw new Error('Módulo de normalização de template inválido.')
        }
        return normalizeTemplateForCommand
      })
      .catch((error) => {
        plannerNormalizeTemplateModulePromise = null
        throw error
      })
  }
  return plannerNormalizeTemplateModulePromise
}

async function loadPlannerDispatchExecutionModule() {
  if (!plannerDispatchExecutionModulePromise) {
    plannerDispatchExecutionModulePromise = import('./dispatch-execution')
      .then((module) => {
        const executePlannerDispatchAction = module?.executePlannerDispatchAction
        if (typeof executePlannerDispatchAction !== 'function') {
          throw new Error('Módulo de execução de dispatch do planner inválido.')
        }
        return { executePlannerDispatchAction }
      })
      .catch((error) => {
        plannerDispatchExecutionModulePromise = null
        throw error
      })
  }
  return plannerDispatchExecutionModulePromise
}

async function loadPlannerPopupModule() {
  if (!plannerPopupModulePromise) {
    plannerPopupModulePromise = import('./popup')
      .then((module) => {
        const showPopUpPlanner = module?.showPopUpPlanner
        if (typeof showPopUpPlanner !== 'function') {
          throw new Error('Módulo de popup do planner inválido.')
        }
        return { showPopUpPlanner }
      })
      .catch((error) => {
        plannerPopupModulePromise = null
        throw error
      })
  }
  return plannerPopupModulePromise
}

async function loadPlannerTargetsNavigatorModule() {
  if (!plannerTargetsNavigatorModulePromise) {
    plannerTargetsNavigatorModulePromise = import('./targets-navigator')
      .then((module) => {
        const insertTargetsAccordion = module?.insertTargetsAccordion
        const filterIncomingTargetsToExistingVillages = module?.filterIncomingTargetsToExistingVillages
        if (
          typeof insertTargetsAccordion !== 'function'
          || typeof filterIncomingTargetsToExistingVillages !== 'function'
        ) {
          throw new Error('Módulo de targets navigator do planner inválido.')
        }
        plannerTargetsNavigatorApi = {
          insertTargetsAccordion,
          filterIncomingTargetsToExistingVillages
        }
        return plannerTargetsNavigatorApi
      })
      .catch((error) => {
        plannerTargetsNavigatorModulePromise = null
        plannerTargetsNavigatorApi = null
        throw error
      })
  }
  return plannerTargetsNavigatorModulePromise
}

async function loadPlannerTemplatesModule() {
  if (!plannerTemplatesModulePromise) {
    plannerTemplatesModulePromise = import('../templates/view')
      .then((module) => {
        const plannerTemplatesView = module?.plannerTemplatesView
        if (typeof plannerTemplatesView !== 'function') {
          throw new Error('Módulo de templates do planner inválido.')
        }
        return { plannerTemplatesView }
      })
      .catch((error) => {
        plannerTemplatesModulePromise = null
        throw error
      })
  }
  return plannerTemplatesModulePromise
}

async function loadPlannerDispatchModule() {
  if (!plannerDispatchModulePromise) {
    plannerDispatchModulePromise = import('../dispatch')
      .then((module) => {
        const createDispatch = module?.createDispatch
        if (typeof createDispatch !== 'function') {
          throw new Error('Módulo de dispatch do planner inválido.')
        }
        return { createDispatch }
      })
      .catch((error) => {
        plannerDispatchModulePromise = null
        throw error
      })
  }
  return plannerDispatchModulePromise
}

async function loadPlannerModeModule() {
  if (!plannerModeModulePromise) {
    plannerModeModulePromise = import('../mode')
      .then((module) => {
        const plannerModeView = module?.plannerModeView
        if (typeof plannerModeView !== 'function') {
          throw new Error('Módulo de modo do planner inválido.')
        }
        return {
          plannerModeView,
          readyPlannerModeStorage: module?.readyPlannerModeStorage
        }
      })
      .catch((error) => {
        plannerModeModulePromise = null
        throw error
      })
  }
  return plannerModeModulePromise
}

async function loadPlannerSendersTickModule() {
  if (!plannerSendersTickModulePromise) {
    plannerSendersTickModulePromise = import('./senders-tick')
      .then((module) => {
        const updateSendersPerSecond = module?.updateSendersPerSecond
        if (typeof updateSendersPerSecond !== 'function') {
          throw new Error('Módulo de tick dos remetentes do planner inválido.')
        }
        return { updateSendersPerSecond }
      })
      .catch((error) => {
        plannerSendersTickModulePromise = null
        throw error
      })
  }
  return plannerSendersTickModulePromise
}

export async function warmupPlannerView({ level = 'idle' } = {}) {
  await plannerTargetsDraftCore.ready?.()
  const normalizedLevel = String(level || 'idle').trim().toLowerCase()
  const preloadTasks = [
    loadPlannerPopupModule(),
    loadPlannerTargetModules(),
    loadPlannerTargetsNavigatorModule(),
    loadPlannerTargetsMapInfoModule()
  ]
  if (normalizedLevel === 'idle') {
    preloadTasks.push(loadPlannerTableModule())
  }
  await Promise.allSettled(preloadTasks)
}

function requestFarmTerminateForPlannerSend() {
  const closeFarmButton = document.querySelector('#twbot-ifr-popup button[title^="Fechar"]')
  closeFarmButton?.click?.()

  window.postMessage({
    source: 'PLANNER',
    target: 'GO-FARM',
    action: 'set-farm-active',
    args: { active: false }
  })
}

function beginPlannerSendExecution() {
  if (plannerSendRunning.is_active('plannerSend') || plannerSendRunning.is_active('plannerSendPreempt')) {
    return false
  }

  const runtime = new Running()
  plannerSendPreemptPausedKeys = []
  ;['marketCall', 'marketPull', 'marketOffer'].forEach((key) => {
    const state = runtime.getState(key)
    if (!state?.active || state?.status !== Running.STATUS.RUNNING) return
    runtime.pause(key, { reason: 'plannerSend' })
    plannerSendPreemptPausedKeys.push(key)
  })

  plannerSendRunning.activate('plannerSendPreempt')
  try {
    requestFarmTerminateForPlannerSend()
    plannerSendRunning.activate('plannerSend')
    return true
  } finally {
    plannerSendRunning.remove('plannerSendPreempt')
  }
}

function endPlannerSendExecution() {
  const runtime = new Running()
  plannerSendPreemptPausedKeys.forEach((key) => {
    const state = runtime.getState(key)
    if (!state?.active || state?.status !== Running.STATUS.PAUSED) return
    runtime.resume(key, { reason: 'plannerSend-resume' })
  })
  plannerSendPreemptPausedKeys = []

  plannerSendRunning.remove('plannerSend')
  plannerSendRunning.remove('plannerSendPreempt')
}

function getPlannerCurrentTargetForTable() {
  if (plannerTargetCurrent && typeof plannerTargetCurrent === 'object') return plannerTargetCurrent
  if (plannerSeedTargetCurrent && typeof plannerSeedTargetCurrent === 'object') return plannerSeedTargetCurrent
  if (plannerDataCurrent && typeof plannerDataCurrent === 'object') return plannerDataCurrent
  return null
}

function renderPlannerSendersTable({ preserveSelection = true } = {}) {
  if (!Array.isArray(sendersDataCurrent)) return null
  if (!document.querySelector('#go-planner-senders')) return null
  if (!plannerTableViewApi || typeof plannerTableViewApi.insert !== 'function') return null

  const selectedVillageIds = preserveSelection
    ? (cancelEvents.unbindPlannerTableView?.getSelectedVillageIds?.() || [])
    : []
  const modeForTable = getActiveDispatchMode()
  const currentTarget = getPlannerCurrentTargetForTable()
  const targetIdRaw = Number(currentTarget?.id)
  const targetId = Number.isFinite(targetIdRaw) ? Math.trunc(targetIdRaw) : null
  const targetPlayerIdRaw = Number(currentTarget?.playerId ?? currentTarget?.player_id)
  const targetPlayerId = Number.isFinite(targetPlayerIdRaw) ? targetPlayerIdRaw : null
  const targetX = Number(currentTarget?.x)
  const targetY = Number(currentTarget?.y)

  if ((!calculateDistance || typeof calculateDistance?.get !== 'function') && Number.isFinite(targetX) && Number.isFinite(targetY)) {
    calculateDistance = new Distance({ x: targetX, y: targetY })
  }

  cancelEventPlannerTableView()
  cancelEvents.unbindPlannerTableView = plannerTableViewApi.insert(
    sendersDataCurrent,
    calculateDistance,
    targetId,
    targetPlayerId,
    dateTimeValue,
    templateStatsCurrent,
    fakeLimitPercent,
    snobMaxDistance,
    nightBonusConfig,
    templateStatsHintCurrent,
    modeForTable,
    getConflictTroopsModeForTable(modeForTable),
    minSpyCommand,
    {
      selectedVillageIds,
      selectedGroupId: defaultGroupId
    }
  )
  currentTableDispatchMode = modeForTable
  updateDispatchButtonsState()
  return cancelEvents.unbindPlannerTableView
}

function syncPlannerActiveTargetFromPreview({
  village = null,
  target = null,
  source = 'preview',
  rerenderTable = true
} = {}) {
  const nextX = Number(village?.x ?? target?.x)
  const nextY = Number(village?.y ?? target?.y)
  if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return false

  const prevTarget = (plannerTargetCurrent && typeof plannerTargetCurrent === 'object') ? plannerTargetCurrent : null
  const prevKey = prevTarget ? `${Number(prevTarget?.x)}|${Number(prevTarget?.y)}` : ''
  const nextKey = `${nextX}|${nextY}`
  const nextIdRaw = Number(village?.id ?? target?.id)
  const nextPlayerIdRaw = Number(village?.playerId ?? village?.owner ?? target?.playerId ?? target?.owner)
  const nextName = String(village?.name || target?.name || '').trim()

  const nextPlannerTarget = {
    ...(prevTarget && prevKey === nextKey ? prevTarget : {}),
    ...(Number.isFinite(nextIdRaw) ? { id: Math.trunc(nextIdRaw) } : {}),
    x: nextX,
    y: nextY,
    playerId: Number.isFinite(nextPlayerIdRaw) ? nextPlayerIdRaw : null,
    ...(nextName ? { name: nextName } : {}),
    k: parseFiniteNumber(village?.k ?? target?.k) ?? calcContinentFromCoords(nextX, nextY) ?? null
  }

  const prevTargetSignature = JSON.stringify({
    id: Number.isFinite(Number(prevTarget?.id)) ? Number(prevTarget.id) : null,
    x: Number.isFinite(Number(prevTarget?.x)) ? Number(prevTarget.x) : null,
    y: Number.isFinite(Number(prevTarget?.y)) ? Number(prevTarget.y) : null,
    playerId: Number.isFinite(Number(prevTarget?.playerId)) ? Number(prevTarget.playerId) : null,
    k: Number.isFinite(Number(prevTarget?.k)) ? Number(prevTarget.k) : null
  })
  const nextTargetSignature = JSON.stringify({
    id: Number.isFinite(Number(nextPlannerTarget?.id)) ? Number(nextPlannerTarget.id) : null,
    x: nextX,
    y: nextY,
    playerId: Number.isFinite(Number(nextPlannerTarget?.playerId)) ? Number(nextPlannerTarget.playerId) : null,
    k: Number.isFinite(Number(nextPlannerTarget?.k)) ? Number(nextPlannerTarget.k) : null
  })

  plannerTargetCurrent = nextPlannerTarget

  let distanceChanged = false
  if (!calculateDistance || prevKey !== nextKey) {
    calculateDistance = new Distance({ x: nextX, y: nextY })
    distanceChanged = true
  }

  const prevTargetNightSignature = buildNightBonusSignature(nightBonusConfigTarget)
  const prevEffectiveNightSignature = buildNightBonusSignature(nightBonusConfig)
  const nextTargetNightConfig = resolveTargetNightBonusConfigFromStateOrCache({
    target: nextPlannerTarget,
    fallbackMeta: village,
    preferSource: village
  }) || null
  nightBonusConfigTarget = nextTargetNightConfig
  nightBonusConfig = resolveEffectiveNightBonusConfig({
    worldConfig: nightBonusConfigWorld,
    targetConfig: nightBonusConfigTarget
  })
  const nextTargetNightSignature = buildNightBonusSignature(nightBonusConfigTarget)
  const nextEffectiveNightSignature = buildNightBonusSignature(nightBonusConfig)
  const nightBonusChanged = (
    prevTargetNightSignature !== nextTargetNightSignature
    || prevEffectiveNightSignature !== nextEffectiveNightSignature
  )

  if (rerenderTable && (distanceChanged || nightBonusChanged || prevTargetSignature !== nextTargetSignature)) {
    renderPlannerSendersTable({ preserveSelection: true })
  } else {
    updateDispatchButtonsState()
  }

  return true
}

async function readPlannerLastReport() {
  return await readPlannerLastReportStorage()
}

async function writePlannerLastReport(report) {
  const payload = await writePlannerLastReportStorage(report)
  void syncPlannerLastReportIndicatorUiCurrent?.()
  return payload
}

async function mergePlannerLastReport({
  reportId = null,
  startedAtMs = null,
  patch = null
} = {}) {
  if (!patch || typeof patch !== 'object') return null
  const prev = await readPlannerLastReport()
  const normalizedReportId = trimPlannerString(reportId)
  const canMerge = Boolean(
    normalizedReportId
    && prev
    && typeof prev === 'object'
    && trimPlannerString(prev?.reportId) === normalizedReportId
  )
  const base = canMerge ? prev : {}
  const createdAt = canMerge
    ? Number(prev?.createdAt)
    : (Number.isFinite(Number(startedAtMs)) ? Number(startedAtMs) : Date.now())
  return await writePlannerLastReport({
    ...base,
    ...patch,
    reportId: normalizedReportId || trimPlannerString(base?.reportId) || null,
    createdAt,
    settings: {
      ...(base?.settings && typeof base.settings === 'object' ? base.settings : {}),
      ...(patch?.settings && typeof patch.settings === 'object' ? patch.settings : {})
    },
    target: patch?.target === undefined ? (base?.target || null) : patch.target,
    payload: patch?.payload === undefined ? (base?.payload || null) : patch.payload,
    distribution: patch?.distribution === undefined ? (base?.distribution || null) : patch.distribution,
    execution: patch?.execution === undefined ? (base?.execution || null) : patch.execution
  })
}

async function recoverUnexpectedInterruptionBeforeNextExecution() {
  const state = await getUnexpectedInterruptionState({
    report: await readPlannerLastReport(),
    draftCore: plannerTargetsDraftCore
  })
  if (!state) return null
  return await applyUnexpectedInterruptionRecovery({
    state,
    draftCore: plannerTargetsDraftCore,
    writeReport: writePlannerLastReport
  })
}

function writePlannerTargetsDraft(draft) {
  if (!draft || typeof draft !== 'object') {
    plannerTargetsDraftCore.removeDraft?.(activeTargetsDraftIdCurrent ? { draftId: activeTargetsDraftIdCurrent } : {})
    targetsDraftPersistSignatureCurrent = null
    return null
  }
  return plannerTargetsDraftCore.writeDraft?.(
    draft,
    activeTargetsDraftIdCurrent ? { draftId: activeTargetsDraftIdCurrent } : {}
  ) || null
}

function formatLastReportDate(value) {
  const ms = Number(value)
  if (!Number.isFinite(ms)) return '---'
  try {
    return new Date(ms).toLocaleString('pt-BR')
  } catch (_) {
    return String(ms)
  }
}

function formatPlannerDurationMinutes(value) {
  const ms = Number(value)
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const totalSeconds = Math.max(1, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatPlannerLastReportTitle(report) {
  if (!report || typeof report !== 'object') return 'Último envio: sem dados'
  const modeLabel = (value) => {
    const normalized = String(value || '').trim().toLowerCase()
    if (normalized === 'schedule' || normalized === 'agendar') return 'Agendamento'
    if (normalized === 'send' || normalized === 'enviar') return 'Envio'
    return normalized ? String(value) : '---'
  }
  const scopeLabel = (value) => {
    const normalized = String(value || '').trim().toLowerCase()
    if (normalized === 'multi' || normalized === 'many' || normalized === 'multiple') return 'Todos os Alvos'
    if (normalized === 'current' || normalized === 'single') return 'Alvo atual'
    return normalized ? String(value) : '---'
  }
  const distributionLabel = (value) => {
    const normalized = String(value || '').trim().toLowerCase()
    if (normalized === 'closest') return 'Mais próximas'
    if (normalized === 'furthest') return 'Mais distantes'
    return ''
  }
  const engineLabel = (value) => {
    const normalized = String(value || '').trim().toLowerCase()
    if (normalized === 'min_cost_max_flow') return 'Otimizado'
    if (normalized === 'sender_first') return 'Padrão'
    return ''
  }
  const commandLabel = (value) => {
    const normalized = String(value || '').trim().toLowerCase()
    if (normalized === 'support' || normalized === 'defense' || normalized === 'defesa') return 'Defesa'
    if (normalized === 'attack' || normalized === 'ataque') return 'Ataque'
    return ''
  }
  const settings = (report?.settings && typeof report.settings === 'object') ? report.settings : {}
  const distributionMeta = (report?.distribution?.meta && typeof report.distribution.meta === 'object') ? report.distribution.meta : {}
  const distributionSettings = (report?.distribution?.settings && typeof report.distribution.settings === 'object') ? report.distribution.settings : {}
  const payload = (report?.payload && typeof report.payload === 'object') ? report.payload : {}
  const execution = (report?.execution && typeof report.execution === 'object') ? report.execution : {}
  const targetCount = Math.max(
    plannerPickInt(settings.targetCount),
    Array.isArray(payload?.targets) ? payload.targets.length : 0,
    String(settings?.targetScope || '').trim().toLowerCase() === 'current' ? 1 : 0
  )
  const totalCommands = Math.max(
    plannerPickInt(settings.totalCommands),
    plannerPickInt(distributionMeta.requestedCount),
    Array.isArray(payload?.targets)
      ? payload.targets.reduce((sum, item) => sum + plannerPickInt(item?.qty), 0)
      : 0,
    plannerPickInt(execution.total)
  )
  const selectedVillageCount = plannerPickInt(settings.selectedVillageCount)
  const distributedCount = Math.max(
    plannerPickInt(settings.distributedCount),
    plannerPickInt(distributionMeta.assignedCount),
    plannerPickInt(distributionMeta.commandsCount)
  )
  const distributionDiff = Math.max(
    plannerPickInt(settings.distributionDiff),
    Math.max(0, totalCommands - distributedCount)
  )
  const sentCount = Math.max(plannerPickInt(settings.sentCount), plannerPickInt(execution.success))
  const errorCount = Math.max(
    plannerPickInt(settings.errorCount),
    plannerPickInt(execution.failed) + plannerPickInt(execution.pending)
  )
  const durationText = formatPlannerDurationMinutes(settings.durationMs)
  const titleMode = settings.mode || (report?.kind === 'schedule' ? 'schedule' : 'send')
  const titleLabel = `Último ${modeLabel(titleMode)}`
  const lines = []
  lines.push(titleLabel)
  if (targetCount > 0) lines.push(`Alvos: ${targetCount}`)
  if (totalCommands > 0) lines.push(`Comandos: ${totalCommands}`)
  if (Number.isFinite(Number(settings.selectedVillageCount))) lines.push(`Vilas selecionadas: ${selectedVillageCount}`)
  const commandText = commandLabel(settings.commandType)
  if (commandText) lines.push(`Comando: ${commandText}`)
  const scopeText = scopeLabel(settings.targetScope)
  if (scopeText) lines.push(`Escopo: ${scopeText}`)
  const reportEndedAt = Number.isFinite(Number(report?.updatedAt)) ? Number(report.updatedAt) : Number(report?.createdAt)
  if (Number.isFinite(reportEndedAt)) lines.push(`Término: ${formatLastReportDate(reportEndedAt)}`)
  if (durationText) lines.push(`Duração: ${durationText}`)
  const distributionText = distributionLabel(settings.typeGenerate)
  if (distributionText) lines.push(`Distribuição: ${distributionText}`)
  const engineText = engineLabel(distributionMeta.distributionMode || distributionSettings.distributionMode || settings.distributionMode)
  if (engineText) lines.push(`Motor: ${engineText}`)
  if (typeof settings.scapeTheNight === 'boolean') lines.push(`Escapar BN: ${settings.scapeTheNight ? 'Sim' : 'Não'}`)
  if (distributedCount > 0 || distributionDiff > 0) lines.push(`Distribuídos: ${distributedCount}`)
  if (distributionDiff > 0) lines.push(`Diferença de distribuição: ${distributionDiff}`)
  const captchaErrorCount = plannerPickInt(settings.captchaErrorCount)
  const unexpectedErrorCount = plannerPickInt(settings.unexpectedErrorCount)
  const regularErrorCount = Math.max(0, errorCount - captchaErrorCount - unexpectedErrorCount)
  if (sentCount > 0 || errorCount > 0) lines.push(`Enviados: ${sentCount}`)
  if (regularErrorCount > 0) lines.push(`Erros: ${regularErrorCount}`)
  if (captchaErrorCount > 0) lines.push(`Erro captcha: ${captchaErrorCount}`)
  if (unexpectedErrorCount > 0) lines.push(`Erro inesperado: ${unexpectedErrorCount}`)
  return lines.join('<br>')
}

function toPlannerNonNegativeInt(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return Math.floor(parsed)
}

function trimPlannerString(value) {
  return String(value || '').trim()
}

function plannerPickInt(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  return Math.max(0, Math.floor(num))
}

function escapePlannerHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function pickPlannerDiagTarget(target = null) {
  const source = (target && typeof target === 'object') ? target : {}
  const x = Number(source?.x)
  const y = Number(source?.y)
  const out = {
    id: Number.isFinite(Number(source?.id)) ? Number(source.id) : null,
    x: Number.isFinite(x) ? x : null,
    y: Number.isFinite(y) ? y : null
  }
  if (source?.name) out.name = String(source.name)
  return out
}

function normalizePlannerDiagStage(stage = {}) {
  const source = (stage && typeof stage === 'object') ? stage : {}
  const messages = Array.isArray(source.messages)
    ? source.messages.map((msg) => trimPlannerString(msg)).filter(Boolean).slice(0, 6)
    : []
  return {
    errorCount: plannerPickInt(source.errorCount),
    payloadMissingCount: plannerPickInt(source.payloadMissingCount),
    noAttackCount: plannerPickInt(source.noAttackCount),
    bnBlockedCount: plannerPickInt(source.bnBlockedCount),
    missingSenderCount: plannerPickInt(source.missingSenderCount),
    messages
  }
}

function normalizePlannerDispatchDiagnostics(input = {}) {
  const source = (input && typeof input === 'object') ? input : {}
  const partialSource = (source.partial && typeof source.partial === 'object') ? source.partial : {}
  const causesSource = (source.causes && typeof source.causes === 'object') ? source.causes : {}
  return {
    preparation: normalizePlannerDiagStage(source.preparation),
    confirmation: normalizePlannerDiagStage(source.confirmation),
    send: normalizePlannerDiagStage(source.send),
    partial: {
      commandsAdjustedCount: plannerPickInt(partialSource.commandsAdjustedCount),
      troopsRedistributedCount: plannerPickInt(partialSource.troopsRedistributedCount),
      attacksReducedCount: plannerPickInt(partialSource.attacksReducedCount),
      sentWithAdjustmentsCount: plannerPickInt(partialSource.sentWithAdjustmentsCount),
      sentWithTroopsRedistributedCount: plannerPickInt(partialSource.sentWithTroopsRedistributedCount),
      sentWithReducedAttacksCount: plannerPickInt(partialSource.sentWithReducedAttacksCount),
      requestedAttackCountMin: plannerPickInt(partialSource.requestedAttackCountMin),
      requestedAttackCountMax: plannerPickInt(partialSource.requestedAttackCountMax),
      reducedAttackDetails: Array.isArray(partialSource.reducedAttackDetails)
        ? partialSource.reducedAttackDetails.map((msg) => trimPlannerString(msg)).filter(Boolean).slice(0, 6)
        : [],
      messages: Array.isArray(partialSource.messages)
        ? partialSource.messages.map((msg) => trimPlannerString(msg)).filter(Boolean).slice(0, 6)
        : []
    },
    causes: {
      timeoutCount: plannerPickInt(causesSource.timeoutCount),
      bnCount: plannerPickInt(causesSource.bnCount),
      troopsCount: plannerPickInt(causesSource.troopsCount),
      limitCount: plannerPickInt(causesSource.limitCount),
      captchaCount: plannerPickInt(causesSource.captchaCount),
      payloadCount: plannerPickInt(causesSource.payloadCount),
      noAttackCount: plannerPickInt(causesSource.noAttackCount)
    }
  }
}

function hasPlannerTimeoutLikeMessage(messages = []) {
  return (Array.isArray(messages) ? messages : []).some((msg) => {
    const text = trimPlannerString(msg).toLowerCase()
    return (
      text.includes('timeout')
      || text.includes('time out')
      || text.includes('timed out')
      || text.includes('tempo esgotado')
      || text.includes('tempo limite')
    )
  })
}

function hasPlannerTroopsLikeMessage(messages = []) {
  return (Array.isArray(messages) ? messages : []).some((msg) => {
    const text = trimPlannerString(msg).toLowerCase()
    return (
      text.includes('conflito de tropas')
      || text.includes('tropas redistribu')
      || text.includes('tropas foram divididas')
    )
  })
}

function hasPlannerLimitLikeMessage(messages = []) {
  return (Array.isArray(messages) ? messages : []).some((msg) => {
    const text = trimPlannerString(msg).toLowerCase()
    return (
      text.includes('fake limit')
      || text.includes('limite mínimo')
      || text.includes('limite de ataques')
      || text.includes('ataques disponíveis')
      || text.includes('unidade mais lenta')
      || text.includes('máximo')
    )
  })
}

function buildPlannerDispatchAttackLabel(partial = {}) {
  const min = plannerPickInt(partial?.requestedAttackCountMin)
  const max = plannerPickInt(partial?.requestedAttackCountMax)
  if (min > 0 && max > 0) {
    return min === max ? String(max) : `${min}-${max}`
  }
  const reducedDetails = Array.isArray(partial?.reducedAttackDetails) ? partial.reducedAttackDetails : []
  const requestedCounts = reducedDetails
    .map((item) => {
      const match = trimPlannerString(item).match(/\/(\d+)$/)
      return match ? plannerPickInt(match[1]) : 0
    })
    .filter((value) => value > 0)
  if (!requestedCounts.length) return ''
  const requestedMin = Math.min(...requestedCounts)
  const requestedMax = Math.max(...requestedCounts)
  return requestedMin === requestedMax ? String(requestedMax) : `${requestedMin}-${requestedMax}`
}

function buildPlannerDispatchReducedAttackDetails(partial = {}) {
  const reducedDetails = Array.isArray(partial?.reducedAttackDetails) ? partial.reducedAttackDetails : []
  if (!reducedDetails.length) return ''
  const preview = reducedDetails.slice(0, 3).join(', ')
  if (reducedDetails.length <= 3) return preview
  return `${preview} +${reducedDetails.length - 3}`
}

function formatPlannerDispatchCauseMessage(message = '') {
  const text = trimPlannerString(message)
  if (!text) return ''
  return text.length > 72 ? `${text.slice(0, 69)}...` : text
}

function buildPlannerDispatchCauseLabels(normalized = null) {
  const status = normalized?.status || {}
  const diagnostics = status?.diagnostics || {}
  const prep = diagnostics.preparation || {}
  const confirm = diagnostics.confirmation || {}
  const send = diagnostics.send || {}
  const partial = diagnostics.partial || {}
  const causesMeta = diagnostics.causes || {}
  const causes = []
  let countedCauseQty = 0
  const pushCause = (label, count = 0) => {
    const safeLabel = trimPlannerString(label)
    const safeCount = plannerPickInt(count)
    if (!safeLabel) return
    causes.push(safeCount > 0 ? `${safeLabel} ${safeCount}` : safeLabel)
    countedCauseQty += safeCount
  }
  const pushSendCause = (label, count = 0) => {
    const safeLabel = trimPlannerString(label)
    if (!safeLabel) return
    pushCause(`Envio(${safeLabel})`, count)
  }
  const confirmationBnBlockedCount = plannerPickInt(confirm.bnBlockedCount)
  const distributionShortfall = plannerPickInt(status.remainingQty)
  const requestedQty = plannerPickInt(status.requestedQty)
  const sendOkQty = plannerPickInt(status.sendOkQty)
  const sendFailQty = plannerPickInt(status.sendFailQty)
  const sendPendingQty = plannerPickInt(status.sendPendingQty)
  const payloadMissingCount = Math.max(
    plannerPickInt(causesMeta.payloadCount),
    plannerPickInt(prep.payloadMissingCount) + plannerPickInt(confirm.payloadMissingCount) + plannerPickInt(send.payloadMissingCount)
  )
  const noAttackCount = Math.max(
    plannerPickInt(causesMeta.noAttackCount),
    plannerPickInt(prep.noAttackCount) + plannerPickInt(confirm.noAttackCount) + plannerPickInt(send.noAttackCount)
  )
  const missingSenderCount = plannerPickInt(prep.missingSenderCount)
  const reducedAttacksCount = Math.max(
    plannerPickInt(partial.attacksReducedCount),
    plannerPickInt(partial.sentWithReducedAttacksCount)
  )
  const timeoutCount = plannerPickInt(causesMeta.timeoutCount)
  const bnCount = Math.max(plannerPickInt(causesMeta.bnCount), confirmationBnBlockedCount)
  const troopsCount = plannerPickInt(causesMeta.troopsCount)
  const limitCount = plannerPickInt(causesMeta.limitCount)
  const captchaCount = plannerPickInt(causesMeta.captchaCount)
  const unexpectedCount = plannerPickInt(causesMeta.unexpectedCount)
  const partialMessages = Array.isArray(partial.messages) ? partial.messages : []
  const prepMessages = Array.isArray(prep.messages) ? prep.messages : []
  const confirmMessages = Array.isArray(confirm.messages) ? confirm.messages : []
  const sendMessages = Array.isArray(send.messages) ? send.messages : []
  const allMessages = [...prepMessages, ...confirmMessages, ...sendMessages, ...partialMessages]
  const totalErrorQty = Math.max(
    0,
    requestedQty - sendOkQty,
    distributionShortfall + sendFailQty + sendPendingQty
  )

  if (distributionShortfall > 0) pushCause('Distribuição', distributionShortfall)
  if (bnCount > 0) pushSendCause('BN', bnCount)
  if (missingSenderCount > 0) pushCause('Origem', missingSenderCount)
  if (payloadMissingCount > 0) pushCause('Payload', payloadMissingCount)
  if (noAttackCount > 0) pushCause('Sem ataque', noAttackCount)
  if (troopsCount > 0) pushSendCause('Tropa', troopsCount)
  else if (hasPlannerTroopsLikeMessage(allMessages)) pushSendCause('Tropa')
  if (limitCount > 0) pushSendCause('Limite', limitCount)
  else if (hasPlannerLimitLikeMessage(allMessages)) pushSendCause('Limite')
  if (timeoutCount > 0) pushSendCause('Timeout', timeoutCount)
  if (captchaCount > 0) pushSendCause('Captcha', captchaCount)
  if (unexpectedCount > 0) pushCause('Indeterminado', unexpectedCount)

  const stageErrors = [
    {
      label: 'Preparação',
      count: plannerPickInt(prep.errorCount),
      messages: prepMessages,
      alreadyClassified: plannerPickInt(prep.payloadMissingCount) > 0 || plannerPickInt(prep.noAttackCount) > 0 || missingSenderCount > 0
    },
    {
      label: 'Confirmação',
      count: plannerPickInt(confirm.errorCount),
      messages: confirmMessages,
      alreadyClassified: plannerPickInt(confirm.payloadMissingCount) > 0 || plannerPickInt(confirm.noAttackCount) > 0 || confirmationBnBlockedCount > 0
    },
    {
      label: 'Envio',
      count: plannerPickInt(send.errorCount),
      messages: sendMessages,
      alreadyClassified: plannerPickInt(send.payloadMissingCount) > 0 || plannerPickInt(send.noAttackCount) > 0
    }
  ]
  stageErrors.forEach(({ label, count, messages, alreadyClassified }) => {
    if (count <= 0) return
    if (captchaCount > 0 || hasPlannerCaptchaLikeMessage(messages)) {
      if (captchaCount > 0) return
      pushSendCause('Captcha', count)
      return
    }
    if (timeoutCount > 0 || hasPlannerTimeoutLikeMessage(messages)) {
      if (timeoutCount > 0) return
      pushSendCause('Timeout', count)
      return
    }
    if (alreadyClassified) return
    const firstMessage = formatPlannerDispatchCauseMessage(Array.isArray(messages) ? messages[0] : '')
    if (firstMessage) {
      pushCause(`${label}(${firstMessage})`, count)
      return
    }
    pushCause(label, count)
  })

  if (reducedAttacksCount > 0) {
    const details = buildPlannerDispatchReducedAttackDetails(partial)
    causes.push(
      `${reducedAttacksCount} comando(s) com menos ataques${details ? ` (${details})` : ''}`
    )
  }

  const unresolvedErrorQty = Math.max(0, totalErrorQty - countedCauseQty)
  if (unresolvedErrorQty > 0) {
    if (distributionShortfall > 0) pushCause('Distribuição', unresolvedErrorQty)
    else if (hasPlannerCaptchaLikeMessage(allMessages)) pushSendCause('Captcha', unresolvedErrorQty)
    else if (hasPlannerTimeoutLikeMessage(allMessages)) pushSendCause('Timeout', unresolvedErrorQty)
    else if (hasPlannerTroopsLikeMessage(allMessages)) pushSendCause('Tropa', unresolvedErrorQty)
    else if (hasPlannerLimitLikeMessage(allMessages)) pushSendCause('Limite', unresolvedErrorQty)
    else {
      const failureStage = detectPlannerDispatchFailureStage(normalized)
      const failureStageLabel = plannerDispatchFailureStageLabel(failureStage)
      const stageMessages = (
        failureStage === 'preparation' ? prepMessages
          : failureStage === 'confirmation' ? confirmMessages
            : failureStage === 'send' ? sendMessages
              : []
      )
      const firstMessage = formatPlannerDispatchCauseMessage(Array.isArray(stageMessages) ? stageMessages[0] : '')
      if (failureStageLabel && firstMessage) pushCause(`${failureStageLabel}(${firstMessage})`, unresolvedErrorQty)
      else if (failureStageLabel) pushCause(failureStageLabel, unresolvedErrorQty)
    }
  }

  return causes
}

function buildPlannerDispatchOutcomeSummary(normalized = null) {
  const status = normalized?.status || {}
  const diagnostics = status?.diagnostics || {}
  const partial = diagnostics.partial || {}
  const requestedQty = plannerPickInt(status.requestedQty)
  const sentQty = plannerPickInt(status.sendOkQty)
  const errorQty = Math.max(0, requestedQty - sentQty)
  const troopsRedistributedQty = Math.max(
    plannerPickInt(partial.troopsRedistributedCount),
    plannerPickInt(partial.sentWithTroopsRedistributedCount)
  )
  const reducedAttacksQty = Math.max(
    plannerPickInt(partial.attacksReducedCount),
    plannerPickInt(partial.sentWithReducedAttacksCount)
  )
  const hasErrors = errorQty > 0 || plannerPickInt(status.sendFailQty) > 0 || plannerPickInt(status.sendPendingQty) > 0 || plannerPickInt(status.remainingQty) > 0
  const hasWarnings = troopsRedistributedQty > 0 || reducedAttacksQty > 0
  const badgeVariant = hasErrors ? 'error' : (hasWarnings ? 'partial' : 'ok')
  const badgeLabel = `${hasErrors ? 'Erro' : 'OK'} ${sentQty}/${requestedQty || sentQty}`
  const lines = []

  if (!hasErrors && !hasWarnings) {
    lines.push('Envio 100%')
  } else {
    if (hasErrors) {
      lines.push(`Erro: ${errorQty}`)
    }
    const attackLabel = buildPlannerDispatchAttackLabel(partial)
    if (!hasErrors && reducedAttacksQty <= 0 && troopsRedistributedQty > 0 && requestedQty > 0) {
      lines.push(`Redistribuido tropas: ${troopsRedistributedQty}/${requestedQty}`)
    }
    if ((hasErrors || reducedAttacksQty > 0) && troopsRedistributedQty > 0 && requestedQty > 0) {
      lines.push(`Redistribuido: ${troopsRedistributedQty}/${requestedQty}`)
    }
    if (attackLabel && (reducedAttacksQty > 0 || hasErrors)) {
      lines.push(`Ataques/comando: ${attackLabel}`)
    }
    if (!hasErrors && reducedAttacksQty > 0) {
      const details = buildPlannerDispatchReducedAttackDetails(partial)
      lines.push(`Causa: ${reducedAttacksQty} comando(s) saíram com menos ataques${details ? `: ${details}` : ''}`)
    }
    if (hasErrors) {
      const causes = buildPlannerDispatchCauseLabels(normalized)
      if (causes.length) lines.push(`Causa: ${causes.join(' | ')}`)
    }
  }

  return {
    badgeVariant,
    badgeLabel,
    titleLines: lines,
    titleHtml: lines.map((line) => escapePlannerHtml(line)).join('<br>')
  }
}

function buildPlannerDispatchFormatterInput(item = {}) {
  const source = (item && typeof item === 'object') ? item : {}
  const status = (source.status && typeof source.status === 'object') ? source.status : source
  const target = pickPlannerDiagTarget(source.target || status.target || null)
  const keyFromTarget = (
    Number.isFinite(Number(target?.x)) && Number.isFinite(Number(target?.y))
      ? `${Number(target.x)}|${Number(target.y)}`
      : null
  )
  return {
    index: plannerPickInt(source.index),
    key: trimPlannerString(source.key) || keyFromTarget || null,
    target,
    status: {
      requestedQty: plannerPickInt(status.requestedQty),
      distributedQty: plannerPickInt(status.distributedQty),
      remainingQty: plannerPickInt(status.remainingQty),
      sendOkQty: plannerPickInt(status.sendOkQty ?? status.success),
      sendFailQty: plannerPickInt(status.sendFailQty ?? status.failed),
      sendPendingQty: plannerPickInt(status.sendPendingQty ?? status.pending),
      retryQty: plannerPickInt(status.retryQty),
      bnBlockedCount: plannerPickInt(status.bnBlockedCount),
      diagnostics: normalizePlannerDispatchDiagnostics(status.diagnostics)
    }
  }
}

function hasPlannerCaptchaLikeMessage(messages = []) {
  return (Array.isArray(messages) ? messages : []).some((msg) => {
    const text = trimPlannerString(msg).toLowerCase()
    return (
      text.includes('captcha')
      || text.includes('bot protect')
      || text.includes('bot-protect')
      || text.includes('bot protection')
      || text.includes('bot_check')
      || text.includes('bot check')
    )
  })
}

function detectPlannerDispatchFailureStage(normalized = null) {
  const status = normalized?.status || {}
  const diagnostics = status?.diagnostics || {}
  const prep = diagnostics.preparation || {}
  const confirm = diagnostics.confirmation || {}
  const send = diagnostics.send || {}

  if (plannerPickInt(prep.errorCount) > 0 || plannerPickInt(prep.payloadMissingCount) > 0 || plannerPickInt(prep.noAttackCount) > 0 || plannerPickInt(prep.missingSenderCount) > 0) return 'preparation'
  if (plannerPickInt(confirm.errorCount) > 0 || plannerPickInt(confirm.payloadMissingCount) > 0 || plannerPickInt(confirm.noAttackCount) > 0 || plannerPickInt(confirm.bnBlockedCount) > 0) return 'confirmation'
  if (plannerPickInt(send.errorCount) > 0 || plannerPickInt(send.payloadMissingCount) > 0 || plannerPickInt(send.noAttackCount) > 0) return 'send'
  if (plannerPickInt(status.remainingQty) > 0 || plannerPickInt(status.bnBlockedCount) > 0) return 'distribution'
  return null
}

function plannerDispatchFailureStageLabel(stage) {
  if (stage === 'distribution') return 'Distribuição'
  if (stage === 'preparation') return 'Preparação'
  if (stage === 'confirmation') return 'Confirmação'
  if (stage === 'send') return 'Envio'
  return null
}

function buildPlannerDispatchStatusTitleLines(normalized = null) {
  return buildPlannerDispatchOutcomeSummary(normalized).titleLines
}

function formatDispatchDiagnosticsItemLocal(item = {}) {
  const normalized = buildPlannerDispatchFormatterInput(item)
  const failureStage = detectPlannerDispatchFailureStage(normalized)
  const failureStageLabel = plannerDispatchFailureStageLabel(failureStage)
  const diagnostics = normalized.status.diagnostics
  const captchaDetected = (
    hasPlannerCaptchaLikeMessage(diagnostics.preparation.messages)
    || hasPlannerCaptchaLikeMessage(diagnostics.confirmation.messages)
    || hasPlannerCaptchaLikeMessage(diagnostics.send.messages)
  )
  const summary = buildPlannerDispatchOutcomeSummary(normalized)
  const titleLines = summary.titleLines
  return {
    index: normalized.index,
    key: normalized.key,
    target: normalized.target,
    status: normalized.status,
    formatted: {
      failureStage,
      failureStageLabel,
      captchaDetected,
      badgeVariant: summary.badgeVariant,
      badgeLabel: summary.badgeLabel,
      titleLines,
      titleHtml: summary.titleHtml
    }
  }
}

function buildDispatchDiagnosticsFormatItemFromStatus({
  target = null,
  requestedQty = 0,
  distributedQty = 0,
  remainingQty = 0,
  sendOkQty = 0,
  sendFailQty = 0,
  sendPendingQty = 0,
  retryQty = 0,
  bnBlockedCount = 0,
  diagnostics = null
} = {}) {
  const targetPayload = target && typeof target === 'object'
    ? {
      id: Number.isFinite(Number(target?.id)) ? Number(target.id) : null,
      x: Number(target?.x),
      y: Number(target?.y),
      ...(target?.name ? { name: String(target.name) } : {})
    }
    : null

  return {
    target: targetPayload,
    status: {
      requestedQty: toPlannerNonNegativeInt(requestedQty),
      distributedQty: toPlannerNonNegativeInt(distributedQty),
      remainingQty: toPlannerNonNegativeInt(remainingQty),
      sendOkQty: toPlannerNonNegativeInt(sendOkQty),
      sendFailQty: toPlannerNonNegativeInt(sendFailQty),
      sendPendingQty: toPlannerNonNegativeInt(sendPendingQty),
      retryQty: toPlannerNonNegativeInt(retryQty),
      bnBlockedCount: toPlannerNonNegativeInt(bnBlockedCount),
      diagnostics: (diagnostics && typeof diagnostics === 'object') ? diagnostics : null
    }
  }
}

function formatDispatchDiagnosticsBatchLocal(items = []) {
  const payloadItems = Array.isArray(items) ? items.filter(Boolean) : []
  if (!payloadItems.length) return []
  return payloadItems.map((item, index) => formatDispatchDiagnosticsItemLocal({ index, ...(item || {}) }))
}

function buildCurrentTargetDispatchStatusUi(target = null) {
  const dispatchStatus = getTargetDispatchStatus(target) || null
  if (!dispatchStatus) return null
  const requestedQty = Math.max(0, Math.floor(Number(dispatchStatus?.requestedQty) || 0))
  const distributedQty = Math.max(0, Math.floor(Number(dispatchStatus?.distributedQty) || 0))
  const remainingQty = Math.max(0, Math.floor(Number(dispatchStatus?.remainingQty) || 0))
  const sendOkQty = Math.max(0, Math.floor(Number(dispatchStatus?.sendOkQty) || 0))
  const sendFailQty = Math.max(0, Math.floor(Number(dispatchStatus?.sendFailQty) || 0))
  const sendPendingQty = Math.max(0, Math.floor(Number(dispatchStatus?.sendPendingQty) || 0))
  const retryQty = Math.max(0, Math.floor(Number(dispatchStatus?.retryQty) || 0))
  const bnBlockedCount = Math.max(0, Math.floor(Number(dispatchStatus?.bnBlockedCount) || 0))
  const hasDispatchStatus = [requestedQty, distributedQty, remainingQty, sendOkQty, sendFailQty, sendPendingQty, retryQty, bnBlockedCount].some((v) => v > 0)
  if (!hasDispatchStatus) return null
  const formatted = formatDispatchDiagnosticsItemLocal(buildDispatchDiagnosticsFormatItemFromStatus({
    target,
    requestedQty,
    distributedQty,
    remainingQty,
    sendOkQty,
    sendFailQty,
    sendPendingQty,
    retryQty,
    bnBlockedCount,
    diagnostics: dispatchStatus?.diagnostics
  }))
  const badgeVariant = String(formatted?.formatted?.badgeVariant || '').trim() || 'ok'
  const badgeLabel = String(formatted?.formatted?.badgeLabel || '').trim()
  if (!badgeLabel) return null
  return {
    badgeVariant,
    badgeLabel,
    titleHtml: String(formatted?.formatted?.titleHtml || '').trim()
  }
}

function syncCurrentPlannerTargetDispatchStatusUi(targetContent = null, target = null) {
  const root = targetContent?.querySelector?.('#go-target-content') || targetContent || document.querySelector('#go-target-content')
  if (!root) return null
  const targetSelect = root.querySelector('.target-select')
  if (!targetSelect) return null
  const prev = targetSelect.querySelector('[data-current-target-dispatch-status]')
  const ui = buildCurrentTargetDispatchStatusUi(target)
  if (!ui) {
    prev?.remove?.()
    return null
  }
  const next = prev || document.createElement('div')
  next.className = 'go-targets-nav-item-status'
  next.setAttribute('data-current-target-dispatch-status', '1')
  if (ui.titleHtml) next.setAttribute('data-title', ui.titleHtml)
  else next.removeAttribute('data-title')
  next.innerHTML = `<span class="go-targets-status-badge is-${escapeHtml(ui.badgeVariant)}">${escapeHtml(ui.badgeLabel)}</span>`
  if (!prev) targetSelect.insertAdjacentElement('beforeend', next)
  return next
}

function syncDispatchScopeSelectorUi() {
  const activeScope = getDispatchTargetScope()
  const hasMulti = hasTargetsNavigatorMultiAvailable()
  document.querySelectorAll('#go-target-content #place_target').forEach((item) => {
    item.classList.toggle('is-dispatch-scope-active', activeScope === 'current')
  })
  document.querySelectorAll('[data-targets-page]').forEach((node) => {
    node.classList.toggle('is-dispatch-scope-current', activeScope === 'current')
    node.classList.toggle('is-dispatch-scope-multi', activeScope === 'multi')
  })
  document.querySelectorAll('[data-dispatch-scope-selector]').forEach((node) => {
    const scope = normalizeDispatchTargetScope(node.getAttribute('data-dispatch-scope-selector'))
    const isActive = scope === activeScope
    const disabled = scope === 'multi' && !hasMulti
    node.classList.toggle('is-active', isActive)
    node.setAttribute('aria-checked', isActive ? 'true' : 'false')
    if ('disabled' in node) node.disabled = disabled
    const radio = node.querySelector('input[type="radio"]')
    if (radio) {
      radio.checked = isActive
      radio.disabled = disabled
    }
    if (scope === 'multi') {
      node.setAttribute('data-title', disabled
        ? 'Disponível quando houver lista de alvos'
        : 'Usa a lista de alvos e quantidades (qty > 0)')
    } else {
      node.setAttribute('data-title', 'Usa apenas o alvo atual')
    }
  })
}

function syncCurrentTargetScopeSelectorUi(targetContent = null) {
  const root = targetContent?.querySelector?.('#go-target-content') || targetContent || document.querySelector('#go-target-content')
  if (!root) return null
  const placeTargetEl = root.querySelector('#place_target')
  const item = root.querySelector('#place_target .village-item.read-only')
  const media = root.querySelector('#place_target .go-target-media')
  if (!item) return null
  item.setAttribute('data-title', 'Enviar apenas no alvo atual')
  if (!item.hasAttribute('data-dispatch-scope-bound')) {
    item.setAttribute('data-dispatch-scope-bound', '1')
    item.addEventListener('click', (event) => {
      if (event.target?.closest?.('a, button, input, label')) return
      setDispatchTargetScope('current')
      updateDispatchButtonsState()
    })
  }
  let button = root.querySelector('#place_target [data-dispatch-scope-selector="current"]')
  if (!button) {
    button = document.createElement('button')
    button.type = 'button'
    button.className = 'go-target-scope-selector'
    button.setAttribute('data-dispatch-scope-selector', 'current')
    button.setAttribute('aria-label', 'Enviar apenas no alvo atual')
    button.innerHTML = '<input type="radio" class="go-dispatch-scope-native-radio" name="go-dispatch-scope" tabindex="-1" aria-hidden="true">'
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      setDispatchTargetScope('current')
      updateDispatchButtonsState()
    })
    media?.insertAdjacentElement('beforeend', button)
  }
  placeTargetEl?.classList.toggle('is-dispatch-scope-active', getDispatchTargetScope() === 'current')
  syncDispatchScopeSelectorUi()
  return button
}

function ensurePlannerLastReportIndicator() {
  const titleMain = document.querySelector('.go-map-plan-title-main')
  if (!titleMain) return null
  let icon = titleMain.querySelector('[data-planner-last-report-icon]')
  if (!icon) {
    icon = document.createElement('button')
    icon.type = 'button'
    icon.className = 'go-planner-last-report-icon'
    icon.setAttribute('data-planner-last-report-icon', '1')
    icon.setAttribute('aria-label', 'Último envio')
    icon.innerHTML = `
      <img
        src="https://dsbr.innogamescdn.com/asset/c9b60b77/graphic/questionmark.webp"
        alt=""
        aria-hidden="true"
      >
    `
    icon.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
    })
    titleMain.insertAdjacentElement('beforeend', icon)
  }

  let youTube = titleMain.querySelector('[data-planner-youtube-link]')
  if (!youTube) {
    youTube = youtubeLinkImage('', (message, time) => {
      printMessage.error(message, time)
    })
    youTube.classList.add('go-planner-youtube-link')
    youTube.setAttribute('data-planner-youtube-link', '1')
    youTube.setAttribute('aria-label', 'Tutorial do planner')
    titleMain.insertBefore(youTube, icon)
  } else if (youTube.nextElementSibling !== icon) {
    titleMain.insertBefore(youTube, icon)
  }

  icon.hidden = true
  icon.removeAttribute('data-title')
  void (async() => {
    const report = await readPlannerLastReport()
    if (!icon.isConnected) return
    if (!report) {
      icon.hidden = true
      icon.removeAttribute('data-title')
      return
    }
    icon.hidden = false
    icon.setAttribute('data-title', formatPlannerLastReportTitle(report))
  })()
  return icon
}

function buildPlannerReportSettings({ context = {}, mode = 'send', plannerTarget = null, distributionMeta = null } = {}) {
  const multiTargetsPlan = context?.multiTargetsPlan || null
  const targetScope = String(context?.targetScope || 'current')
  const currentRequestedQty = getCurrentTargetRequestedQtyFromContext(context)
  const targetCount = String(context?.targetScope || 'current') === 'multi'
    ? (Array.isArray(multiTargetsPlan?.items) ? multiTargetsPlan.items.filter((item) => plannerPickInt(item?.qty) > 0).length : 0)
    : (plannerTarget ? 1 : 0)
  const totalCommands = targetScope === 'multi'
    ? (Array.isArray(multiTargetsPlan?.items)
      ? multiTargetsPlan.items.reduce((sum, item) => sum + plannerPickInt(item?.qty), 0)
      : 0)
    : currentRequestedQty
  return {
    mode: String(mode || 'send'),
    targetScope,
    commandType: normalizeTemplateCommandType(context?.commandType || context?.templateStats?.template?.commandMode),
    typeGenerate: distributionMeta?.typeGenerate || context?.executeConfirmOptions?.typeGenerate || null,
    distributionMode: distributionMeta?.distributionMode || context?.executeConfirmOptions?.distributionMode || null,
    scapeTheNight: typeof distributionMeta?.scapeTheNight === 'boolean'
      ? distributionMeta.scapeTheNight
      : (normalizeTemplateCommandType(context?.commandType || context?.templateStats?.template?.commandMode) === 'attack'
        ? Boolean(context?.executeConfirmOptions?.scapeTheNight)
        : undefined),
    selectedVillageCount: Array.isArray(context?.selectedVillageIds) ? context.selectedVillageIds.length : 0,
    targetCount,
    totalCommands,
    plannerTargetId: Number.isFinite(Number(plannerTarget?.id)) ? Number(plannerTarget.id) : null,
    targetsDraftId: trimPlannerString(context?.targetsDraftId || context?.draftId || activeTargetsDraftIdCurrent) || null,
    draftId: trimPlannerString(context?.draftId || context?.targetsDraftId || activeTargetsDraftIdCurrent) || null
  }
}

async function savePlannerLastDistributionReport({ context = {}, plannerTarget = null, payload = null, response = null, reportId = null, startedAtMs = null } = {}) {
  return await mergePlannerLastReport({
    reportId,
    startedAtMs,
    patch: {
    kind: 'distribute',
    target: plannerTarget ? {
      id: Number.isFinite(Number(plannerTarget?.id)) ? Number(plannerTarget.id) : null,
      x: Number(plannerTarget?.x),
      y: Number(plannerTarget?.y),
      k: Number.isFinite(Number(plannerTarget?.k)) ? Number(plannerTarget.k) : null,
      ...(plannerTarget?.name ? { name: String(plannerTarget.name) } : {})
    } : null,
    settings: buildPlannerReportSettings({
      context,
      mode: 'send',
      plannerTarget,
      distributionMeta: response?.meta
    }),
    payload,
    distribution: response
    }
  })
}

async function savePlannerLastExecutionReport({ mode = 'send', context = {}, plannerTarget = null, executionResult = null, durationMs = null, reportId = null, startedAtMs = null } = {}) {
  const settings = buildPlannerReportSettings({ context, mode, plannerTarget })
  const distributedCount = Math.max(
    plannerPickInt(executionResult?.distributedCount),
    plannerPickInt(executionResult?.total),
    0
  )
  const requestedCount = Math.max(
    plannerPickInt(executionResult?.requestedCount),
    plannerPickInt(settings.totalCommands),
    distributedCount
  )
  const captchaErrorCount = Math.max(
    0,
    plannerPickInt(executionResult?.captchaErrorCount),
    executionResult?.interruptedByCaptcha ? plannerPickInt(executionResult?.pending) : 0
  )
  return await mergePlannerLastReport({
    reportId,
    startedAtMs,
    patch: {
    kind: 'send-execution',
    target: plannerTarget ? {
      id: Number.isFinite(Number(plannerTarget?.id)) ? Number(plannerTarget.id) : null,
      x: Number(plannerTarget?.x),
      y: Number(plannerTarget?.y),
      k: Number.isFinite(Number(plannerTarget?.k)) ? Number(plannerTarget.k) : null,
      ...(plannerTarget?.name ? { name: String(plannerTarget.name) } : {})
    } : null,
    settings: {
      ...settings,
      durationMs: plannerPickInt(durationMs),
      distributedCount,
      distributionDiff: Math.max(0, requestedCount - distributedCount),
      sentCount: plannerPickInt(executionResult?.success),
      errorCount: plannerPickInt(executionResult?.failed) + plannerPickInt(executionResult?.pending),
      captchaErrorCount
    },
    execution: executionResult
    }
  })
}

async function savePlannerLastMultiDispatchReport({
  context = {},
  plannerTarget = null,
  payload = null,
  distributeResponse = null,
  executionResult = null,
  durationMs = null,
  reportId = null,
  startedAtMs = null
} = {}) {
  const settings = buildPlannerReportSettings({
    context,
    mode: 'send',
    plannerTarget,
    distributionMeta: distributeResponse?.meta
  })
  const requestedCount = Math.max(
    plannerPickInt(distributeResponse?.meta?.requestedCount),
    Array.isArray(payload?.targets) ? payload.targets.reduce((sum, item) => sum + plannerPickInt(item?.qty), 0) : 0
  )
  const distributedCount = Math.max(
    plannerPickInt(distributeResponse?.meta?.assignedCount),
    plannerPickInt(distributeResponse?.meta?.commandsCount)
  )
  const captchaErrorCount = Math.max(
    0,
    plannerPickInt(executionResult?.captchaErrorCount),
    executionResult?.interruptedByCaptcha ? plannerPickInt(executionResult?.pending) : 0
  )
  return await mergePlannerLastReport({
    reportId,
    startedAtMs,
    patch: {
    kind: 'send-multi',
    target: plannerTarget ? {
      id: Number.isFinite(Number(plannerTarget?.id)) ? Number(plannerTarget.id) : null,
      x: Number(plannerTarget?.x),
      y: Number(plannerTarget?.y),
      k: Number.isFinite(Number(plannerTarget?.k)) ? Number(plannerTarget.k) : null,
      ...(plannerTarget?.name ? { name: String(plannerTarget.name) } : {})
    } : null,
    settings: {
      ...settings,
      durationMs: plannerPickInt(durationMs),
      distributedCount,
      distributionDiff: Math.max(0, requestedCount - distributedCount),
      sentCount: plannerPickInt(executionResult?.success),
      errorCount: plannerPickInt(executionResult?.failed) + plannerPickInt(executionResult?.pending),
      captchaErrorCount
    },
    payload,
    distribution: distributeResponse,
    execution: executionResult
    }
  })
}

export function setCache(map, key, val){
  if (map.size >= MAX) map.clear(); // simples e bom
  map.set(key, val);
}

const onlyNumbers = (str) => (str.match(/\d+/g) || []).join('');

function normalizeConflictTroopsMode(value) {
  const mode = String(value || '').trim().toLowerCase()
  if (mode === 'abort' || mode === 'strict' || mode === 'estrito') return 'abort'
  return 'redistribute'
}

function loadSendConflictTroopsMode() {
  try {
    return normalizeConflictTroopsMode(localStorage.getItem(SEND_CONFLICT_TROOPS_STORAGE_KEY))
  } catch (_) {
    return 'redistribute'
  }
}

function persistSendConflictTroopsMode(mode) {
  try {
    localStorage.setItem(SEND_CONFLICT_TROOPS_STORAGE_KEY, normalizeConflictTroopsMode(mode))
  } catch (_) {}
}

function getConflictTroopsModeForTable(mode) {
  return 'redistribute'
}

function parseNightBonusHour(value) {
  if (value == null) return null
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{1,2})(?::\d{1,2})?$/)
    if (!match) return null
    const parsed = Number(match[1])
    if (!Number.isFinite(parsed)) return null
    if (parsed === 24) return 0
    return Math.max(0, Math.min(23, Math.floor(parsed)))
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  if (parsed === 24) return 0
  return Math.max(0, Math.min(23, Math.floor(parsed)))
}

function parseNightBonusActiveMode(value) {
  if (value == null) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return null
    if (['true', 'yes', 'on'].includes(normalized)) return 1
    if (['false', 'no', 'off'].includes(normalized)) return 0
    const parsed = Number(normalized)
    if (!Number.isFinite(parsed)) return null
    return Math.max(0, Math.floor(parsed))
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.floor(parsed))
}

function getTargetListKey(target) {
  return `${Number(target?.x)}|${Number(target?.y)}`
}

function createPlannerTargetsNavigatorStateProxy() {
  return {
    get targetsNavigatorQtyByKey() { return targetsNavigatorQtyByKey },
    set targetsNavigatorQtyByKey(value) { targetsNavigatorQtyByKey = value },
    get targetsNavigatorSelectedKeys() { return targetsNavigatorSelectedKeys },
    set targetsNavigatorSelectedKeys(value) { targetsNavigatorSelectedKeys = value },
    get targetsNavigatorMetaByKey() { return targetsNavigatorMetaByKey },
    set targetsNavigatorMetaByKey(value) { targetsNavigatorMetaByKey = value },
    get targetsNavigatorEnrichSeq() { return targetsNavigatorEnrichSeq },
    set targetsNavigatorEnrichSeq(value) { targetsNavigatorEnrichSeq = value },
    get targetsNavigatorSignature() { return targetsNavigatorSignature },
    set targetsNavigatorSignature(value) { targetsNavigatorSignature = value },
    get targetsNavigatorCurrentTargets() { return targetsNavigatorCurrentTargets },
    set targetsNavigatorCurrentTargets(value) { targetsNavigatorCurrentTargets = value },
    get targetsNavigatorActiveKeyCurrent() { return targetsNavigatorActiveKeyCurrent },
    set targetsNavigatorActiveKeyCurrent(value) { targetsNavigatorActiveKeyCurrent = value },
    get syncTargetsNavigatorTogglePreviewUiCurrent() { return syncTargetsNavigatorTogglePreviewUiCurrent },
    set syncTargetsNavigatorTogglePreviewUiCurrent(value) { syncTargetsNavigatorTogglePreviewUiCurrent = value },
    get rerenderTargetsNavigatorRowsCurrent() { return rerenderTargetsNavigatorRowsCurrent },
    set rerenderTargetsNavigatorRowsCurrent(value) { rerenderTargetsNavigatorRowsCurrent = value },
    get syncPlannerTargetCardPreviewCurrent() { return syncPlannerTargetCardPreviewCurrent },
    set syncPlannerTargetCardPreviewCurrent(value) { syncPlannerTargetCardPreviewCurrent = value },
    get syncDispatchScopeUiCurrent() { return syncDispatchScopeUiCurrent },
    set syncDispatchScopeUiCurrent(value) { syncDispatchScopeUiCurrent = value }
  }
}

function createPlannerTargetsNavigatorDeps() {
  return {
    UI,
    state: createPlannerTargetsNavigatorStateProxy(),
    cancelEvents,
    DEBUG_DISABLE_TARGETS_VILLAGES_BRIDGE,
    plannerTargetsDraftCore,
    bringData,
    getTargetListKey,
    getGameData,
    calcContinentFromCoords,
    formatPtBrInt,
    formatDispatchDiagnosticsItemLocal,
    buildDispatchDiagnosticsFormatItemFromStatus,
    getSendersSelectablePreviewState,
    getTargetDispatchStatus,
    getTargetRetryQtyFromDispatchStatus,
    applyRetryQtyFromDispatchStatus,
    updateDispatchButtonsState,
    persistPlannerTargetsDraftFromNavigatorState,
    syncDispatchScopeSelectorUi,
    applyDispatchTargetScopeDefaultForTargetsList,
    setDispatchTargetScope,
    prefetchPlayerNightMoralStateForTargets,
    getNightActiveModeFromWorldConfig,
    consoleDev,
    writePlannerTargetsDraft
  }
}

async function filterIncomingTargetsToExistingVillages(data = null) {
  const api = await loadPlannerTargetsNavigatorModule()
  return api.filterIncomingTargetsToExistingVillages(data, createPlannerTargetsNavigatorDeps())
}

function insertTargetsAccordion(targetContent, data) {
  if (!plannerTargetsNavigatorApi) {
    console.warn('[planner][targets] módulo não carregado para renderização.')
    return
  }
  return plannerTargetsNavigatorApi.insertTargetsAccordion(
    targetContent,
    data,
    createPlannerTargetsNavigatorDeps()
  )
}

function serializeTargetsDraftFromNavigatorState() {
  return serializeTargetsDraftImpl({
    targets: targetsNavigatorCurrentTargets,
    qtyByKey: targetsNavigatorQtyByKey,
    selectedKeys: targetsNavigatorSelectedKeys,
    metaByKey: targetsNavigatorMetaByKey,
    seedTarget: plannerSeedTargetCurrent,
    activeTargetKey: targetsNavigatorActiveKeyCurrent,
    getTargetListKey
  })
}

function persistPlannerTargetsDraftFromNavigatorState() {
  const draftData = serializeTargetsDraftFromNavigatorState()
  const payload = {
    kind: 'planner-targets-draft',
    origin: 'planner',
    dispatchMode: (typeof getActiveDispatchMode === 'function'
      ? normalizeIncomingDispatchMode(getActiveDispatchMode())
      : null) || initialDispatchMode || 'send',
    commandType: normalizeTemplateCommandType(templateStatsCurrent?.template?.commandMode) || null,
    templateComponentState: cancelEvents.plannerTemplatesView?.getComponentStateSnapshot?.() || null,
    dispatchTargetScope: getDispatchTargetScope(),
    targetScope: getDispatchTargetScope(),
    scheduleDateTime: ((typeof getActiveDispatchMode === 'function'
      ? normalizeIncomingDispatchMode(getActiveDispatchMode())
      : null) || initialDispatchMode || 'send') === 'schedule'
      ? (String(dateTimeValue || '').trim() || null)
      : null,
    ...(draftData && typeof draftData === 'object' ? draftData : {})
  }
  const signature = JSON.stringify(payload)
  if (signature === targetsDraftPersistSignatureCurrent) return null
  targetsDraftPersistSignatureCurrent = signature
  return writePlannerTargetsDraft(payload)
}

function getTargetDispatchStatus(target = null) {
  const key = getTargetListKey(target)
  if (!/^\d+\|\d+$/.test(key)) return null
  const meta = targetsNavigatorMetaByKey.get(key) || null
  return meta?.dispatchStatus || null
}

function setTargetDispatchStatus(target = null, patch = {}) {
  const key = getTargetListKey(target)
  if (!/^\d+\|\d+$/.test(key)) return null
  const prev = targetsNavigatorMetaByKey.get(key) || {}
  const prevStatus = (prev?.dispatchStatus && typeof prev.dispatchStatus === 'object') ? prev.dispatchStatus : {}
  const nextStatus = {
    ...prevStatus,
    ...(patch && typeof patch === 'object' ? patch : {})
  }
  targetsNavigatorMetaByKey.set(key, {
    ...prev,
    dispatchStatus: nextStatus
  })
  return nextStatus
}

function clearTargetsDispatchStatus() {
  const entries = Array.from(targetsNavigatorMetaByKey.entries())
  entries.forEach(([key, meta]) => {
    if (!meta || typeof meta !== 'object') return
    if (!meta.dispatchStatus) return
    targetsNavigatorMetaByKey.set(key, {
      ...meta,
      dispatchStatus: null
    })
  })
}

function applyMapInfoToTargetsNavigatorMeta(target = null, mapInfo = null) {
  if (!plannerTargetsMapInfoApi) return false
  return plannerTargetsMapInfoApi.applyMapInfoToTargetsNavigatorMeta(target, mapInfo, {
    getTargetListKey,
    targetsNavigatorMetaByKey,
    applyMapInfoToPlayerNightMoralState,
    normalizeMoralePercent,
    resolveTargetNightBonusConfigFromStateOrCache,
    parseNightBonusFromCurrentInterval,
    resolveEffectiveNightBonusConfig,
    buildNightBonusTargetLabel,
    nightBonusConfigWorld
  })
}

function ensureTargetsNavigatorPreviewMapInfo(target = null) {
  if (!plannerTargetsMapInfoApi) return
  return plannerTargetsMapInfoApi.ensureTargetsNavigatorPreviewMapInfo(target, {
    getTargetListKey,
    targetsNavigatorMetaByKey,
    getCachedAjaxMapInfo,
    rerenderTargetsNavigatorRowsCurrent,
    targetsNavigatorMapInfoRequestByKey,
    getNightActiveModeFromWorldConfig,
    getTargetPlayerIdForNightState,
    resolveTargetMoraleFromStateOrCache,
    getAjaxMapInfo,
    applyMapInfoToPlayerNightMoralState,
    normalizeMoralePercent,
    resolveTargetNightBonusConfigFromStateOrCache,
    parseNightBonusFromCurrentInterval,
    resolveEffectiveNightBonusConfig,
    buildNightBonusTargetLabel,
    nightBonusConfigWorld
  })
}

function applyDistributionStatusToTargets(distributeResponse = null) {
  clearTargetsDispatchStatus()
  const targets = Array.isArray(distributeResponse?.targets) ? distributeResponse.targets : []
  targets.forEach((item) => {
    const target = item?.target || null
    if (!target) return
    const requestedQty = Math.max(0, Math.floor(Number(item?.requestedQty) || 0))
    const distributedQty = Math.max(0, Math.floor(Number(item?.assignedQty) || 0))
    const remainingQty = Math.max(0, Math.floor(Number(item?.remainingQty) || 0))
    const pendingRejectedByNightCount = Math.max(0, Math.floor(Number(item?.pendingRejectedByNightCount) || 0))
    setTargetDispatchStatus(target, {
      stage: 'distributed',
      requestedQty,
      distributedQty,
      remainingQty,
      bnBlockedCount: pendingRejectedByNightCount,
      sendOkQty: 0,
      sendFailQty: 0,
      sendPendingQty: distributedQty,
      retryQty: remainingQty
    })
  })
  rerenderTargetsNavigatorRowsCurrent?.()
  persistPlannerTargetsDraftFromNavigatorState()
}

function applyDistributionStatusToTarget(target = null, distributionItem = null) {
  if (!target || !distributionItem) return null
  const requestedQty = Math.max(0, Math.floor(Number(distributionItem?.requestedQty) || 0))
  const distributedQty = Math.max(0, Math.floor(Number(distributionItem?.assignedQty) || 0))
  const remainingQty = Math.max(0, Math.floor(Number(distributionItem?.remainingQty) || 0))
  const pendingRejectedByNightCount = Math.max(0, Math.floor(Number(distributionItem?.pendingRejectedByNightCount) || 0))
  const nextStatus = setTargetDispatchStatus(target, {
    stage: 'distributed',
    requestedQty,
    distributedQty,
    remainingQty,
    bnBlockedCount: pendingRejectedByNightCount,
    sendOkQty: 0,
    sendFailQty: 0,
    sendPendingQty: distributedQty,
    retryQty: remainingQty
  })
  rerenderTargetsNavigatorRowsCurrent?.()
  syncCurrentPlannerTargetDispatchStatusUi(document.querySelector('#go-target-content'), target)
  persistPlannerTargetsDraftFromNavigatorState()
  return nextStatus
}

function applyTargetSendResultStatus(target = null, executionResult = null) {
  const prev = getTargetDispatchStatus(target) || {}
  const requestedQty = Math.max(0, Math.floor(Number(prev?.requestedQty) || 0))
  const distributedQty = Math.max(0, Math.floor(Number(prev?.distributedQty) || 0))
  const success = Math.max(0, Math.floor(Number(executionResult?.success) || 0))
  const failed = Math.max(0, Math.floor(Number(executionResult?.failed) || 0))
  const pending = Math.max(0, Math.floor(Number(executionResult?.pending) || 0))
  const diagnostics = (executionResult?.diagnostics && typeof executionResult.diagnostics === 'object')
    ? executionResult.diagnostics
    : null
  const sendOkQty = success
  const sendFailQty = failed
  const sendPendingQty = pending
  const remainingQty = Math.max(0, Math.floor(Number(prev?.remainingQty) || 0))
  const retryQty = Math.max(
    remainingQty + sendFailQty + sendPendingQty,
    Math.max(0, requestedQty - sendOkQty)
  )
  setTargetDispatchStatus(target, {
    ...prev,
    stage: 'sent',
    distributedQty,
    sendOkQty,
    sendFailQty,
    sendPendingQty,
    retryQty,
    diagnostics
  })
  rerenderTargetsNavigatorRowsCurrent?.()
  syncCurrentPlannerTargetDispatchStatusUi(document.querySelector('#go-target-content'), target)
  persistPlannerTargetsDraftFromNavigatorState()
}

function buildCaptchaInterruptedDiagnostics(prevDiagnostics = null, pendingCount = 0) {
  const nextPendingCount = Math.max(0, Math.floor(Number(pendingCount) || 0))
  const normalizedPrev = (prevDiagnostics && typeof prevDiagnostics === 'object') ? prevDiagnostics : {}
  const prevSend = (normalizedPrev.send && typeof normalizedPrev.send === 'object') ? normalizedPrev.send : {}
  const prevCauses = (normalizedPrev.causes && typeof normalizedPrev.causes === 'object') ? normalizedPrev.causes : {}
  const prevSendMessages = Array.isArray(prevSend.messages) ? prevSend.messages.map((msg) => trimPlannerString(msg)).filter(Boolean) : []
  if (!prevSendMessages.includes('Captcha identificado.')) prevSendMessages.push('Captcha identificado.')
  return {
    ...normalizedPrev,
    send: {
      ...prevSend,
      errorCount: Math.max(0, Math.floor(Number(prevSend.errorCount) || 0)) + nextPendingCount,
      messages: prevSendMessages.slice(0, 6)
    },
    causes: {
      ...prevCauses,
      captchaCount: Math.max(0, Math.floor(Number(prevCauses.captchaCount) || 0)) + nextPendingCount
    }
  }
}

function buildTargetDispatchAggregateEntry(target = null, diagnosticsOverride = undefined) {
  const status = getTargetDispatchStatus(target) || {}
  return {
    target: {
      id: Number.isFinite(Number(target?.id)) ? Number(target.id) : null,
      x: Number(target?.x),
      y: Number(target?.y),
      ...(target?.name ? { name: String(target.name) } : {})
    },
    requestedQty: Math.max(0, Math.floor(Number(status?.requestedQty) || 0)),
    distributedQty: Math.max(0, Math.floor(Number(status?.distributedQty) || 0)),
    remainingQty: Math.max(0, Math.floor(Number(status?.remainingQty) || 0)),
    sendOkQty: Math.max(0, Math.floor(Number(status?.sendOkQty) || 0)),
    sendFailQty: Math.max(0, Math.floor(Number(status?.sendFailQty) || 0)),
    sendPendingQty: Math.max(0, Math.floor(Number(status?.sendPendingQty) || 0)),
    retryQty: Math.max(0, Math.floor(Number(status?.retryQty) || 0)),
    bnBlockedCount: Math.max(0, Math.floor(Number(status?.bnBlockedCount) || 0)),
    diagnostics: diagnosticsOverride === undefined ? (status?.diagnostics || null) : diagnosticsOverride
  }
}

function getTargetRetryQtyFromDispatchStatus(status = null) {
  const requestedQty = Math.max(0, Math.floor(Number(status?.requestedQty) || 0))
  const distributedQty = Math.max(0, Math.floor(Number(status?.distributedQty) || 0))
  const remainingQty = Math.max(0, Math.floor(Number(status?.remainingQty) || 0))
  const sendOkQty = Math.max(0, Math.floor(Number(status?.sendOkQty) || 0))
  const sendFailQty = Math.max(0, Math.floor(Number(status?.sendFailQty) || 0))
  const sendPendingQty = Math.max(0, Math.floor(Number(status?.sendPendingQty) || 0))
  const retryQtyRaw = Math.max(0, Math.floor(Number(status?.retryQty) || 0))
  if (retryQtyRaw > 0) return retryQtyRaw
  return Math.max(
    0,
    remainingQty + sendFailQty + sendPendingQty,
    requestedQty - sendOkQty,
    distributedQty - sendOkQty
  )
}

function applyRetryQtyFromDispatchStatus() {
  const targets = Array.isArray(targetsNavigatorCurrentTargets) ? targetsNavigatorCurrentTargets : []
  if (!targets.length) return { changed: 0, totalRetry: 0 }
  let changed = 0
  let totalRetry = 0
  targets.forEach((target) => {
    const key = getTargetListKey(target)
    const status = getTargetDispatchStatus(target)
    const retryQty = getTargetRetryQtyFromDispatchStatus(status)
    totalRetry += retryQty
    const currentQty = Math.max(0, Math.floor(Number(targetsNavigatorQtyByKey.get(key) || 0) || 0))
    if (currentQty !== retryQty) {
      targetsNavigatorQtyByKey.set(key, retryQty)
      changed += 1
    }
    if (retryQty > 0) targetsNavigatorSelectedKeys.add(key)
    else targetsNavigatorSelectedKeys.delete(key)
  })
  rerenderTargetsNavigatorRowsCurrent?.()
  syncTargetsNavigatorTogglePreviewUiCurrent?.()
  updateDispatchButtonsState()
  return { changed, totalRetry }
}

function buildMultiDistributeCommandsByTarget(distributeResponse = null) {
  const commands = Array.isArray(distributeResponse?.commands) ? distributeResponse.commands : []
  const groups = new Map()
  commands.forEach((command) => {
    const target = command?.target
    const source = command?.source
    const x = Number(target?.x)
    const y = Number(target?.y)
    const sourceVillageId = Number(source?.id ?? source?.villageId)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(sourceVillageId)) return
    const key = `${x}|${y}`
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        target: {
          id: Number.isFinite(Number(target?.id)) ? Number(target.id) : null,
          x,
          y,
          ...(Number.isFinite(Number(target?.playerId)) ? { playerId: Number(target.playerId) } : {}),
          ...(target?.name ? { name: String(target.name) } : {})
        },
        commands: []
      })
    }
    groups.get(key).commands.push(command)
  })
  return Array.from(groups.values()).sort((a, b) => {
    const aOrder = Math.min(...a.commands.map((item) => Number(item?.order)).filter(Number.isFinite))
    const bOrder = Math.min(...b.commands.map((item) => Number(item?.order)).filter(Number.isFinite))
    if (Number.isFinite(aOrder) && Number.isFinite(bOrder) && aOrder !== bOrder) return aOrder - bOrder
    return String(a.key).localeCompare(String(b.key))
  })
}

function buildPendingSendCommandId(command = null) {
  const target = (command?.target && typeof command.target === 'object') ? command.target : null
  const source = (command?.source && typeof command.source === 'object') ? command.source : null
  const x = Number(target?.x)
  const y = Number(target?.y)
  const sourceVillageId = Number(source?.id ?? source?.villageId)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(sourceVillageId)) return ''
  return `${x}|${y}:${Math.trunc(sourceVillageId)}`
}

function collectPendingSendCommandIds(commands = []) {
  return (Array.isArray(commands) ? commands : [])
    .map((command) => buildPendingSendCommandId(command))
    .filter(Boolean)
}

function buildSinglePendingSendCommands(target = null, villageIds = []) {
  const targetPayload = (
    target && Number.isFinite(Number(target?.x)) && Number.isFinite(Number(target?.y))
  ) ? {
    id: Number.isFinite(Number(target?.id)) ? Number(target.id) : null,
    x: Number(target?.x),
    y: Number(target?.y),
    ...(Number.isFinite(Number(target?.playerId)) ? { playerId: Number(target.playerId) } : {}),
    ...(target?.name ? { name: String(target.name) } : {})
  } : null
  if (!targetPayload) return []
  return (Array.isArray(villageIds) ? villageIds : [])
    .map((villageId, index) => {
      const normalizedVillageId = Number(villageId)
      if (!Number.isFinite(normalizedVillageId)) return null
      return {
        order: index,
        target: targetPayload,
        source: {
          id: Math.trunc(normalizedVillageId)
        }
      }
    })
    .filter(Boolean)
}

function buildOptimizedDistributionDebugSummary(distributeResponse = null) {
  const distributionMode = String(
    distributeResponse?.meta?.distributionMode
    || distributeResponse?.settings?.distributionMode
    || ''
  ).trim().toLowerCase()
  if (distributionMode !== 'min_cost_max_flow') return null

  const commands = Array.isArray(distributeResponse?.commands) ? distributeResponse.commands : []
  const optimizedMeta = distributeResponse?.meta?.optimizedMeta || distributeResponse?.raw?.meta?.optimizedMeta || null
  const dispatchPerCommandMs = Number(
    optimizedMeta?.dispatchPerCommandMs
    ?? distributeResponse?.raw?.meta?.optimizedMeta?.dispatchPerCommandMs
  )

  const commandSlots = commands.map((command, index) => ({
    index,
    order: Number.isFinite(Number(command?.order)) ? Number(command.order) : index,
    dispatchOrder: Number.isFinite(Number(command?.dispatchOrder)) ? Number(command.dispatchOrder) : null,
    sendOffsetMs: Number.isFinite(Number(command?.sendOffsetMs)) ? Number(command.sendOffsetMs) : null,
    round: Number.isFinite(Number(command?.round)) ? Number(command.round) : null,
    sourceVillageId: Number.isFinite(Number(command?.source?.id ?? command?.source?.villageId))
      ? Number(command.source?.id ?? command.source?.villageId)
      : null,
    target: (
      Number.isFinite(Number(command?.target?.x))
      && Number.isFinite(Number(command?.target?.y))
    ) ? `${Number(command.target.x)}|${Number(command.target.y)}` : null
  }))

  return {
    distributionMode,
    commandsCount: commands.length,
    dispatchPerCommandMs: Number.isFinite(dispatchPerCommandMs) ? dispatchPerCommandMs : null,
    optimizedMeta,
    commandSlots
  }
}

function createMultiTargetScopedExecutionView({
  root,
  feedController,
  groupIndex = 0,
  groupTotal = 1,
  groupTarget = null,
  aggregateTotal = 0,
  progressState = null,
  createExecutionViewFn = null
} = {}) {
  const createExecutionView = typeof createExecutionViewFn === 'function' ? createExecutionViewFn : null
  if (!createExecutionView) throw new Error('Executor de envio indisponível.')
  const baseView = createExecutionView({ root, feedController })
  let lastProgressCurrent = 0
  const targetX = Number(groupTarget?.x)
  const targetY = Number(groupTarget?.y)
  const targetK = Number.isFinite(Number(groupTarget?.k))
    ? Number(groupTarget.k)
    : calcContinentFromCoords(targetX, targetY)
  const targetName = String(groupTarget?.name || '').trim()
  const targetLabel = Number.isFinite(targetX) && Number.isFinite(targetY)
    ? `${targetX}|${targetY}`
    : `alvo ${groupIndex + 1}`
  const targetDisplay = Number.isFinite(targetX) && Number.isFinite(targetY)
    ? `${targetName ? `${targetName} ` : ''}(${targetX}|${targetY})${Number.isFinite(targetK) ? ` K${targetK}` : ''}`
    : targetLabel

  const ensureProgressState = () => {
    if (progressState && typeof progressState === 'object') return progressState
    return { current: 0, total: Math.max(0, Math.floor(Number(aggregateTotal) || 0)), noticeSeq: 0 }
  }
  const shared = ensureProgressState()
  let lastProgressPhase = 'phase1'

  const inferProgressPhaseKey = (label = '') => {
    const text = String(label || '').trim().toLowerCase()
    if (text.includes('fase 3')) return 'phase3'
    if (text.includes('fase 2')) return 'phase2'
    return 'phase1'
  }

  const upsertNotice = (status, title, detail = '') => {
    shared.noticeSeq = Math.max(0, Math.floor(Number(shared.noticeSeq) || 0)) + 1
    feedController?.upsert?.({
      id: `__multi:notice:${groupIndex}:${shared.noticeSeq}`,
      status,
      title,
      detail
    })
  }

  return {
    ...baseView,
    info: (message) => {
      const text = String(message || '').trim()
      if (!text) return
      upsertNotice('running', `Alvo ${targetLabel}`, text)
    },
    error: (message) => {
      const text = String(message || '').trim()
      if (!text) return
      upsertNotice('error', `Alvo ${targetLabel}`, text)
    },
    success: (message) => {
      const text = String(message || '').trim()
      if (!text) return
      upsertNotice('success', `Alvo ${targetLabel}`, text)
    },
    feedStart: ({ total = 0, ...payload } = {}) => {
      lastProgressCurrent = 0
      lastProgressPhase = 'phase1'
      feedController?.setPhase?.({
        label: `[${groupIndex + 1}/${groupTotal}] ${targetLabel} | Fase 1`
      })
      feedController?.upsert?.({
        id: `__multi:target:${groupIndex}:start`,
        status: 'running',
        title: `Alvo ${targetLabel}`,
        detail: `${Math.max(0, Math.floor(Number(total) || 0))} vila(s) para envio`
      })
      if (payload?.title) {
        feedController?.upsert?.({
          id: `__multi:target:${groupIndex}:meta`,
          status: 'running',
          title: `Resumo alvo ${targetLabel}`,
          detail: String(payload.title)
        })
      }
    },
    feedSetProgress: ({ current = 0, total = 0 } = {}) => {
      const normalizedCurrent = Math.max(0, Math.floor(Number(current) || 0))
      const delta = Math.max(0, normalizedCurrent - lastProgressCurrent)
      lastProgressCurrent = normalizedCurrent
      if (delta > 0 && lastProgressPhase === 'phase3') {
        shared.current = Math.max(0, Math.floor(Number(shared.current) || 0)) + delta
      }
      feedController?.setProgress?.({
        current: Math.max(0, Math.floor(Number(shared.current) || 0)),
        total: Math.max(0, Math.floor(Number(shared.total) || Number(aggregateTotal) || Number(total) || 0))
      })
    },
    feedSetPhase: ({ label = '' } = {}) => {
      const phaseLabel = String(label || '').trim()
      if (!phaseLabel) return
      const nextProgressPhase = inferProgressPhaseKey(phaseLabel)
      if (nextProgressPhase !== lastProgressPhase) {
        lastProgressPhase = nextProgressPhase
        lastProgressCurrent = 0
      }
      feedController?.setPhase?.({
        label: `[${groupIndex + 1}/${groupTotal}] ${targetLabel} | ${phaseLabel}`
      })
    },
    feedUpsert: (entry = {}) => {
      const rawId = String(entry?.id || '').trim()
      if (!rawId) return
      if (rawId === '__exec:last__') return
      const status = String(entry?.status || 'pending')
      const normalizedStatus = status === 'info' ? 'running' : status
      const prefixedId = rawId.startsWith('__exec:')
        ? `__multi:${groupIndex}:${rawId.replace(/^__exec:/, '')}`
        : `t${groupIndex}:${rawId}`
      const isSenderCommandRow = rawId.startsWith('send:')
      const nextTitle = isSenderCommandRow
        ? `${String(entry?.title || '').trim()} ➜ ${targetDisplay}`
        : entry?.title
      feedController?.upsert?.({
        ...entry,
        id: prefixedId,
        status: normalizedStatus,
        ...(nextTitle ? { title: nextTitle } : {})
      })
    },
    feedFinish: ({ success = 0, failed = 0, total = 0, message = '' } = {}) => {
      const ok = Math.max(0, Math.floor(Number(success) || 0))
      const err = Math.max(0, Math.floor(Number(failed) || 0))
      const all = Math.max(0, Math.floor(Number(total) || 0))
      const extra = String(message || '').trim()
      feedController?.upsert?.({
        id: `__multi:target:${groupIndex}:finish`,
        status: (err > 0 || extra) ? 'error' : 'success',
        title: `Alvo ${targetLabel} concluído`,
        detail: `${ok}/${all} ok${err > 0 ? ` | erro ${err}` : ''}${extra ? ` | ${extra}` : ''}`
      })
    },
    publishPhaseOneSummary: () => {}
  }
}

function normalizeDispatchTargetScope(value) {
  return String(value || '').trim().toLowerCase() === 'multi' ? 'multi' : 'current'
}

function hasTargetsNavigatorMultiAvailable() {
  return Array.isArray(targetsNavigatorCurrentTargets) && targetsNavigatorCurrentTargets.length > 1
}

function getDispatchTargetScope() {
  if (normalizeDispatchTargetScope(dispatchTargetScope) === 'multi' && hasTargetsNavigatorMultiAvailable()) return 'multi'
  return 'current'
}

function setDispatchTargetScope(value) {
  const prevScope = getDispatchTargetScope()
  const nextScope = normalizeDispatchTargetScope(value)
  dispatchTargetScope = (nextScope === 'multi' && !hasTargetsNavigatorMultiAvailable())
    ? 'current'
    : nextScope
  if (getDispatchTargetScope() !== prevScope) {
    persistPlannerTargetsDraftFromNavigatorState()
  }
  syncDispatchScopeSelectorUi()
  syncDispatchScopeUiCurrent?.()
}

function applyDispatchTargetScopeDefaultForTargetsList() {
  if (dispatchTargetScopeHasExplicitInput) return
  if (dispatchTargetScopeAutoDefaultApplied) return
  if (!hasTargetsNavigatorMultiAvailable()) return
  dispatchTargetScopeAutoDefaultApplied = true
  setDispatchTargetScope('multi')
}

function getMultiTargetsExecutionPlan() {
  const targets = Array.isArray(targetsNavigatorCurrentTargets) ? targetsNavigatorCurrentTargets : []
  const items = []
  let totalCommands = 0
  targets.forEach((target) => {
    const key = getTargetListKey(target)
    const qty = Math.max(0, Math.floor(Number(targetsNavigatorQtyByKey.get(key) ?? 0) || 0))
    if (qty <= 0) return
    items.push({
      id: Number.isFinite(Number(target?.id)) ? Number(target.id) : null,
      x: Number(target?.x),
      y: Number(target?.y),
      qty
    })
    totalCommands += qty
  })
  return {
    items,
    totalCommands,
    activeTargets: items.length
  }
}

function normalizeTemplateCommandType(value) {
  return String(value || '').trim().toLowerCase() === 'support' ? 'support' : 'attack'
}

function getCurrentTemplateCommandType() {
  return normalizeTemplateCommandType(templateStatsCurrent?.template?.commandMode)
}

function getDispatchExecuteButtonLabel(mode, commandType) {
  const action = mode === 'schedule' ? 'Agendar' : 'Enviar'
  const normalizedCommandType = normalizeTemplateCommandType(commandType)
  const target = normalizedCommandType === 'support' ? 'Apoio' : 'Ataque'
  return `${action} ${target}(s)`
}

function normalizeCurrentTargetCommandQty(value, fallback = 1) {
  const next = Number(value)
  if (!Number.isFinite(next) || next <= 0) {
    return Math.max(1, Math.floor(Number(fallback) || 1))
  }
  return Math.max(1, Math.floor(next))
}

function getCurrentTargetSelectedVillageIdsFromContext(context = {}) {
  return (Array.isArray(context?.selectedVillageIds) ? context.selectedVillageIds : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
}

function getCurrentTargetRequestedQtyFromContext(context = {}) {
  const selectedCount = getCurrentTargetSelectedVillageIdsFromContext(context).length
  return normalizeCurrentTargetCommandQty(context?.executeConfirmOptions?.currentTargetQty, selectedCount > 0 ? 1 : 1)
}

function shouldUseCurrentTargetDistribution(context = {}) {
  const selectedCount = getCurrentTargetSelectedVillageIdsFromContext(context).length
  if (selectedCount <= 0) return false
  const requestedQty = getCurrentTargetRequestedQtyFromContext(context)
  return selectedCount > requestedQty
}

async function buildConfirmSelectionFirstAttackEstimate({
  mode = 'send',
  selectedVillageIds = [],
  executeConfirmOptions = null,
  targetScope = null
} = {}) {
  const scope = String(targetScope || getDispatchTargetScope() || 'current')
  const template = templateStatsCurrent?.template
  if (!template || !Array.isArray(template?.units) || !Array.isArray(template?.values)) return null

  const selectedIds = (Array.isArray(selectedVillageIds) ? selectedVillageIds : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
  if (!selectedIds.length) return null

  const senderByVillageId = new Map(
    (Array.isArray(sendersDataCurrent) ? sendersDataCurrent : [])
      .filter((sender) => Number.isFinite(Number(sender?.villageId)))
      .map((sender) => [Number(sender.villageId), sender])
  )
  if (!senderByVillageId.size) return null

  const selectedIdsForEstimate = (() => {
    if (scope !== 'current') return selectedIds
    const requestedQty = normalizeCurrentTargetCommandQty(executeConfirmOptions?.currentTargetQty, 1)
    const useDistribution = selectedIds.length > requestedQty
    const typeGenerate = String(executeConfirmOptions?.typeGenerate || 'closest').trim().toLowerCase() === 'furthest'
      ? 'furthest'
      : 'closest'
    const ordered = [...selectedIds].sort((a, b) => {
      const senderA = senderByVillageId.get(a) || null
      const senderB = senderByVillageId.get(b) || null
      const distanceA = Number(senderA?.distance)
      const distanceB = Number(senderB?.distance)
      const safeDistanceA = Number.isFinite(distanceA) ? distanceA : Number.MAX_SAFE_INTEGER
      const safeDistanceB = Number.isFinite(distanceB) ? distanceB : Number.MAX_SAFE_INTEGER
      if (safeDistanceA !== safeDistanceB) {
        return typeGenerate === 'furthest'
          ? safeDistanceB - safeDistanceA
          : safeDistanceA - safeDistanceB
      }
      return a - b
    })
    if (!useDistribution) return ordered
    return ordered.slice(0, Math.max(0, Math.min(requestedQty, ordered.length)))
  })()

  const worldUnits = getWorldUnitsOrder()
  if (!Array.isArray(worldUnits) || !worldUnits.length) return null
  const normalizeTemplateForCommand = await loadPlannerNormalizeTemplateModule()

  const unitDataRaw = getUnitData?.() || null
  const unitMetaByName = worldUnits.reduce((map, unit) => {
    const meta = unitDataRaw?.[unit]
    if (meta) map.set(unit, meta)
    return map
  }, new Map())
  const villageById = getSenderVillageByIdMap()
  const commandType = getCurrentTemplateCommandType()
  const totalsByUnit = worldUnits.reduce((acc, unit) => {
    acc[unit] = 0
    return acc
  }, {})

  let predictedAttacks = 0
  let selectedResolved = 0

  selectedIdsForEstimate.forEach((villageId) => {
    const sender = senderByVillageId.get(villageId)
    if (!sender) return
    const senderUnits = Array.isArray(sender?.units)
      ? sender.units.map((value) => {
          const n = Number(value)
          return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
        })
      : worldUnits.map(() => 0)
    const sourceVillageUnits = {
      units: senderUnits,
      byUnit: new Map(worldUnits.map((unit, index) => [unit, Number(senderUnits?.[index]) || 0]))
    }
    const villagePoints = Number(villageById?.get?.(villageId)?.points)
    const normalized = normalizeTemplateForCommand(template, worldUnits, {
      sourceVillageUnits,
      mode,
      commandType,
      villagePoints: Number.isFinite(villagePoints) ? villagePoints : undefined,
      unitMetaByName: unitMetaByName.size > 0 ? unitMetaByName : undefined,
      fakeLimitPercent: Number.isFinite(Number(fakeLimitPercent)) ? Number(fakeLimitPercent) : undefined,
      targetPlayerId: Number.isFinite(Number(plannerTargetCurrent?.playerId)) ? Number(plannerTargetCurrent.playerId) : undefined,
      minSpyCommand: minSpyCommand && typeof minSpyCommand === 'object' ? minSpyCommand : undefined,
      conflictTroops: getConflictTroopsModeForTable(mode)
    })
    selectedResolved += 1
    const firstRowMap = normalized?.firstRowMap && typeof normalized.firstRowMap === 'object'
      ? normalized.firstRowMap
      : null
    if (!firstRowMap) return
    let hasAnyUnit = false
    worldUnits.forEach((unit) => {
      const value = Number(firstRowMap?.[unit])
      if (!Number.isFinite(value) || value <= 0) return
      hasAnyUnit = true
      totalsByUnit[unit] += value
    })
    if (hasAnyUnit) predictedAttacks += 1
  })

  const unitsTotal = {}
  const unitsAverage = {}
  let totalTroops = 0
  let totalFarm = 0
  worldUnits.forEach((unit) => {
    const totalValue = Number(totalsByUnit?.[unit]) || 0
    const unitPop = Number(unitDataRaw?.[unit]?.pop ?? dataUnits?.get?.(unit)?.pop) || 1
    if (totalValue > 0) {
      unitsTotal[unit] = totalValue
      totalTroops += totalValue
      totalFarm += totalValue * unitPop
    }
    if (predictedAttacks > 0 && totalValue > 0) {
      unitsAverage[unit] = totalValue / predictedAttacks
    }
  })

  const multiPlan = scope === 'multi'
    ? (getMultiTargetsExecutionPlan() || { totalCommands: 0, activeTargets: 0 })
    : null
  const avgAttacksPerTarget = (
    scope === 'multi' &&
    Number(multiPlan?.activeTargets) > 0 &&
    Number(multiPlan?.totalCommands) > 0
  )
    ? (Number(multiPlan.totalCommands) / Number(multiPlan.activeTargets))
    : 0
  const unitsApproxTotalPerTarget = {}
  let approxTotalTroopsPerTarget = 0
  let approxTotalFarmPerTarget = 0
  if (scope === 'multi' && avgAttacksPerTarget > 0) {
    worldUnits.forEach((unit) => {
      const avgUnit = Number(unitsAverage?.[unit]) || 0
      if (avgUnit <= 0) return
      const approx = avgUnit * avgAttacksPerTarget
      if (!(approx > 0)) return
      const unitPop = Number(unitDataRaw?.[unit]?.pop ?? dataUnits?.get?.(unit)?.pop) || 1
      unitsApproxTotalPerTarget[unit] = approx
      approxTotalTroopsPerTarget += approx
      approxTotalFarmPerTarget += approx * unitPop
    })
  }

  return {
    scope: scope === 'multi' ? 'multi' : 'current',
    mode,
    unitOrder: worldUnits,
    selectedRows: selectedIds.length,
    selectedResolved,
    predictedAttacks,
    totalTroops,
    averageTroops: predictedAttacks > 0 ? (totalTroops / predictedAttacks) : 0,
    totalFarm,
    averageFarm: predictedAttacks > 0 ? (totalFarm / predictedAttacks) : 0,
    unitsTotal,
    unitsAverage,
    multi: scope === 'multi'
      ? {
          totalCommands: Math.max(0, Math.floor(Number(multiPlan?.totalCommands) || 0)),
          activeTargets: Math.max(0, Math.floor(Number(multiPlan?.activeTargets) || 0)),
          avgAttacksPerTarget,
          unitsApproxTotalPerTarget,
          approxTotalTroopsPerTarget,
          approxTotalFarmPerTarget
        }
      : null
  }
}

function getTemplateSelectedUnitNames(template = null) {
  const units = Array.isArray(template?.units) ? template.units : []
  if (!units.length) return []
  const rawValues = template?.values
  const rows = Array.isArray(rawValues?.[0])
    ? rawValues
    : (Array.isArray(rawValues) ? [rawValues] : [])
  const selected = new Set()
  rows.forEach((row) => {
    if (!Array.isArray(row)) return
    row.forEach((raw, index) => {
      const value = Number(raw)
      if (!Number.isFinite(value) || value === 0) return
      const unit = units[index]
      if (unit) selected.add(String(unit))
    })
  })
  return Array.from(selected)
}

function getTemplateSlowestUnitEffectiveTiming(template = null) {
  const selectedUnits = getTemplateSelectedUnitNames(template)
  if (!selectedUnits.length) return null

  const slowestUnit = computeSlowestUnit(selectedUnits, dataUnits)?.slowest || null
  if (!slowestUnit) return null

  const unitDataRaw = getUnitData?.() || null
  const speedFieldsPerSecond = Number(
    unitDataRaw?.[slowestUnit]?.speed
    ?? dataUnits?.get?.(slowestUnit)?.speed
  )
  if (!Number.isFinite(speedFieldsPerSecond) || speedFieldsPerSecond <= 0) {
    return { slowestUnit, slowestUnitSecondsPerField: null }
  }

  return {
    slowestUnit,
    slowestUnitSecondsPerField: 1 / speedFieldsPerSecond
  }
}

function getDispatchMultiSendConfirmSchema(mode, context = {}) {
  if (!['send', 'schedule'].includes(String(mode || ''))) return []
  const commandType = normalizeTemplateCommandType(context?.commandType || context?.templateStats?.template?.commandMode)
  const isMultiScope = String(context?.targetScope || '') === 'multi'
  const fields = []
  if (isMultiScope) {
    fields.push({
      key: 'typeGenerate',
      type: 'choice',
      label: 'Distribuição',
      defaultValue: 'closest',
      hint: 'Prioridade dos remetentes na distribuição',
      options: [
        { value: 'closest', label: 'Mais próximas' },
        { value: 'furthest', label: 'Mais distantes' }
      ]
    })
    const selectedVillageIds = Array.isArray(context?.selectedVillageIds) ? context.selectedVillageIds : []
    const selectedSendersCount = getSelectedSendersForMultiDistribution(selectedVillageIds).length
    const multiPlan = context?.multiTargetsPlan || getMultiTargetsExecutionPlan()
    const slotsCount = Math.max(0, Math.floor(Number(multiPlan?.totalCommands) || 0))
    const pairsCount = Math.max(0, Math.floor(selectedSendersCount)) * Math.max(0, Math.floor(slotsCount))
    const optimizedEligible =
      selectedSendersCount > 0
      && slotsCount > 0
      && pairsCount <= DISTRIBUTION_OPTIMIZED_MAX_PAIRS
    if (optimizedEligible) {
      fields.push({
        key: 'distributionMode',
        type: 'choice',
        label: 'Motor',
        defaultValue: 'sender_first',
        hint: `Otimizado disponível até ${DISTRIBUTION_OPTIMIZED_MAX_PAIRS} combinações (remetentes x comandos).`,
        options: [
          { value: 'sender_first', label: 'Padrão' },
          { value: 'min_cost_max_flow', label: 'Otimizado' }
        ]
      })
    }
  } else {
    const selectedVillageIds = Array.isArray(context?.selectedVillageIds) ? context.selectedVillageIds : []
    const selectedSendersCount = selectedVillageIds.length
    const currentTargetRetryQty = Math.max(0, Math.floor(Number(getTargetDispatchStatus(plannerTargetCurrent)?.retryQty) || 0))
    const currentTargetQty = normalizeCurrentTargetCommandQty(context?.executeConfirmOptions?.currentTargetQty, 1)
    fields.push({
      key: 'currentTargetQty',
      type: 'number',
      label: 'QT',
      defaultValue: 1,
      min: 1,
      buttons: [
        ...(selectedSendersCount > 0
          ? [{
              label: 'Selecionadas',
              value: selectedSendersCount
            }]
          : []),
        ...(currentTargetRetryQty > 0
          ? [{
              label: 'Diff',
              value: currentTargetRetryQty,
              variant: 'warn'
            }]
          : [])
      ]
    })
    if (selectedSendersCount > currentTargetQty) {
      fields.push({
        key: 'typeGenerate',
        type: 'choice',
        label: 'Distribuição',
        defaultValue: 'closest',
        hint: 'Prioridade dos remetentes na distribuição',
        options: [
          { value: 'closest', label: 'Mais próximas' },
          { value: 'furthest', label: 'Mais distantes' }
        ]
      })
      const pairsCount = Math.max(0, Math.floor(Number(selectedSendersCount))) * Math.max(0, Math.floor(Number(currentTargetQty) || 0))
      const optimizedEligible =
        selectedSendersCount > 0
        && currentTargetQty > 0
        && pairsCount <= DISTRIBUTION_OPTIMIZED_MAX_PAIRS
      if (optimizedEligible) {
        fields.push({
          key: 'distributionMode',
          type: 'choice',
          label: 'Motor',
          defaultValue: 'sender_first',
          hint: `Otimizado disponível até ${DISTRIBUTION_OPTIMIZED_MAX_PAIRS} combinações (remetentes x comandos).`,
          options: [
            { value: 'sender_first', label: 'Padrão' },
            { value: 'min_cost_max_flow', label: 'Otimizado' }
          ]
        })
      }
    }
  }
  fields.push({
    key: 'executionCadence',
    type: 'choice',
    label: 'Cadência',
    defaultValue: 'conservative',
    hint: 'Agressivo: menor tempo e maior risco. Conservador: mais intervalo entre fases.',
    options: [
      { value: 'conservative', label: 'Conservador' },
      { value: 'aggressive', label: 'Agressivo' }
    ]
  })
  if (commandType === 'attack') {
    fields.push({
      key: 'scapeTheNight',
      type: 'boolean',
      label: 'Bônus Noturno',
      checkboxLabel: 'Escapar do BN',
      defaultValue: true,
      hint: isMultiScope
        ? 'No multi: orienta a distribuição para evitar chegada na janela de bônus noturno'
        : 'No alvo atual: bloqueia o envio local se a confirmação (fase 2) cair na janela de bônus noturno'
    })
  }
  return fields
}

function getSelectedSendersForMultiDistribution(selectedVillageIds = []) {
  const selectedIdSet = new Set(
    (Array.isArray(selectedVillageIds) ? selectedVillageIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
  )
  if (!selectedIdSet.size) return []
  return (Array.isArray(sendersDataCurrent) ? sendersDataCurrent : [])
    .filter((sender) => selectedIdSet.has(Number(sender?.villageId)))
    .map((sender) => {
      const villageId = Number(sender?.villageId)
      const x = Number(sender?.x)
      const y = Number(sender?.y)
      if (!Number.isFinite(villageId) || !Number.isFinite(x) || !Number.isFinite(y)) return null
      return {
        id: villageId,
        villageId,
        x,
        y,
        ...(sender?.name ? { name: String(sender.name) } : {})
      }
    })
    .filter(Boolean)
}

function buildManyToManyConfigPayload() {
  const night = manyToManyWorldConfigCurrent?.night || {}
  const normalizedNight = normalizeNightBonusConfig(night)
  return {
    night: {
      active: Number.isFinite(Number(normalizedNight?.activeMode))
        ? Math.max(0, Math.floor(Number(normalizedNight.activeMode)))
        : (Number(night?.active) > 0 ? 1 : 0),
      start_hour: normalizedNight?.startHour != null
        ? Number(normalizedNight.startHour)
        : (Number.isFinite(Number(night?.start_hour)) ? Number(night.start_hour) : null),
      end_hour: normalizedNight?.endHour != null
        ? Number(normalizedNight.endHour)
        : (Number.isFinite(Number(night?.end_hour)) ? Number(night.end_hour) : null)
    }
  }
}

function buildWorldNightConfigMetaPayload() {
  const normalized = normalizeNightBonusConfig(nightBonusConfigWorld)
  return {
    active: Number.isFinite(Number(normalized?.activeMode)) ? Number(normalized.activeMode) : 0,
    start_hour: normalized?.startHour == null ? null : Number(normalized.startHour),
    end_hour: normalized?.endHour == null ? null : Number(normalized.endHour)
  }
}

function buildPlayerNightMoralStateMetaPayload({ playerIds = null } = {}) {
  return getPlayerNightMoralStateSnapshot({ playerIds })
}

function buildMultiTargetsDistributePayload(context = {}) {
  const commandType = normalizeTemplateCommandType(context?.commandType || context?.templateStats?.template?.commandMode)
  const selectedVillageIds = Array.isArray(context?.selectedVillageIds) ? context.selectedVillageIds : []
  const multiPlan = context?.multiTargetsPlan || getMultiTargetsExecutionPlan()
  const distributeOptions = context?.executeConfirmOptions || {}
  const distributionMode = String(distributeOptions?.distributionMode || 'sender_first').trim().toLowerCase() === 'min_cost_max_flow'
    ? 'min_cost_max_flow'
    : 'sender_first'
  const senders = getSelectedSendersForMultiDistribution(selectedVillageIds)
  const targets = (Array.isArray(multiPlan?.items) ? multiPlan.items : [])
    .map((item) => {
      const x = Number(item?.x)
      const y = Number(item?.y)
      const qty = Math.max(0, Math.floor(Number(item?.qty) || 0))
      if (!Number.isFinite(x) || !Number.isFinite(y) || qty <= 0) return null
      const idRaw = Number(item?.id)
      const targetMeta = targetsNavigatorMetaByKey.get(`${x}|${y}`) || null
      const playerId = getTargetPlayerIdForNightState(item, targetMeta)
      return {
        id: Number.isFinite(idRaw) ? idRaw : null,
        x,
        y,
        qty,
        ...(playerId != null ? { playerId } : {})
      }
    })
    .filter(Boolean)

  const template = context?.templateStats?.template || null
  const slowestTiming = getTemplateSlowestUnitEffectiveTiming(template)
  const typeGenerate = String(distributeOptions?.typeGenerate || 'closest').trim().toLowerCase() === 'closest'
    ? 'closest'
    : 'furthest'
  const scapeTheNight = commandType === 'attack'
    ? Boolean(distributeOptions?.scapeTheNight)
    : false

  const nowMsRef = Number(useGoTiming?.getEffectiveServerNowMs?.() || Date.now())
  const options = {
    distributionMode,
    typeGenerate,
    nowMs: nowMsRef,
    timezoneOffsetMinutes: new Date(nowMsRef).getTimezoneOffset()
  }
  if (slowestTiming?.slowestUnit) options.slowestUnit = slowestTiming.slowestUnit
  if (Number.isFinite(Number(slowestTiming?.slowestUnitSecondsPerField)) && Number(slowestTiming.slowestUnitSecondsPerField) > 0) {
    options.slowestUnitSecondsPerField = Number(slowestTiming.slowestUnitSecondsPerField)
  }
  if (commandType === 'attack') {
    options.scapeTheNight = scapeTheNight
  }

  const targetPlayerIds = targets
    .map((target) => normalizePlayerStatePlayerId(target?.playerId))
    .filter(Boolean)

  return {
    mode: 'send',
    senders,
    targets,
    template,
    meta: {
      worldNightConfig: buildWorldNightConfigMetaPayload(),
      playerNightMoralState: buildPlayerNightMoralStateMetaPayload({ playerIds: targetPlayerIds })
    },
    config: buildManyToManyConfigPayload(),
    options
  }
}

function buildCurrentTargetDistributePayload(context = {}, plannerTarget = null) {
  const commandType = normalizeTemplateCommandType(context?.commandType || context?.templateStats?.template?.commandMode)
  const selectedVillageIds = Array.isArray(context?.selectedVillageIds) ? context.selectedVillageIds : []
  const requestedQty = getCurrentTargetRequestedQtyFromContext(context)
  const distributeOptions = context?.executeConfirmOptions || {}
  const distributionMode = String(distributeOptions?.distributionMode || 'sender_first').trim().toLowerCase() === 'min_cost_max_flow'
    ? 'min_cost_max_flow'
    : 'sender_first'
  const senders = getSelectedSendersForMultiDistribution(selectedVillageIds)
  const x = Number(plannerTarget?.x)
  const y = Number(plannerTarget?.y)
  if (!Number.isFinite(x) || !Number.isFinite(y) || requestedQty <= 0) {
    return {
      mode: 'send',
      senders,
      targets: [],
      template: context?.templateStats?.template || null,
      meta: {
        worldNightConfig: buildWorldNightConfigMetaPayload(),
        playerNightMoralState: buildPlayerNightMoralStateMetaPayload({ playerIds: [] })
      },
      config: buildManyToManyConfigPayload(),
      options: {}
    }
  }
  const targetMeta = targetsNavigatorMetaByKey.get(`${x}|${y}`) || null
  const playerId = getTargetPlayerIdForNightState(plannerTarget, targetMeta)
  const targets = [{
    id: Number.isFinite(Number(plannerTarget?.id)) ? Number(plannerTarget.id) : null,
    x,
    y,
    qty: requestedQty,
    ...(playerId != null ? { playerId } : {})
  }]

  const template = context?.templateStats?.template || null
  const slowestTiming = getTemplateSlowestUnitEffectiveTiming(template)
  const typeGenerate = String(distributeOptions?.typeGenerate || 'closest').trim().toLowerCase() === 'closest'
    ? 'closest'
    : 'furthest'
  const scapeTheNight = commandType === 'attack'
    ? Boolean(distributeOptions?.scapeTheNight)
    : false
  const nowMsRef = Number(useGoTiming?.getEffectiveServerNowMs?.() || Date.now())
  const options = {
    distributionMode,
    typeGenerate,
    nowMs: nowMsRef,
    timezoneOffsetMinutes: new Date(nowMsRef).getTimezoneOffset()
  }
  if (slowestTiming?.slowestUnit) options.slowestUnit = slowestTiming.slowestUnit
  if (Number.isFinite(Number(slowestTiming?.slowestUnitSecondsPerField)) && Number(slowestTiming.slowestUnitSecondsPerField) > 0) {
    options.slowestUnitSecondsPerField = Number(slowestTiming.slowestUnitSecondsPerField)
  }
  if (commandType === 'attack') {
    options.scapeTheNight = scapeTheNight
  }
  const targetPlayerIds = targets
    .map((target) => normalizePlayerStatePlayerId(target?.playerId))
    .filter(Boolean)

  return {
    mode: 'send',
    senders,
    targets,
    template,
    meta: {
      worldNightConfig: buildWorldNightConfigMetaPayload(),
      playerNightMoralState: buildPlayerNightMoralStateMetaPayload({ playerIds: targetPlayerIds })
    },
    config: buildManyToManyConfigPayload(),
    options
  }
}

function getDispatchTargetsForNightPreflight(context = {}) {
  const targetScope = String(context?.targetScope || 'current')
  if (targetScope === 'multi') {
    const multiPlan = context?.multiTargetsPlan || getMultiTargetsExecutionPlan()
    return (Array.isArray(multiPlan?.items) ? multiPlan.items : [])
      .filter((item) => Math.max(0, Math.floor(Number(item?.qty) || 0)) > 0)
      .map((item) => {
        const x = Number(item?.x)
        const y = Number(item?.y)
        const meta = targetsNavigatorMetaByKey.get(`${x}|${y}`) || null
        const playerId = getTargetPlayerIdForNightState(item, meta)
        return {
          ...item,
          ...(playerId != null ? { playerId } : {})
        }
      })
      .filter((item) => Number.isFinite(Number(item?.x)) && Number.isFinite(Number(item?.y)))
  }
  const current = getPlannerCurrentTargetForTable()
  return current ? [current] : []
}

async function ensureDispatchNightMoralPreflight(context = {}) {
  const worldNightMode = getNightActiveModeFromWorldConfig()
  if (worldNightMode !== 2) return { attempted: false, resolved: 0, failed: 0 }
  const commandType = normalizeTemplateCommandType(context?.commandType || context?.templateStats?.template?.commandMode)
  if (commandType !== 'attack') return { attempted: false, resolved: 0, failed: 0 }
  const scapeTheNight = Boolean(context?.executeConfirmOptions?.scapeTheNight)
  const targets = getDispatchTargetsForNightPreflight(context)
  if (!targets.length) return { attempted: false, resolved: 0, failed: 0 }
  const representativeByPlayer = new Map()
  targets.forEach((target) => {
    const playerId = getTargetPlayerIdForNightState(target)
    if (!playerId) return
    if (!representativeByPlayer.has(playerId)) representativeByPlayer.set(playerId, target)
  })
  const reps = Array.from(representativeByPlayer.values())
  if (!reps.length) return { attempted: true, resolved: 0, failed: 0 }
  const results = await Promise.allSettled(reps.map((target) => ensurePlayerNightMoralStateForTarget(target, {
    requestIfMissing: true,
    requireNight: true,
    requireMorale: false
  })))
  let resolved = 0
  let failed = 0
  results.forEach((item) => {
    if (item.status === 'fulfilled' && item.value?.ok) resolved += 1
    else failed += 1
  })
  if (scapeTheNight && failed > 0) {
    throw new Error(`BN (active=2): não foi possível resolver night de ${failed}/${reps.length} player(s). Envio cancelado para garantir \"Escapar BN\".`)
  }
  return {
    attempted: true,
    resolved,
    failed,
    total: reps.length
  }
}

function formatPtBrInt(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '---'
  return Math.round(num).toLocaleString('pt-BR')
}

function buildPlannerTargetCardVillageFromNavigatorPreview(target = null, meta = null) {
  if (!plannerTargetsMapInfoApi) return null
  return plannerTargetsMapInfoApi.buildPlannerTargetCardVillageFromNavigatorPreview(target, meta, {
    getCachedAjaxMapInfo,
    parseFiniteNumber,
    calcContinentFromCoords,
    onlyNumbers,
    resolveTargetMoraleFromStateOrCache,
    formatMoralePercent,
    resolveTargetNightBonusConfigFromStateOrCache,
    parseNightBonusFromCurrentInterval,
    resolveEffectiveNightBonusConfig,
    buildNightBonusTargetLabel,
    nightBonusConfigWorld
  })
}

function getSendersSelectablePreviewState() {
  const selectionState = cancelEvents.unbindPlannerTableView?.getSelectionState?.() || {}
  return {
    totalSelectableRows: Math.max(0, Math.floor(Number(selectionState?.totalSelectableRows) || 0)),
    selectedSelectableCount: Math.max(0, Math.floor(Number(selectionState?.selectedSelectableCount) || 0))
  }
}

function getDispatchSelectedVillageIdsFromTableSelection() {
  const selectionState = cancelEvents.unbindPlannerTableView?.getSelectionState?.() || {}
  const selectedVillageIdsAll = Array.isArray(selectionState?.selectedVillageIds)
    ? selectionState.selectedVillageIds
    : []
  const selectableVillageIds = Array.isArray(selectionState?.selectableVillageIds)
    ? selectionState.selectableVillageIds
    : []
  const selectedSet = new Set(
    selectedVillageIdsAll
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
  )
  return selectableVillageIds
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && selectedSet.has(value))
}

function hasNightBonusShape(value) {
  if (!value || typeof value !== 'object') return false
  return [
    'active',
    'enabled',
    'isActive',
    'startHour',
    'start_hour',
    'start',
    'startTime',
    'start_time',
    'endHour',
    'end_hour',
    'end',
    'endTime',
    'end_time',
    'duration'
  ].some((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function normalizeNightBonusConfig(rawNight = null) {
  const startHour = parseNightBonusHour(
    rawNight?.startHour ??
    rawNight?.start_hour ??
    rawNight?.start ??
    rawNight?.startTime ??
    rawNight?.start_time
  )
  const endHour = parseNightBonusHour(
    rawNight?.endHour ??
    rawNight?.end_hour ??
    rawNight?.end ??
    rawNight?.endTime ??
    rawNight?.end_time
  )
  const activeRaw = rawNight?.activeMode ?? rawNight?.active ?? rawNight?.enabled ?? rawNight?.isActive
  const activeModeRaw = parseNightBonusActiveMode(activeRaw)
  const hasWindow = startHour != null && endHour != null
  const activeMode = activeModeRaw == null
    ? (hasWindow ? 1 : 0)
    : activeModeRaw
  const active = activeMode > 0
  const durationRaw = Number(rawNight?.duration)
  const duration = Number.isFinite(durationRaw) ? Math.max(0, Math.floor(durationRaw)) : null
  return {
    activeMode,
    active,
    startHour,
    endHour,
    duration
  }
}

function hasNightBonusContent(config = null) {
  const normalized = normalizeNightBonusConfig(config)
  return normalized.startHour != null || normalized.endHour != null || normalized.active || normalized.duration != null
}

function readNightBonusConfigFromSource(source = null) {
  if (!source || typeof source !== 'object') return null
  const candidateKeys = [
    'night',
    'nightBonus',
    'night_bonus',
    'targetNight',
    'targetNightBonus',
    'target_night',
    'target_night_bonus',
    'playerNight',
    'playerNightBonus',
    'player_night',
    'player_night_bonus'
  ]
  const candidates = [source]
  candidateKeys.forEach((key) => {
    const value = source?.[key]
    if (value && typeof value === 'object') candidates.push(value)
  })
  for (const candidate of candidates) {
    if (!hasNightBonusShape(candidate)) continue
    const normalized = normalizeNightBonusConfig(candidate)
    if (hasNightBonusContent(normalized)) return normalized
  }
  return null
}

function resolveEffectiveNightBonusConfig({
  worldConfig = null,
  targetConfig = null
} = {}) {
  const normalizedTarget = normalizeNightBonusConfig(targetConfig)
  const normalizedWorld = normalizeNightBonusConfig(worldConfig)
  const hasTargetWindow = (
    normalizedTarget.active &&
    normalizedTarget.startHour != null &&
    normalizedTarget.endHour != null
  )
  if (hasTargetWindow) return normalizedTarget
  if (normalizedWorld.activeMode === 2) {
    return {
      ...normalizedWorld,
      active: false,
      startHour: null,
      endHour: null
    }
  }
  return normalizedWorld
}

function buildNightBonusSignature(config = null) {
  const normalized = normalizeNightBonusConfig(config)
  return `${normalized.activeMode ?? ''}|${normalized.active ? 1 : 0}|${normalized.startHour ?? ''}|${normalized.endHour ?? ''}|${normalized.duration ?? ''}`
}

function padHour(value) {
  return String(Math.max(0, Math.min(23, Math.floor(Number(value) || 0)))).padStart(2, '0')
}

function formatNightBonusCurrentInterval(config = null) {
  const normalized = normalizeNightBonusConfig(config)
  if (!normalized.active) return null
  if (normalized.startHour == null || normalized.endHour == null) return null
  return `Atual :${padHour(normalized.startHour)}:00-${padHour(normalized.endHour)}:00`
}

function buildNightBonusTargetLabel({
  worldConfig = null,
  targetConfig = null,
  effectiveConfig = null
} = {}) {
  const effectiveLabel = formatNightBonusCurrentInterval(effectiveConfig)
  if (effectiveLabel) return effectiveLabel
  const targetLabel = formatNightBonusCurrentInterval(targetConfig)
  if (targetLabel) return targetLabel
  const worldNormalized = normalizeNightBonusConfig(worldConfig)
  if (worldNormalized.activeMode > 0) {
    const worldLabel = formatNightBonusCurrentInterval(worldNormalized)
    if (worldLabel) return worldLabel
  }
  return null
}

function parseNightBonusFromCurrentInterval(interval = '') {
  const text = String(interval || '').trim()
  if (!text) return null
  const match = text.match(/(\d{1,2})\s*:\s*\d{1,2}\s*-\s*(\d{1,2})\s*:\s*\d{1,2}/)
  if (!match) return null
  const startHour = parseNightBonusHour(match[1])
  const endHour = parseNightBonusHour(match[2])
  if (startHour == null || endHour == null) return null
  return normalizeNightBonusConfig({
    active: 2,
    startHour,
    endHour
  })
}

function normalizeMoralePercent(value) {
  const raw = Number(value)
  if (!Number.isFinite(raw) || raw <= 0) return null
  // TW pode retornar moral como fração (0.67) ou percentual (67 / 100).
  if (raw <= 1) return Math.round(raw * 100)
  return Math.round(raw)
}

function normalizePlayerStatePlayerId(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.trunc(parsed)
}

function normalizePlayerNightMoralStateEntry(raw = null) {
  if (!raw || typeof raw !== 'object') return null
  const playerId = normalizePlayerStatePlayerId(raw?.playerId ?? raw?.id)
  if (!playerId) return null
  const night = readNightBonusConfigFromSource(raw?.night ?? raw)
  const morale = normalizeMoralePercent(raw?.moral ?? raw?.morale)
  return {
    playerId,
    night: night ? { ...night } : null,
    morale: morale == null ? null : morale,
    updatedAtMs: Number.isFinite(Number(raw?.updatedAtMs)) ? Number(raw.updatedAtMs) : Date.now()
  }
}

function resetPlayerNightMoralState() {
  playerNightMoralState = []
  playerNightMoralStateById = new Map()
  playerNightMoralStateRequestByPlayerId = new Map()
}

function upsertPlayerNightMoralStateEntry(rawEntry = null) {
  const normalized = normalizePlayerNightMoralStateEntry(rawEntry)
  if (!normalized) return { changed: false, entry: null }
  const prev = playerNightMoralStateById.get(normalized.playerId) || null
  const next = {
    playerId: normalized.playerId,
    night: normalized.night ? { ...normalized.night } : (prev?.night ? { ...prev.night } : null),
    morale: normalized.morale != null ? normalized.morale : (prev?.morale ?? null),
    updatedAtMs: Date.now()
  }
  const prevSignature = JSON.stringify({
    night: prev?.night || null,
    morale: prev?.morale ?? null
  })
  const nextSignature = JSON.stringify({
    night: next?.night || null,
    morale: next?.morale ?? null
  })
  playerNightMoralStateById.set(next.playerId, next)
  const idx = playerNightMoralState.findIndex((item) => Number(item?.playerId) === next.playerId)
  if (idx >= 0) playerNightMoralState[idx] = next
  else playerNightMoralState.push(next)
  return {
    changed: prevSignature !== nextSignature,
    entry: next
  }
}

function getPlayerNightMoralStateEntry(playerId = null) {
  const nextPlayerId = normalizePlayerStatePlayerId(playerId)
  if (!nextPlayerId) return null
  return playerNightMoralStateById.get(nextPlayerId) || null
}

function getPlayerNightMoralStateSnapshot({ playerIds = null } = {}) {
  const filterSet = (
    Array.isArray(playerIds)
      ? new Set(playerIds.map((value) => normalizePlayerStatePlayerId(value)).filter(Boolean))
      : null
  )
  return playerNightMoralState
    .filter((entry) => {
      if (!filterSet) return true
      return filterSet.has(Number(entry?.playerId))
    })
    .map((entry) => ({
      playerId: Number(entry?.playerId),
      night: entry?.night ? { ...entry.night } : null,
      morale: entry?.morale == null ? null : Number(entry.morale)
    }))
}

function readPlayerNightBonusConfigFromState(playerId = null) {
  const entry = getPlayerNightMoralStateEntry(playerId)
  return entry?.night ? normalizeNightBonusConfig(entry.night) : null
}

function readPlayerMoraleFromState(playerId = null) {
  const entry = getPlayerNightMoralStateEntry(playerId)
  return normalizeMoralePercent(entry?.morale)
}

function getTargetPlayerIdForNightState(target = null, fallbackMeta = null) {
  return normalizePlayerStatePlayerId(
    target?.playerId ??
    target?.player_id ??
    target?.owner ??
    fallbackMeta?.playerId ??
    fallbackMeta?.player_id ??
    fallbackMeta?.owner ??
    fallbackMeta?.player?.id
  )
}

function getTargetIdForMapInfo(target = null, fallbackMeta = null) {
  const value = Number(
    target?.id ??
    target?.targetId ??
    fallbackMeta?.id ??
    fallbackMeta?.village?.id
  )
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.trunc(value)
}

function applyMapInfoToPlayerNightMoralState({
  target = null,
  fallbackMeta = null,
  mapInfo = null
} = {}) {
  if (!mapInfo || typeof mapInfo !== 'object') return { changed: false, entry: null }
  const playerId = getTargetPlayerIdForNightState(target, fallbackMeta)
  if (!playerId) return { changed: false, entry: null }
  const morale = normalizeMoralePercent(mapInfo?.morale)
  const night = parseNightBonusFromCurrentInterval(mapInfo?.night_bonus?.current_interval)
  if (!night && morale == null) return { changed: false, entry: getPlayerNightMoralStateEntry(playerId) }
  return upsertPlayerNightMoralStateEntry({
    playerId,
    ...(night ? { night } : {}),
    ...(morale != null ? { moral: morale } : {})
  })
}

function resolveTargetNightBonusConfigFromStateOrCache({
  target = null,
  fallbackMeta = null,
  preferSource = null
} = {}) {
  const playerId = getTargetPlayerIdForNightState(target, fallbackMeta)
  const fromState = readPlayerNightBonusConfigFromState(playerId)
  if (fromState && fromState.active) return fromState
  const targetId = getTargetIdForMapInfo(target, fallbackMeta)
  const cachedMapInfo = targetId ? (getCachedAjaxMapInfo(targetId) || null) : null
  if (cachedMapInfo) {
    const applied = applyMapInfoToPlayerNightMoralState({ target, fallbackMeta, mapInfo: cachedMapInfo })
    const fromStateAfterCache = readPlayerNightBonusConfigFromState(playerId)
    if (fromStateAfterCache && fromStateAfterCache.active) return fromStateAfterCache
    const fromCache = parseNightBonusFromCurrentInterval(cachedMapInfo?.night_bonus?.current_interval)
    if (fromCache && fromCache.active) return fromCache
    if (applied?.entry?.night) return normalizeNightBonusConfig(applied.entry.night)
  }
  return readNightBonusConfigFromSource(preferSource ?? fallbackMeta ?? target)
}

function resolveTargetMoraleFromStateOrCache({ target = null, fallbackMeta = null } = {}) {
  const playerId = getTargetPlayerIdForNightState(target, fallbackMeta)
  const moraleFromState = readPlayerMoraleFromState(playerId)
  if (moraleFromState != null) return moraleFromState
  const targetId = getTargetIdForMapInfo(target, fallbackMeta)
  const cachedMapInfo = targetId ? (getCachedAjaxMapInfo(targetId) || null) : null
  if (!cachedMapInfo) return null
  const applied = applyMapInfoToPlayerNightMoralState({ target, fallbackMeta, mapInfo: cachedMapInfo })
  return normalizeMoralePercent(applied?.entry?.morale ?? cachedMapInfo?.morale)
}

function getNightActiveModeFromWorldConfig() {
  return Number(normalizeNightBonusConfig(nightBonusConfigWorld).activeMode || 0)
}

async function ensurePlayerNightMoralStateForTarget(target = null, {
  requestIfMissing = true,
  requireNight = true,
  requireMorale = false
} = {}) {
  const playerId = getTargetPlayerIdForNightState(target)
  if (!playerId) {
    return {
      ok: true,
      playerId: null,
      barbarian: true,
      night: normalizeNightBonusConfig(nightBonusConfigWorld),
      morale: 100,
      source: 'barbarian'
    }
  }

  const currentEntry = getPlayerNightMoralStateEntry(playerId)
  const hasNight = Boolean(readNightBonusConfigFromState(playerId)?.active)
  const hasMorale = normalizeMoralePercent(currentEntry?.morale) != null
  if ((!requireNight || hasNight) && (!requireMorale || hasMorale)) {
    return { ok: true, playerId, source: 'state', entry: currentEntry }
  }

  const targetId = getTargetIdForMapInfo(target)
  const cachedMapInfo = targetId ? getCachedAjaxMapInfo(targetId) : null
  if (cachedMapInfo) {
    const applied = applyMapInfoToPlayerNightMoralState({ target, mapInfo: cachedMapInfo })
    applyMapInfoToTargetsNavigatorMeta(target, cachedMapInfo)
    const entryAfterCache = getPlayerNightMoralStateEntry(playerId)
    const cacheHasNight = Boolean(readPlayerNightBonusConfigFromState(playerId)?.active)
    const cacheHasMorale = normalizeMoralePercent(entryAfterCache?.morale) != null
    if ((!requireNight || cacheHasNight) && (!requireMorale || cacheHasMorale)) {
      return { ok: true, playerId, source: 'window', entry: entryAfterCache, changed: Boolean(applied?.changed) }
    }
  }

  if (!requestIfMissing || !targetId) {
    return { ok: false, playerId, source: 'missing', entry: getPlayerNightMoralStateEntry(playerId) || null }
  }

  if (playerNightMoralStateRequestByPlayerId.has(playerId)) {
    return playerNightMoralStateRequestByPlayerId.get(playerId)
  }

  const promise = (async () => {
    try {
      const mapInfo = await getAjaxMapInfo(targetId, { requestIfMissing: true })
      if (mapInfo) {
        applyMapInfoToPlayerNightMoralState({ target, mapInfo })
        applyMapInfoToTargetsNavigatorMeta(target, mapInfo)
      }
      const entry = getPlayerNightMoralStateEntry(playerId)
      const reqHasNight = Boolean(readPlayerNightBonusConfigFromState(playerId)?.active)
      const reqHasMorale = normalizeMoralePercent(entry?.morale) != null
      return {
        ok: (!requireNight || reqHasNight) && (!requireMorale || reqHasMorale),
        playerId,
        source: 'request',
        entry
      }
    } finally {
      playerNightMoralStateRequestByPlayerId.delete(playerId)
    }
  })()

  playerNightMoralStateRequestByPlayerId.set(playerId, promise)
  return promise
}

async function prefetchPlayerNightMoralStateForTargets(targets = [], {
  concurrency = 4
} = {}) {
  if (getNightActiveModeFromWorldConfig() !== 2) return
  const representativeByPlayerId = new Map()
  ;(Array.isArray(targets) ? targets : []).forEach((target) => {
    const playerId = getTargetPlayerIdForNightState(target)
    if (!playerId) return
    if (readPlayerNightBonusConfigFromState(playerId)?.active) return
    if (representativeByPlayerId.has(playerId)) return
    representativeByPlayerId.set(playerId, target)
  })
  const queue = Array.from(representativeByPlayerId.values())
  if (!queue.length) return

  const limit = Math.max(1, Math.min(10, Math.floor(Number(concurrency) || 4)))
  for (let i = 0; i < queue.length; i += limit) {
    const batch = queue.slice(i, i + limit)
    await Promise.allSettled(batch.map((target) => ensurePlayerNightMoralStateForTarget(target, {
      requestIfMissing: true,
      requireNight: true,
      requireMorale: false
    })))
  }
}

function formatMoralePercent(value) {
  const normalized = normalizeMoralePercent(value)
  if (normalized == null) return null
  return `${normalized}%`
}

function normalizeReservationInfo(value) {
  if (!value || typeof value !== 'object') return null
  const nameRaw = value?.name
  const allyRaw = value?.ally
  const rawExpires = (
    value?.expires_at ??
    value?.expiresAt ??
    value?.expires ??
    value?.expire_at ??
    value?.end_at ??
    null
  )
  const name = nameRaw == null ? '' : String(nameRaw)
  const ally = allyRaw == null ? '' : String(allyRaw)
  const expiresAt = rawExpires == null ? '' : String(rawExpires)
  if (!name && !ally && !expiresAt) return null
  return {
    name,
    ally,
    expiresAt
  }
}

function buildReservationDataTitle(reservation) {
  const normalized = normalizeReservationInfo(reservation)
  if (!normalized) return null
  return `${normalized.name} | ${normalized.ally}<br>expira: ${normalized.expiresAt}`
}

function updateTargetReservationLock(plannerTargetNode, reservation) {
  const anchor = plannerTargetNode?.querySelector?.('#place_target .village_anchor')
  if (!anchor) return
  anchor.querySelector('.go-target-reservation-lock')?.remove()
  const dataTitle = buildReservationDataTitle(reservation)
  if (!dataTitle) return
  const lock = document.createElement('span')
  lock.className = 'go-target-reservation-lock icon header reserve'
  lock.setAttribute('data-title', dataTitle)
  lock.setAttribute('aria-label', 'Reserva ativa')
  anchor.insertAdjacentElement('beforeend', lock)
}

function setPlannerPopupLoading(isLoading) {
  const popup = document.querySelector('#go-popup-map-planner')
  if (!popup) return
  popup.classList.toggle('go-popup-loading', Boolean(isLoading))
}

function createPlannerPopupStateProxy() {
  return {
    get fakeLimitPercent() { return fakeLimitPercent },
    set fakeLimitPercent(value) { fakeLimitPercent = value },
    get nightBonusConfigWorld() { return nightBonusConfigWorld },
    set nightBonusConfigWorld(value) { nightBonusConfigWorld = value },
    get nightBonusConfigTarget() { return nightBonusConfigTarget },
    set nightBonusConfigTarget(value) { nightBonusConfigTarget = value },
    get nightBonusConfig() { return nightBonusConfig },
    set nightBonusConfig(value) { nightBonusConfig = value },
    get manyToManyWorldConfigCurrent() { return manyToManyWorldConfigCurrent },
    set manyToManyWorldConfigCurrent(value) { manyToManyWorldConfigCurrent = value },
    get snobMaxDistance() { return snobMaxDistance },
    set snobMaxDistance(value) { snobMaxDistance = value },
    get plannerTargetCurrent() { return plannerTargetCurrent },
    set plannerTargetCurrent(value) { plannerTargetCurrent = value },
    get senderVillageByIdCache() { return senderVillageByIdCache },
    set senderVillageByIdCache(value) { senderVillageByIdCache = value },
    get targetsNavigatorQtyByKey() { return targetsNavigatorQtyByKey },
    set targetsNavigatorQtyByKey(value) { targetsNavigatorQtyByKey = value },
    get targetsNavigatorMetaByKey() { return targetsNavigatorMetaByKey },
    set targetsNavigatorMetaByKey(value) { targetsNavigatorMetaByKey = value },
    get targetsNavigatorEnrichSeq() { return targetsNavigatorEnrichSeq },
    set targetsNavigatorEnrichSeq(value) { targetsNavigatorEnrichSeq = value },
    get targetsNavigatorSignature() { return targetsNavigatorSignature },
    set targetsNavigatorSignature(value) { targetsNavigatorSignature = value },
    get targetsNavigatorCurrentTargets() { return targetsNavigatorCurrentTargets },
    set targetsNavigatorCurrentTargets(value) { targetsNavigatorCurrentTargets = value },
    get targetsNavigatorMapInfoRequestByKey() { return targetsNavigatorMapInfoRequestByKey },
    set targetsNavigatorMapInfoRequestByKey(value) { targetsNavigatorMapInfoRequestByKey = value },
    get dispatchTargetScope() { return dispatchTargetScope },
    set dispatchTargetScope(value) { dispatchTargetScope = value },
    get syncDispatchScopeUiCurrent() { return syncDispatchScopeUiCurrent },
    set syncDispatchScopeUiCurrent(value) { syncDispatchScopeUiCurrent = value },
    get syncTargetsNavigatorTogglePreviewUiCurrent() { return syncTargetsNavigatorTogglePreviewUiCurrent },
    set syncTargetsNavigatorTogglePreviewUiCurrent(value) { syncTargetsNavigatorTogglePreviewUiCurrent = value },
    get rerenderTargetsNavigatorRowsCurrent() { return rerenderTargetsNavigatorRowsCurrent },
    set rerenderTargetsNavigatorRowsCurrent(value) { rerenderTargetsNavigatorRowsCurrent = value },
    get syncPlannerLastReportIndicatorUiCurrent() { return syncPlannerLastReportIndicatorUiCurrent },
    set syncPlannerLastReportIndicatorUiCurrent(value) { syncPlannerLastReportIndicatorUiCurrent = value },
    get syncPlannerTargetCardPreviewCurrent() { return syncPlannerTargetCardPreviewCurrent },
    set syncPlannerTargetCardPreviewCurrent(value) { syncPlannerTargetCardPreviewCurrent = value },
    get plannerDataCurrent() { return plannerDataCurrent },
    set plannerDataCurrent(value) { plannerDataCurrent = value },
    get plannerSeedTargetCurrent() { return plannerSeedTargetCurrent },
    set plannerSeedTargetCurrent(value) { plannerSeedTargetCurrent = value },
    get targetsNavigatorActiveKeyCurrent() { return targetsNavigatorActiveKeyCurrent },
    set targetsNavigatorActiveKeyCurrent(value) { targetsNavigatorActiveKeyCurrent = value },
    get targetsDraftPersistSignatureCurrent() { return targetsDraftPersistSignatureCurrent },
    set targetsDraftPersistSignatureCurrent(value) { targetsDraftPersistSignatureCurrent = value }
  }
}

async function showPopUpPlanner(data) {
  const { showPopUpPlanner: showPlannerPopupInModule } = await loadPlannerPopupModule()
  return showPlannerPopupInModule(data, {
    state: createPlannerPopupStateProxy(),
    cancelEvents,
    commandCache,
    inFlight,
    dataUnits,
    loadPlannerTargetModules,
    getTargeSelection,
    setPlannerPopupLoading,
    onlyNumbers,
    calcContinentFromCoords,
    readNightBonusConfigFromSource,
    resolveEffectiveNightBonusConfig,
    parseFiniteNumber,
    syncCurrentTargetScopeSelectorUi,
    syncCurrentPlannerTargetDispatchStatusUi,
    ensureTargetsNavigatorPreviewMapInfo,
    buildPlannerTargetCardVillageFromNavigatorPreview,
    updateTargetReservationLock,
    syncPlannerActiveTargetFromPreview,
    insertTargetsAccordion,
    ensurePlannerLastReportIndicator,
    buildNightBonusTargetLabel,
    formatMoralePercent,
    applyMapInfoToPlayerNightMoralState,
    resolveTargetNightBonusConfigFromStateOrCache,
    parseNightBonusFromCurrentInterval,
    buildNightBonusSignature,
    getCachedAjaxMapInfo,
    renderPlannerSendersTable,
    getNightActiveModeFromWorldConfig,
    getTargetPlayerIdForNightState,
    readPlayerNightBonusConfigFromState,
    normalizeMoralePercent,
    getAjaxMapInfo,
    normalizeNightBonusConfig,
    bringData,
    resetPlayerNightMoralState
  })
}

function cancelEventPlannerTableView() {
  if (cancelEvents.unbindPlannerTableView) {
    cancelEvents.unbindPlannerTableView();
    cancelEvents.unbindPlannerTableView = null;
  }
}

function flexContainer() {
  const popUpBoxContent = document.querySelector('.popup_box_content')
  if (!popUpBoxContent) throw new Error('Popup not exist')
  let flexContainerEl = popUpBoxContent.querySelector('.go-flex-container')
  if (!flexContainerEl) {
    flexContainerEl = document.createElement('div')
    flexContainerEl.className = 'go-flex-container'
    popUpBoxContent.insertAdjacentElement('beforeend', flexContainerEl)
  }
  return flexContainerEl;
}

function insertGroups(data, groupElement) {
  if (!groupElement) throw new Error("Select de grupos não encontrado");
  const REFRESH_GROUP_COOLDOWN_MS = 3000
  const initialGroupId = Number(groupElement.value)
  if (Number.isFinite(initialGroupId)) defaultGroupId = initialGroupId
  const plannerGroups = document.createElement('div')
  plannerGroups.id = 'go-planner-groups'
  plannerGroups.className = 'go-ml'
  plannerGroups.insertAdjacentHTML('beforeend', `<label for="command_sender_group">Grupos:</label>`)
  plannerGroups.insertAdjacentElement('beforeend', groupElement)
  plannerGroups.insertAdjacentHTML('beforeend', buttonRefresh)
  const refreshButton = plannerGroups.querySelector('button[data-command-group-refresh]')
  const refreshIcon = refreshButton?.querySelector('img')
  let refreshCooldownTimer = null
  const setRefreshPendingState = (pending) => {
    if (!refreshButton) return
    refreshButton.disabled = pending
    refreshButton.classList.toggle('is-pending', pending)
    refreshButton.setAttribute('aria-busy', pending ? 'true' : 'false')
    if (pending) refreshButton.setAttribute('data-title', 'Atualizando vilas do grupo...')
    else refreshButton.setAttribute('data-title', 'Atualizar vilas do grupo')
    refreshIcon?.classList.toggle('is-spinning', pending)
  }
  const refreshSendersFromGroup = async (groupId) => {
    await searchSenders(data, groupId)
    renderPlannerSendersTable({ preserveSelection: false })
  }
  const onChangeGroups = async (e) => {
    defaultGroupId = Number(e.target.value)
    try {
      await refreshSendersFromGroup(defaultGroupId)
    } catch (error) {
      console.error(error)
    }
  }
  const onRefreshGroups = async () => {
    if (!refreshButton) return
    if (refreshButton.disabled) return
    const groupId = Number(groupElement.value)
    defaultGroupId = groupId
    try {
      setRefreshPendingState(true)
      await refreshPlannerProductionSnapshot({
        forceRefresh: true
      })
      senderVillageByIdCache = null
      await refreshSendersFromGroup(groupId)
    } catch (error) {
      console.error(error)
    } finally {
      if (refreshCooldownTimer) window.clearTimeout(refreshCooldownTimer)
      refreshCooldownTimer = window.setTimeout(() => {
        setRefreshPendingState(false)
      }, REFRESH_GROUP_COOLDOWN_MS)
    }
  }
  groupElement.addEventListener('change', onChangeGroups)
  refreshButton?.addEventListener('click', onRefreshGroups)
  cancelEvents.cancelChangeGroup = () => {
    groupElement.removeEventListener("change", onChangeGroups)
    refreshButton?.removeEventListener('click', onRefreshGroups)
    if (refreshCooldownTimer) window.clearTimeout(refreshCooldownTimer)
    refreshCooldownTimer = null
    setRefreshPendingState(false)
  };
  const flexContainerEl = flexContainer();
  flexContainerEl.insertAdjacentElement('beforeend', plannerGroups)
  return groupElement.value
}

async function insertPlannerTemplatesView() {
  const popUpBoxContent = document.querySelector('.popup_box_content')
  if (!popUpBoxContent) throw new Error('Popup not exist')
  const { plannerTemplatesView } = await loadPlannerTemplatesModule()
  const incomingTemplateComponentState = (
    plannerDataCurrent?.templateComponentState
    && typeof plannerDataCurrent.templateComponentState === 'object'
  )
    ? plannerDataCurrent.templateComponentState
    : (
      plannerDataCurrent?.templateState && typeof plannerDataCurrent.templateState === 'object'
        ? plannerDataCurrent.templateState
        : null
    )
  cancelEvents.plannerTemplatesView = await plannerTemplatesView(popUpBoxContent, dataUnits, {
    initialComponentState: incomingTemplateComponentState,
    onComponentStateChange: () => {
      persistPlannerTargetsDraftFromNavigatorState()
    }
  })
  templateStatsCurrent = cancelEvents.plannerTemplatesView?.getTemplateStats?.() || null
  templateStatsHintCurrent = cancelEvents.plannerTemplatesView?.getTemplateStatsAny?.() || null
  persistPlannerTargetsDraftFromNavigatorState()
  cancelEvents.cancelPlannerTemplatesView = () => cancelEvents.plannerTemplatesView?.unbind?.()
}

function getActiveDispatchMode() {
  if (modeController?.getMode) return modeController.getMode()
  if (initialDispatchMode === 'send' || initialDispatchMode === 'schedule') {
    if (initialDispatchMode === 'schedule' && !isPlannerScheduleEnabled()) return 'send'
    return initialDispatchMode
  }
  return isPlannerScheduleEnabled() ? 'schedule' : 'send'
}

function scheduleModeSwitchRender() {
  const mode = getActiveDispatchMode()
  const modeChanged = mode !== currentTableDispatchMode
  const canRenderTable = modeChanged && typeof renderSendersTableCurrent === 'function'
  isModeSwitchRenderPending = canRenderTable
  if (dispatchModeSwitchRafId != null) {
    window.cancelAnimationFrame(dispatchModeSwitchRafId)
    dispatchModeSwitchRafId = null
  }
  if (dispatchModeSwitchTimerId != null) clearTimeout(dispatchModeSwitchTimerId)
  const runWork = () => {
    setDispatchDateTimeMode(mode)
    dispatchController?.refreshButtons?.()
    if (!canRenderTable) return
    dispatchModeSwitchTimerId = setTimeout(() => {
      dispatchModeSwitchTimerId = null
      renderSendersTableCurrent?.()
    }, 0)
  }
  if (typeof window.requestAnimationFrame === 'function') {
    // 1o frame deixa o estado visual do botão pintar; 2o frame dispara trabalho pesado.
    dispatchModeSwitchRafId = window.requestAnimationFrame(() => {
      dispatchModeSwitchRafId = window.requestAnimationFrame(() => {
        dispatchModeSwitchRafId = null
        runWork()
      })
    })
    return
  }
  setTimeout(runWork, 0)
}

async function insertPlannerModeView() {
  const popUpBoxContent = document.querySelector('.popup_box_content')
  if (!popUpBoxContent) throw new Error('Popup not exist')
  const { plannerModeView, readyPlannerModeStorage } = await loadPlannerModeModule()
  if (typeof readyPlannerModeStorage === 'function') {
    await readyPlannerModeStorage()
  }
  const controller = plannerModeView(popUpBoxContent, {
    mode: initialDispatchMode,
    sendConflictTroopsMode,
    onModeChange: ({ mode }) => {
      scheduleModeSwitchRender()
      persistPlannerTargetsDraftFromNavigatorState()
    },
    onSendConflictTroopsModeChange: ({ mode }) => {
      sendConflictTroopsMode = normalizeConflictTroopsMode(mode)
      persistSendConflictTroopsMode(sendConflictTroopsMode)
      if (getActiveDispatchMode() === 'send') renderSendersTableCurrent?.()
    }
  })
  modeController = controller || modeController
  initialDispatchMode = getActiveDispatchMode()
  cancelEvents.plannerModeView = modeController
  cancelEvents.cancelPlannerModeView = () => {
    modeController?.unbind?.()
    modeController = null
  }
}

function insertSendersContent() {
  const popUpBoxContent = document.querySelector('.popup_box_content')
  if (!popUpBoxContent) throw new Error('Popup not exist')
  if (document.querySelector('#go-planner-senders')) return
  const plannerSenders = document.createElement('div')
  plannerSenders.id = 'go-planner-senders'
  popUpBoxContent.insertAdjacentElement('beforeend', plannerSenders)
}

async function insertExecutionFeedOverlay() {
  const popUpBoxContent = document.querySelector('.popup_box_content')
  if (!popUpBoxContent) throw new Error('Popup not exist')
  const { createExecutionFeed } = await loadPlannerExecutionFeedModule()
  executionFeedController?.destroy?.()
  executionFeedController = createExecutionFeed(popUpBoxContent, {
    maxRows: 5000,
    autoCloseMs: 0
  })
  cancelEvents.cancelExecutionFeedOverlay = () => {
    executionFeedController?.destroy?.()
    executionFeedController = null
  }
}

function setDispatchDateTimeMode(mode) {
  const normalized = mode === 'schedule' ? 'schedule' : 'send'
  const isSend = normalized === 'send'
  inputDateTimeController?.setMode?.(normalized)
  inputDateTimeController?.setDisabled?.(isSend)
}

function insertInputDateTimeContent() {
  const flexContainerEl = flexContainer();
  if (document.querySelector('#go-dtgrp-content')) return;
  const inputDateTimeContent = document.createElement('div')
  inputDateTimeContent.id = 'go-dtgrp-content'
  inputDateTimeContent.className = 'go-ml'
  flexContainerEl.insertAdjacentElement('beforeend', inputDateTimeContent)
  return inputDateTimeContent
}

async function executePlannerDispatchActionLazy({ mode, getContext, root }) {
  const { executePlannerDispatchAction } = await loadPlannerDispatchExecutionModule()
  return executePlannerDispatchAction({
    mode,
    getContext,
    root,
    deps: {
      UI,
      activeTargetsDraftIdCurrent,
      applyDistributionStatusToTarget,
      applyDistributionStatusToTargets,
      applySentUnitsToSendersAndTable,
      applyTargetSendResultStatus,
      beginPlannerSendExecution,
      buildCaptchaInterruptedDiagnostics,
      buildCurrentTargetDistributePayload,
      buildDispatchDiagnosticsFormatItemFromStatus,
      buildMultiDistributeCommandsByTarget,
      buildMultiTargetsDistributePayload,
      buildOptimizedDistributionDebugSummary,
      buildPendingSendCommandId,
      buildPlayerNightMoralStateMetaPayload,
      buildSinglePendingSendCommands,
      buildTargetDispatchAggregateEntry,
      buildWorldNightConfigMetaPayload,
      calcContinentFromCoords,
      clearPlannerPendingSendSession,
      collectPendingSendCommandIds,
      consoleDev,
      createMultiTargetScopedExecutionView,
      endPlannerSendExecution,
      ensureDispatchNightMoralPreflight,
      executionFeedController,
      formatDispatchDiagnosticsBatchLocal,
      getCurrentTargetRequestedQtyFromContext,
      getMultiTargetsExecutionPlan,
      getTargetDispatchStatus,
      getTargetListKey,
      loadPlannerExecutionModule,
      nightBonusConfig,
      persistPlannerTargetsDraftFromNavigatorState,
      plannerSendRunning,
      plannerTargetCurrent,
      postCommandDistribute,
      recoverUnexpectedInterruptionBeforeNextExecution,
      refreshIncomingTargetIfOpen,
      removePlannerPendingSendCommands,
      rerenderTargetsNavigatorRowsCurrent,
      resolveTargetNightBonusConfigFromStateOrCache,
      savePlannerLastDistributionReport,
      savePlannerLastExecutionReport,
      savePlannerLastMultiDispatchReport,
      sendersDataCurrent,
      setTargetDispatchStatus,
      shouldUseCurrentTargetDistribution,
      startPlannerPendingSendSession,
      syncCurrentPlannerTargetDispatchStatusUi,
      targetsNavigatorMetaByKey
    }
  })
}

async function insertDinpatchContent() {
  const flexContainerEl = flexContainer()
  const { createDispatch } = await loadPlannerDispatchModule()
  const nextController = createDispatch(flexContainerEl, {
    getMode: () => getActiveDispatchMode(),
    getExecuteConfirmSchema: (mode, context) => getDispatchMultiSendConfirmSchema(mode, context),
    getContext: (mode) => {
      const dispatchSelectedVillageIds = getDispatchSelectedVillageIdsFromTableSelection()
      return {
        ...(mode ? {
          selectionFirstAttackEstimate: null,
          selectionFirstAttackEstimateBuilder: (executeConfirmOptions = {}) => buildConfirmSelectionFirstAttackEstimate({
            mode,
            selectedVillageIds: dispatchSelectedVillageIds,
            executeConfirmOptions,
            targetScope: getDispatchTargetScope()
          })
        } : {}),
        mode,
        commandType: getCurrentTemplateCommandType(),
        dateTime: dateTimeValue,
        fakeLimitPercent,
        targetPlayerId: plannerTargetCurrent?.playerId ?? null,
        nightBonusConfig: nightBonusConfig ? { ...nightBonusConfig } : null,
        worldNightConfig: buildWorldNightConfigMetaPayload(),
        playerNightMoralState: buildPlayerNightMoralStateMetaPayload(),
        minSpyCommand,
        conflictTroopsMode: getConflictTroopsModeForTable(mode),
        templateStats: templateStatsCurrent,
        templateStatsHint: templateStatsHintCurrent,
        selectedVillageIds: dispatchSelectedVillageIds,
        targetScope: getDispatchTargetScope(),
        multiTargetsPlan: getMultiTargetsExecutionPlan()
      }
    },
    actions: {
      execute: async ({ mode, getContext, root }) => executePlannerDispatchActionLazy({ mode, getContext, root })
    }
  })
  dispatchController = nextController || dispatchController
  const dispatchRoot = dispatchController?.root || null
  syncDispatchScopeUiCurrent = () => {
    const activeScope = getDispatchTargetScope()
    syncDispatchScopeSelectorUi()
    const executeLabelEl = dispatchRoot?.querySelector?.('[data-dispatch-label]')
    if (executeLabelEl) {
      const baseText = getDispatchExecuteButtonLabel(getActiveDispatchMode(), getCurrentTemplateCommandType())
      executeLabelEl.textContent = baseText
    }
    const multiPlan = getMultiTargetsExecutionPlan()
    if (dispatchRoot) {
      dispatchRoot.dataset.targetScope = activeScope
      dispatchRoot.dataset.multiTargets = String(multiPlan.activeTargets || 0)
      dispatchRoot.dataset.multiCommands = String(multiPlan.totalCommands || 0)
    }
  }
  syncDispatchScopeUiCurrent()
  setDispatchDateTimeMode(getActiveDispatchMode())
  cancelEvents.destroyDispatch = () => {
      if (dispatchModeSwitchTimerId != null) {
        clearTimeout(dispatchModeSwitchTimerId)
        dispatchModeSwitchTimerId = null
      }
      if (dispatchModeSwitchRafId != null) {
        window.cancelAnimationFrame(dispatchModeSwitchRafId)
        dispatchModeSwitchRafId = null
      }
      syncDispatchScopeUiCurrent = null
      dispatchController?.destroy?.()
      dispatchController = null
    }
}

function updateDispatchButtonsState() {
  if (!dispatchController) return
  const selectedVillageIds = cancelEvents.unbindPlannerTableView?.getSelectedVillageIds?.() || []
  const hasSelectedRows = selectedVillageIds.length > 0
  const targetScope = getDispatchTargetScope()
  const multiPlan = getMultiTargetsExecutionPlan()
  let disabled = !hasSelectedRows
  let disabledTitle = !hasSelectedRows ? 'Nenhuma vila selecionada' : ''
  if (!disabled && targetScope === 'multi' && multiPlan.activeTargets <= 0) {
    disabled = true
    disabledTitle = 'Defina quantidade > 0 em pelo menos 1 alvo'
  }
  dispatchController.setDisabled('execute', disabled, disabledTitle)
  syncDispatchScopeUiCurrent?.()
}

function applySentUnitsToSendersAndTable(executionResult = null) {
  const sentUnitsByVillageId = Array.isArray(executionResult?.sentUnitsByVillageId)
    ? executionResult.sentUnitsByVillageId
    : []
  if (!sentUnitsByVillageId.length) return false
  const senders = Array.isArray(sendersDataCurrent) ? sendersDataCurrent : []
  if (!senders.length) return false
  const senderByVillageId = new Map(
    senders
      .filter((sender) => Number.isFinite(Number(sender?.villageId)))
      .map((sender) => [Number(sender.villageId), sender])
  )
  let changed = false
  sentUnitsByVillageId.forEach((entry) => {
    const villageId = Number(entry?.villageId)
    if (!Number.isFinite(villageId)) return
    const sender = senderByVillageId.get(villageId)
    if (!sender || !Array.isArray(sender.units)) return
    const sentUnits = Array.isArray(entry?.units) ? entry.units : []
    const limit = Math.min(sender.units.length, sentUnits.length)
    for (let index = 0; index < limit; index += 1) {
      const sent = Number(sentUnits[index])
      if (!Number.isFinite(sent) || sent <= 0) continue
      const current = Number(sender.units[index])
      const safeCurrent = Number.isFinite(current) ? Math.max(0, Math.floor(current)) : 0
      const next = Math.max(0, safeCurrent - Math.floor(sent))
      if (next === safeCurrent) continue
      sender.units[index] = next
      changed = true
    }
  })
  if (!changed) return false
  // Após envio bem-sucedido, limpar seleção evita manter rows "active" que ficaram inválidas/filtradas.
  renderSendersTableCurrent?.({ preserveSelection: false })
  updateDispatchButtonsState()
  return true
}

function refreshIncomingTargetIfOpen(executionResult = null) {
  const sentUnitsByVillageId = Array.isArray(executionResult?.sentUnitsByVillageId)
    ? executionResult.sentUnitsByVillageId
    : []
  if (!sentUnitsByVillageId.length) return false
  const incomingTarget = document.querySelector('#go-incoming-target')
  if (!incomingTarget) return false
  const targetContent = document.querySelector('#go-target-content')
  if (!targetContent) return false
  targetContent.dispatchEvent(new CustomEvent('go:planner:incoming:refresh'))
  return true
}

function calcContinentFromCoords(x, y) {
  const numX = parseFiniteNumber(x)
  const numY = parseFiniteNumber(y)
  if (numX == null || numY == null) return null
  return (Math.floor(numY / 100) * 10) + Math.floor(numX / 100)
}

function parseFiniteNumber(value) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseSenderVillageInfo(cell) {
  const anchor = cell?.querySelector?.('a')
  const rawText = String(anchor?.textContent || cell?.textContent || '')
    .replace(/\s+/g, ' ')
    .trim()
  return parseSenderVillageInfoText(rawText)
}

function parseSenderVillageInfoText(rawText = '') {
  const coordsMatch = rawText.match(/\(\s*(\d+)\s*\|\s*(\d+)\s*\)/)
  const x = coordsMatch ? parseFiniteNumber(coordsMatch[1]) : null
  const y = coordsMatch ? parseFiniteNumber(coordsMatch[2]) : null
  const continentMatch = rawText.match(/\bK(\d{1,2})\b/i)
  const k = continentMatch
    ? parseFiniteNumber(continentMatch[1])
    : calcContinentFromCoords(x, y)
  const name = rawText
    .replace(/\s*\(\s*\d+\s*\|\s*\d+\s*\)\s*(?:K\d{1,2})?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  const hasCoords = x != null && y != null
  const hasK = k != null
  const label = name
    ? hasCoords
      ? hasK
        ? `${name} (${x}|${y}) K${k}`
        : `${name} (${x}|${y})`
      : name
    : (rawText || '')
  return {
    name: name || null,
    x: hasCoords ? x : null,
    y: hasCoords ? y : null,
    k: hasK ? k : null,
    label: String(label || '').trim() || null
  }
}

function getSenderVillageByIdMap() {
  if (senderVillageByIdCache instanceof Map) return senderVillageByIdCache
  try {
    senderVillageByIdCache = getPlannerProductionVillageByIdMap()
  } catch (error) {
    senderVillageByIdCache = new Map()
  }
  return senderVillageByIdCache
}

function enrichSenderVillageInfo(villageId, parsedInfo) {
  const fallbackVillage = getSenderVillageByIdMap().get(Number(villageId))
  const parsedFromFallbackName = parseSenderVillageInfoText(String(fallbackVillage?.name || '').trim())
  const name = String(
    parsedInfo?.name ||
    parsedFromFallbackName?.name ||
    fallbackVillage?.name ||
    ''
  ).trim() || null
  const x = parseFiniteNumber(parsedInfo?.x)
    ?? parseFiniteNumber(fallbackVillage?.x)
    ?? parseFiniteNumber(parsedFromFallbackName?.x)
    ?? null
  const y = parseFiniteNumber(parsedInfo?.y)
    ?? parseFiniteNumber(fallbackVillage?.y)
    ?? parseFiniteNumber(parsedFromFallbackName?.y)
    ?? null
  const k = parseFiniteNumber(parsedInfo?.k)
    ?? parseFiniteNumber(parsedFromFallbackName?.k)
    ?? calcContinentFromCoords(x, y)
    ?? null
  const hasCoords = x != null && y != null
  const hasK = k != null
  const label = name
    ? hasCoords
      ? hasK
        ? `${name} (${x}|${y}) K${k}`
        : `${name} (${x}|${y})`
      : name
    : String(parsedInfo?.label || '').trim() || null
  return { name, x, y, k, label }
}

async function searchSenders({ id, x, y }, groupId) {
  const html = await postSender({ id, x, y }, groupId)
  const groupElement = html.querySelector('#command_sender_group')
  sendersDataCurrent = html.querySelector('table.vis.alternating-rows') ? (
    Array.from(html.querySelectorAll("table.vis.alternating-rows tr")).reduce((senders, tr) => {
      const choose = tr.querySelector('a.command_sender_choose')
      if (choose) {
        const villageId = Number(choose.dataset.village)
        const tds = Array.from(tr.querySelectorAll('td'))
        const distance = Number(tds[1].innerText)
        const villageInfo = enrichSenderVillageInfo(villageId, parseSenderVillageInfo(tds[0]))
        const units = tds.reduce((units, td) => {
          if (td.className.includes('unit-item')) {
              const unit = Number(td.innerText)
              units.push(unit)
          }
          return units
        }, [])
        senders.push({
          villageId,
          distance,
          units,
          ...villageInfo
        })
      }
      return senders
    }, [])
  ) : ([])
  return {groupElement}
}

async function updateSendersPerSecond({ rerender } = {}) {
  const { updateSendersPerSecond: updateSendersTickInModule } = await loadPlannerSendersTickModule()
  return updateSendersTickInModule(
    { rerender },
    {
      cancelEvents,
      getActiveDispatchMode,
      getDateTimeValue: () => dateTimeValue
    }
  )
}

export async function plannerView(data) {
  loaderGame.insert();
  try {
    await plannerTargetsDraftCore.ready?.()
    sendConflictTroopsMode = loadSendConflictTroopsMode()
    sendConflictTroopsMode = 'redistribute'
    renderSendersTableCurrent = null
    currentTableDispatchMode = null
    lastTemplateStatsSeq = 0
    templateStatsCurrent = null
    templateStatsHintCurrent = null
    targetsNavigatorQtyByKey = new Map()
    targetsNavigatorMetaByKey = new Map()
    targetsNavigatorEnrichSeq = 0
    targetsNavigatorSignature = null
    targetsNavigatorCurrentTargets = []
    targetsNavigatorMapInfoRequestByKey = new Set()
    dispatchTargetScope = normalizeDispatchTargetScope(data?.dispatchTargetScope || data?.targetScope || 'current')
    dispatchTargetScopeHasExplicitInput = Boolean(
      String(data?.dispatchTargetScope || data?.targetScope || '').trim()
    )
    dispatchTargetScopeAutoDefaultApplied = false
    syncDispatchScopeUiCurrent = null
    syncTargetsNavigatorTogglePreviewUiCurrent = null
    rerenderTargetsNavigatorRowsCurrent = null
    syncPlannerLastReportIndicatorUiCurrent = null
    plannerDataCurrent = data && typeof data === 'object' ? data : null
    plannerSeedTargetCurrent = null
    targetsNavigatorActiveKeyCurrent = null
    targetsDraftPersistSignatureCurrent = null
    activeTargetsDraftIdCurrent = null
    senderVillageByIdCache = null
    syncPlannerTargetCardPreviewCurrent = null
    snobMaxDistance = null
    manyToManyWorldConfigCurrent = null
    nightBonusConfigWorld = null
    nightBonusConfigTarget = readNightBonusConfigFromSource(data)
    nightBonusConfig = null
    resetPlayerNightMoralState()
    nightBonusConfig = resolveEffectiveNightBonusConfig({
      worldConfig: nightBonusConfigWorld,
      targetConfig: nightBonusConfigTarget
    })
    if (templateStatsTimer) clearTimeout(templateStatsTimer)
    templateStatsTimer = null
    if (!data || typeof data !== 'object') throw new Error('Data is required')
    activeTargetsDraftIdCurrent = String(data?.targetsDraftId || data?.draftId || '').trim() || null
    initialDispatchMode = normalizeIncomingDispatchMode(data?.dispatchMode)
      || normalizeIncomingDispatchMode(data?.mode)
      || null
    if (initialDispatchMode === 'schedule' && !isPlannerScheduleEnabled()) {
      initialDispatchMode = 'send'
    }
    if (ProtectingBot['bot-protect-all-in-game'].active()) {
      throw ProtectingBot.error()
    }
    plannerTargetCurrent = {
      id: parseFiniteNumber(data?.id) ?? null,
      x: Number(data.x),
      y: Number(data.y),
      playerId: parseFiniteNumber(data?.playerId ?? data?.player_id) ?? null,
      name: String(data?.name || '').trim() || null,
      k: parseFiniteNumber(data?.k) ?? calcContinentFromCoords(data?.x, data?.y) ?? null
    }
    if (data?.dispatchStatus && typeof data.dispatchStatus === 'object') {
      setTargetDispatchStatus(plannerTargetCurrent, data.dispatchStatus)
    }
    plannerSeedTargetCurrent = plannerTargetCurrent ? { ...plannerTargetCurrent } : null
    calculateDistance = new Distance({ x: data.x, y: data.y })
    consoleDev(calculateDistance.get(), { label: '[TARGET]', color: '#eb2f35' })
    await Promise.all([
      loadPlannerTargetsMapInfoModule(),
      loadPlannerTargetsNavigatorModule()
    ])
    await showPopUpPlanner(data)
    await loadPlannerTableModule()
    {
      const targetContent = document.querySelector('#go-target-content')
      syncCurrentPlannerTargetDispatchStatusUi(targetContent, plannerTargetCurrent)
      syncPlannerTargetCardPreviewCurrent = ({ target, meta } = {}) => {
        ensureTargetsNavigatorPreviewMapInfo(target)
        const nextVillage = buildPlannerTargetCardVillageFromNavigatorPreview(target, meta)
        if (!nextVillage || !targetContent) return
        const nextPreviewKey = `${Number(nextVillage?.x)}|${Number(nextVillage?.y)}`
        const currentPreviewKey = String(targetContent?.getAttribute?.('data-go-target-preview-key') || '').trim()
        const hasVillageMeta = Boolean(meta?.village && typeof meta.village === 'object')
        const hasExtraMeta = (
          Number.isFinite(Number(meta?.morale))
          || Boolean(meta?.nightBonusLabel)
          || Boolean(meta?.reservation)
        )
        if (!hasVillageMeta && !hasExtraMeta && currentPreviewKey === nextPreviewKey) return
        const nextAlly = (meta?.ally && typeof meta.ally === 'object') ? meta.ally : null
        targetContent.setAttribute('data-go-target-preview-key', nextPreviewKey)
        plannerTargetApi?.updatePlannerTargetCard?.(targetContent, nextVillage, nextAlly)
        syncCurrentPlannerTargetDispatchStatusUi(targetContent, target || plannerTargetCurrent || nextVillage)
        updateTargetReservationLock(targetContent, nextVillage?.reservation || null)
        syncPlannerActiveTargetFromPreview({
          village: nextVillage,
          target,
          source: 'targets-navigator:preview'
        })
        targetContent.dispatchEvent(new CustomEvent('go:planner:target:preview-change', {
          detail: {
            village: nextVillage,
            ally: nextAlly,
            target,
            meta
          }
        }))
      }
      insertTargetsAccordion(targetContent, data)
      void filterIncomingTargetsToExistingVillages(data)
        .then((result) => {
          if (!result?.changed) return
          const nextData = result?.data || data
          if (!targetContent?.isConnected) return
          data = nextData
          plannerDataCurrent = nextData && typeof nextData === 'object' ? nextData : plannerDataCurrent
          insertTargetsAccordion(targetContent, nextData)
        })
        .catch((error) => {
          console.error('[planner][targets][filter-existing:async]', error)
        })
    }
    let renderSendersTable = null
    const onTemplateStats = (event) => {
      const payload = event?.detail || null
      const seq = Number(payload?.meta?.seq || 0)
      if (seq && seq <= lastTemplateStatsSeq) return
      if (seq) lastTemplateStatsSeq = seq
      templateStatsHintCurrent = payload
      if (!payload?.validation?.isValid) {
        consoleDev.debug({
          event: 'go:template:stats:stable',
          action: 'ignored_invalid',
          meta: payload?.meta || null,
          validation: payload?.validation || null
        }, {
          label: '[planner:table:consumer]',
          color: '#d97706'
        })
        return
      }
      consoleDev.debug({
        event: 'go:template:stats:stable',
        action: 'applied',
        meta: payload?.meta || null
      }, {
        label: '[planner:table:consumer]',
        color: '#16a34a'
      })
      templateStatsCurrent = payload
      if (templateStatsTimer) clearTimeout(templateStatsTimer)
      templateStatsTimer = setTimeout(() => {
        if (!document.querySelector('#go-planner-senders')) return
        if (typeof renderSendersTable !== 'function') return
        renderSendersTable()
      }, 60)
    }
    cancelEvents.cancelTemplateStats = () => {
      if (templateStatsTimer) clearTimeout(templateStatsTimer)
      document.removeEventListener('go:template:stats:stable', onTemplateStats, true)
    }
    document.addEventListener('go:template:stats:stable', onTemplateStats, true)
    await insertPlannerTemplatesView()
    await insertPlannerModeView()
    const inputDateTimeContent = insertInputDateTimeContent()
    const incomingDraftScheduleDateTime = String(
      plannerDataCurrent?.scheduleDateTime
      || plannerDataCurrent?.dateTimeValue
      || plannerDataCurrent?.dateTime
      || ''
    ).trim()
    const inputDateTimeResponse = await inputDateTimeView(inputDateTimeContent, undefined, {
      initialValue: incomingDraftScheduleDateTime || undefined
    })
    inputDateTimeController = inputDateTimeResponse || null
    dateTimeValue = inputDateTimeResponse?.dateTimeValue
    setDispatchDateTimeMode(getActiveDispatchMode())
    cancelEvents.cancelInputDateTime = () => {
      inputDateTimeResponse?.inputDateTimeClose?.()
      inputDateTimeController = null
    }
    const { groupElement } = await searchSenders(data, defaultGroupId)
    insertGroups(data, groupElement)
    await insertDinpatchContent()
    await insertExecutionFeedOverlay()
    insertSendersContent()
    const popUpBoxContent = document.querySelector('.popup_box_content')
    const plannerSenders = document.querySelector('#go-planner-senders')
    const onSelectionChange = () => {
      updateDispatchButtonsState()
      syncTargetsNavigatorTogglePreviewUiCurrent?.()
    }
    const onTableRenderEnd = () => {
      if (!isModeSwitchRenderPending) return
      isModeSwitchRenderPending = false
      syncTargetsNavigatorTogglePreviewUiCurrent?.()
    }
    if (plannerSenders) {
      plannerSenders.addEventListener('go:planner:selection', onSelectionChange)
      plannerSenders.addEventListener('go:planner:table:render:end', onTableRenderEnd)
      cancelEvents.cancelSelectionChange = () => {
        plannerSenders.removeEventListener('go:planner:selection', onSelectionChange)
        plannerSenders.removeEventListener('go:planner:table:render:end', onTableRenderEnd)
      }
    }
    renderSendersTable = (options = {}) => renderPlannerSendersTable(options)
    renderSendersTableCurrent = renderSendersTable
    cancelEvents.cancelRenderSendersTableRef = () => {
      renderSendersTableCurrent = null
    }
    templateStatsCurrent = cancelEvents.plannerTemplatesView?.getTemplateStats?.() || templateStatsCurrent
    templateStatsHintCurrent = cancelEvents.plannerTemplatesView?.getTemplateStatsAny?.() || templateStatsHintCurrent
    renderPlannerSendersTable({ preserveSelection: false })
    await updateSendersPerSecond({ rerender: () => renderSendersTable?.() })
    const goDateTimeChange = (e) => {
      // se quiser bloquear que suba pro document:
      e.stopPropagation();
      // e.target é o elemento que deu dispatch (a .go-dtbox)
      const dtbox = e.target;
      const { value } = e.detail;
      dateTimeValue = value
      persistPlannerTargetsDraftFromNavigatorState()
      renderSendersTable()
    };
    cancelEvents.cancelGoDateTimeChange = () => inputDateTimeContent.removeEventListener("go:datetime:change", goDateTimeChange)
    inputDateTimeContent.addEventListener("go:datetime:change", goDateTimeChange)
    setPlannerPopupLoading(false)
  } catch (e) {
    console.error(e)
    setPlannerPopupLoading(false)
  } finally {
    loaderGame.remove();
  }
}
