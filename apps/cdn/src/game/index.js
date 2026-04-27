import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document"
import { getParamsUrl } from "@toolkit-tw-bot/core"
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { DynamicModules } from "../dynamic-modules"
import { DynamicRuntime } from "../dynamic-runtime"
import ConfigSolver from "../hCaptcha/config"
import { useGoTiming } from "../hooks/useGoTiming"

const CDN = 'GAME.STAGE'
const RUNNER_BOT_PROTECT = 'BOT_RUNNER_BOT_PROTECT'
const RUNNER_CONTROLLER = 'BOT_RUNNER_CONTROLLER'
const RUNNER_EXECUTION_REPORT = 'BOT_RUNNER_EXECUTION_REPORT'
const GAME_RUNTIME_KEY = '__toolkitTwBotGameRuntime__'
const GAME_START_EVENT = 'toolkit:game:start'
const GAME_STOP_EVENT = 'toolkit:game:stop'
const GAME_CONTROLLER_BOT_PROTECT_EVENT = 'toolkit:game:controller:bot-protect'
const GAME_CONTROLLER_RUN_EVENT = 'toolkit:game:controller:run'
const GAME_CONTROLLER_PAUSE_EVENT = 'toolkit:game:controller:pause'
const GAME_CONTROLLER_STOP_EVENT = 'toolkit:game:controller:stop'
const GAME_START_HANDLER_KEY = '__toolkitTwBotGameStageStartHandlerInstalled__'
const GAME_STOP_HANDLER_KEY = '__toolkitTwBotGameStageStopHandlerInstalled__'
const BOT_VIEW_ROOT_ID = 'go-extension-bot-view'
const BOT_VIEW_SLOT_PRIMARY_ID = 'go-extension-bot-view-slot-primary'
const BOT_VIEW_SLOT_SECONDARY_ID = 'go-extension-bot-view-slot-secondary'
const BOT_VIEW_STATUS_SCRIPT_ID = 'go-extension-bot-view-status-script'
const BOT_VIEW_STATUS_EXECUTION_ID = 'go-extension-bot-view-status-execution'
const BOT_VIEW_STATUS_NEXT_ID = 'go-extension-bot-view-status-next'
const GET_BOT_VIEW_STATUS = 'GET_BOT_VIEW_STATUS'
const RUNNER_HANDLE_STOP_KEYS = ['stop', 'stopExecution', 'destroy', 'dispose', 'cleanup', 'unbind', 'teardown']
const RUNNER_HANDLE_DESTROY_KEYS = ['destroy', 'dispose', 'cleanup', 'unbind', 'teardown', 'stop', 'stopExecution']
const RUNNER_HANDLE_PAUSE_KEYS = ['pause', 'pauseExecution']
const RUNNER_REPORT_STATUSES = ['running', 'paused', 'stopped', 'completed', 'failed']

function createNoopRunnerMethod() {
  return async () => {}
}

function wrapRunnerMethod(method, fallback = null) {
  if (typeof method === 'function') {
    return async(detail = {}) => await method(detail)
  }

  if (typeof fallback === 'function') {
    return async(detail = {}) => await fallback(detail)
  }

  return createNoopRunnerMethod()
}

function pickRunnerMethod(candidate, keys = []) {
  for (const key of keys) {
    if (typeof candidate?.[key] === 'function') {
      return candidate[key]
    }
  }

  return null
}

function hasOwn(value, key) {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key)
}

function normalizeNonEmptyString(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null
}

function normalizeRunnerHandle(
  value,
  {
    kind = 'runtime',
    name = null,
  } = {},
) {
  if (typeof value === 'function') {
    const destroy = wrapRunnerMethod(value)

    return {
      kind,
      name,
      pause: createNoopRunnerMethod(),
      stop: destroy,
      destroy,
      raw: value,
    }
  }

  if (value && typeof value === 'object') {
    const candidate = value
    const pauseMethod = pickRunnerMethod(candidate, RUNNER_HANDLE_PAUSE_KEYS)
    const stopMethod = pickRunnerMethod(candidate, RUNNER_HANDLE_STOP_KEYS)
    const destroyMethod = pickRunnerMethod(candidate, RUNNER_HANDLE_DESTROY_KEYS)
    const destroy = wrapRunnerMethod(destroyMethod, stopMethod)
    const stop = wrapRunnerMethod(stopMethod, destroyMethod)

    return {
      kind,
      name,
      pause: wrapRunnerMethod(pauseMethod),
      stop,
      destroy,
      raw: value,
    }
  }

  return {
    kind,
    name,
    pause: createNoopRunnerMethod(),
    stop: createNoopRunnerMethod(),
    destroy: createNoopRunnerMethod(),
    raw: value ?? null,
  }
}

const gameState = {
  active: false,
  currentData: null,
  currentControllerAction: null,
  currentControllerPayload: null,
  currentPageHandle: null,
  currentPageName: null,
  currentRunId: null,
  currentRuntimeHandle: null,
  currentRuntimeName: null,
  currentStageResponse: null,
  lastError: null,
  runnerControllerCleanup: null,
  runnerControllerReady: false,
  startPromise: null,
  status: 'idle',
  transitionChain: Promise.resolve(),
  transitionLabel: null,
  updatedAt: null,
}

const botViewStatusSyncState = {
  currentTitle: null,
  executionText: null,
  listenersInstalled: false,
  nextAt: null,
  nextTitle: null,
  refreshPromise: null,
  unsubscribeTiming: null,
}


function touchGameState() {
  gameState.updatedAt = Date.now()
  renderBotViewCurrentStatus()
}

function setGameStatus(status) {
  gameState.status = status
  touchGameState()
}

function setControllerState(action = null, payload = null) {
  gameState.currentControllerAction = action
  gameState.currentControllerPayload = payload
  touchGameState()
}

function clearGameError() {
  gameState.lastError = null
  touchGameState()
}

function setGameError(error) {
  gameState.lastError = error instanceof Error
    ? {
      message: error.message,
      name: error.name,
    }
    : {
      message: String(error),
      name: 'Error',
    }

  touchGameState()
}

function clearCurrentExecutionState({
  preservePage = false,
} = {}) {
  gameState.currentData = null
  gameState.currentRunId = null
  gameState.currentRuntimeHandle = null
  gameState.currentRuntimeName = null
  gameState.currentStageResponse = null
  botViewStatusSyncState.executionText = null

  if (!preservePage) {
    gameState.currentPageHandle = null
    gameState.currentPageName = null
  }

  touchGameState()
}

function setCurrentRunnerHandle(kind, handle) {
  if (kind === 'page') {
    gameState.currentPageHandle = handle
  } else {
    gameState.currentRuntimeHandle = handle
  }

  touchGameState()

  return handle
}

function getGameStateSnapshot() {
  return {
    active: gameState.active,
    currentControllerAction: gameState.currentControllerAction,
    currentPageName: gameState.currentPageName,
    currentRuntimeName: gameState.currentRuntimeName,
    currentRunId: gameState.currentRunId,
    hasPageHandle: Boolean(gameState.currentPageHandle),
    hasRuntimeHandle: Boolean(gameState.currentRuntimeHandle),
    hasPendingTransition: gameState.transitionLabel !== null,
    lastError: gameState.lastError,
    runnerControllerReady: gameState.runnerControllerReady,
    status: gameState.status,
    transitionLabel: gameState.transitionLabel,
    updatedAt: gameState.updatedAt,
  }
}

function setTransitionLabel(label = null) {
  gameState.transitionLabel = label
  touchGameState()
}

async function runGameTransition(label, task) {
  const previous = gameState.transitionChain

  const current = previous
    .catch(() => {})
    .then(async () => {
      setTransitionLabel(label)
      try {
        return await task()
      } finally {
        if (gameState.transitionChain === current) {
          setTransitionLabel(null)
        }
      }
    })

  gameState.transitionChain = current

  return await current
}

function normalizeExecutionReportError(error) {
  if (!error) {
    return null
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    }
  }

  return {
    message: String(error),
    name: 'Error',
  }
}

function getInjectedBotViewElements() {
  const root = document.getElementById(BOT_VIEW_ROOT_ID)
  const primarySlot = document.getElementById(BOT_VIEW_SLOT_PRIMARY_ID)
  const secondarySlot = document.getElementById(BOT_VIEW_SLOT_SECONDARY_ID)
  const statusScript = document.getElementById(BOT_VIEW_STATUS_SCRIPT_ID)
  const statusExecution = document.getElementById(BOT_VIEW_STATUS_EXECUTION_ID)
  const statusNext = document.getElementById(BOT_VIEW_STATUS_NEXT_ID)

  if (
    !(root instanceof HTMLElement)
    || !(primarySlot instanceof HTMLElement)
    || !(secondarySlot instanceof HTMLElement)
  ) {
    return null
  }

  return {
    primarySlot,
    root,
    secondarySlot,
    statusExecution: statusExecution instanceof HTMLElement ? statusExecution : null,
    statusNext: statusNext instanceof HTMLElement ? statusNext : null,
    statusScript: statusScript instanceof HTMLElement ? statusScript : null,
  }
}

function formatBotViewCurrentScriptLabel(snapshot = getGameStateSnapshot()) {
  if (botViewStatusSyncState.currentTitle) {
    return botViewStatusSyncState.currentTitle
  }

  return ''
}

function formatBotViewNextScriptLabel() {
  return botViewStatusSyncState.nextTitle || '--'
}

function formatBotViewExecutionStatusLabel() {
  return botViewStatusSyncState.executionText || 'Aguardando'
}

function setBotViewExecutionStatusText(value = null) {
  botViewStatusSyncState.executionText = normalizeNonEmptyString(value)
  renderBotViewCurrentStatus()
}

function clearBotViewExecutionStatusText() {
  botViewStatusSyncState.executionText = null
  renderBotViewCurrentStatus()
}

function formatBotViewCountdownText(diffMs) {
  const totalSeconds = Math.max(0, Math.ceil(Number(diffMs || 0) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return [
      String(hours).padStart(2, '0'),
      String(minutes).padStart(2, '0'),
      String(seconds).padStart(2, '0'),
    ].join(':')
  }

  return [
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ].join(':')
}

function getBotViewEffectiveNowMs() {
  try {
    const effectiveNowMs = Number(useGoTiming?.getEffectiveServerNowMs?.())

    if (Number.isFinite(effectiveNowMs) && effectiveNowMs > 0) {
      return effectiveNowMs
    }
  } catch {}

  return Date.now()
}

function renderBotViewCurrentStatus() {
  const botView = getInjectedBotViewElements()

  if (!botView) {
    return
  }

  if (botView.statusScript) {
    botView.statusScript.textContent = formatBotViewCurrentScriptLabel()
  }

  if (botView.statusExecution) {
    botView.statusExecution.textContent = formatBotViewExecutionStatusLabel()
  }
}

function renderBotViewNextStatus() {
  const botView = getInjectedBotViewElements()

  if (!botView?.statusNext) {
    return
  }

  if (botViewStatusSyncState.nextTitle) {
    botView.statusNext.setAttribute('data-title', botViewStatusSyncState.nextTitle)
  } else {
    botView.statusNext.removeAttribute('data-title')
  }

  const nextAt = Number(botViewStatusSyncState.nextAt)

  if (!Number.isFinite(nextAt) || nextAt <= 0) {
    botView.statusNext.textContent = '--:--'
    return
  }

  const diffMs = Math.max(0, nextAt - getBotViewEffectiveNowMs())
  botView.statusNext.textContent = formatBotViewCountdownText(diffMs)
}

async function refreshBotViewNextStatus() {
  if (botViewStatusSyncState.refreshPromise) {
    return await botViewStatusSyncState.refreshPromise
  }

  botViewStatusSyncState.refreshPromise = (async() => {
    try {
      const response = await sendMessageToExtension({
        type: GET_BOT_VIEW_STATUS,
      })

      botViewStatusSyncState.currentTitle = normalizeNonEmptyString(response?.currentTitle)
      botViewStatusSyncState.nextAt = Number.isFinite(Number(response?.nextAt))
        ? Number(response.nextAt)
        : null
      botViewStatusSyncState.nextTitle = normalizeNonEmptyString(response?.nextTitle)
    } catch {
      botViewStatusSyncState.currentTitle = null
      botViewStatusSyncState.nextAt = null
      botViewStatusSyncState.nextTitle = null
    } finally {
      renderBotViewCurrentStatus()
      renderBotViewNextStatus()
      botViewStatusSyncState.refreshPromise = null
    }
  })()

  return await botViewStatusSyncState.refreshPromise
}

function ensureBotViewStatusSync() {
  renderBotViewCurrentStatus()
  renderBotViewNextStatus()

  if (!botViewStatusSyncState.listenersInstalled) {
    botViewStatusSyncState.listenersInstalled = true

    botViewStatusSyncState.unsubscribeTiming = useGoTiming.subscribe(() => {
      renderBotViewNextStatus()
    }, { immediate: true })

    const refresh = () => {
      renderBotViewCurrentStatus()
      void refreshBotViewNextStatus()
    }

    window.addEventListener(GAME_START_EVENT, refresh)
    window.addEventListener(GAME_STOP_EVENT, refresh)
    window.addEventListener(GAME_CONTROLLER_RUN_EVENT, refresh)
    window.addEventListener(GAME_CONTROLLER_PAUSE_EVENT, refresh)
    window.addEventListener(GAME_CONTROLLER_STOP_EVENT, refresh)
    window.addEventListener(GAME_CONTROLLER_BOT_PROTECT_EVENT, refresh)
  }

  void refreshBotViewNextStatus()
}

async function sendMessageToExtension(payload = {}) {
  return await chrome.runtime.sendMessage(RELEASE_EXTENSION_ID, {
    extensionId: RELEASE_EXTENSION_ID,
    ...payload,
  })
}

async function reportExecutionState({
  status,
  action = null,
  detail = null,
  error = null,
  source = 'game',
} = {}) {
  const normalizedStatus = normalizeNonEmptyString(status)?.toLowerCase()

  if (!RUNNER_REPORT_STATUSES.includes(normalizedStatus)) {
    return null
  }

  try {
    return await sendMessageToExtension({
      type: RUNNER_EXECUTION_REPORT,
      action: normalizeNonEmptyString(action) ?? gameState.currentControllerAction,
      status: normalizedStatus,
      source,
      detail,
      error: normalizeExecutionReportError(error),
      execution: {
        active: gameState.active,
        currentPageName: gameState.currentPageName,
        currentRuntimeName: gameState.currentRuntimeName,
        currentRunId: gameState.currentRunId,
      },
      snapshot: getGameStateSnapshot(),
    })
  } catch (reportError) {
    console.error(`[${RUNNER_EXECUTION_REPORT}]`, reportError)
    return null
  }
}

const getCurrentGameData = () => {
  if (typeof window !== "undefined" && typeof window.game_data !== "undefined") {
    return window.game_data
  }

  return getGameData()
}

function normalizeExecutionInstruction(value, {
  fallbackSource = 'controller',
} = {}) {
  const root = value && typeof value === 'object'
    ? value
    : {}
  const nested = root.data && typeof root.data === 'object'
    && (hasOwn(root.data, 'machine') || hasOwn(root.data, 'module') || hasOwn(root.data, 'data'))
    ? root.data
    : null
  const candidate = nested ?? root
  const moduleProvided = hasOwn(candidate, 'module')
  const machineProvided = hasOwn(candidate, 'machine')
  const runtimeData = candidate.data && typeof candidate.data === 'object'
    ? candidate.data
    : null

  return {
    data: runtimeData,
    machine: machineProvided ? normalizeNonEmptyString(candidate.machine) : undefined,
    machineProvided,
    module: moduleProvided ? normalizeNonEmptyString(candidate.module) : undefined,
    moduleProvided,
    reason: normalizeNonEmptyString(candidate.reason) ?? null,
    source: normalizeNonEmptyString(candidate.source) ?? fallbackSource,
  }
}

const isValidPageMessage = ({ data, origin, source }) => {
  if (source !== window) {
    return false
  }

  if (origin !== window.location.origin) {
    return false
  }

  return Boolean(data && typeof data === 'object')
}

const isValidRunnerControllerMessage = (event) => {
  if (!isValidPageMessage(event)) {
    return false
  }

  if (
    event.data?.extensionId !== RELEASE_EXTENSION_ID
    || event.data?.type !== RUNNER_CONTROLLER
  ) {
    return false
  }

  const action = typeof event.data?.action === 'string'
    ? event.data.action.trim().toLowerCase()
    : ''

  return action === 'run' || action === 'pause' || action === 'stop'
}

const dispatchControllerLifecycleEvent = (type, detail) => {
  window.dispatchEvent(new CustomEvent(type, {
    detail,
  }))
}

const installRunnerControllerListener = () => {
  if (typeof gameState.runnerControllerCleanup === 'function') {
    return gameState.runnerControllerCleanup
  }

  const onRunnerControllerMessage = (event) => {
    if (!isValidPageMessage(event)) {
      return
    }

    if (event.data?.extensionId !== RELEASE_EXTENSION_ID) {
      return
    }

    if (event.data?.type === RUNNER_BOT_PROTECT) {
      setControllerState('bot-protect', event.data)
      dispatchControllerLifecycleEvent(GAME_CONTROLLER_BOT_PROTECT_EVENT, event.data)

      if (typeof window.toolkitTwBotOnRunnerBotProtect === 'function') {
        void window.toolkitTwBotOnRunnerBotProtect(event.data)
        return
      }

      if (!ProtectingBot["bot-protect-all-in-game"].active()) {
        ProtectingBot.redirect()
      }

      console.warn(`[${RUNNER_BOT_PROTECT}]`, event.data)
      return
    }

    if (!isValidRunnerControllerMessage(event)) {
      return
    }

    const action = String(event.data?.action || '').trim().toLowerCase()
    setControllerState(action, event.data)

    switch (action) {
      case 'run':
        dispatchControllerLifecycleEvent(GAME_CONTROLLER_RUN_EVENT, event.data)
        void requestControllerRun(event.data)
        if (typeof window.toolkitTwBotOnControllerRun === 'function') {
          void window.toolkitTwBotOnControllerRun(event.data)
        }
        return
      case 'pause':
        dispatchControllerLifecycleEvent(GAME_CONTROLLER_PAUSE_EVENT, event.data)
        void requestControllerPause(event.data)
        if (typeof window.toolkitTwBotOnControllerPause === 'function') {
          void window.toolkitTwBotOnControllerPause(event.data)
        }
        return
      case 'stop':
        dispatchControllerLifecycleEvent(GAME_CONTROLLER_STOP_EVENT, event.data)
        void requestControllerStop(event.data)
        if (typeof window.toolkitTwBotOnControllerStop === 'function') {
          void window.toolkitTwBotOnControllerStop(event.data)
        }
        return
      default:
        return
    }
  }

  window.addEventListener('message', onRunnerControllerMessage)
  gameState.runnerControllerReady = true
  touchGameState()

  const cleanup = () => {
    window.removeEventListener('message', onRunnerControllerMessage)
    gameState.runnerControllerReady = false

    if (gameState.runnerControllerCleanup === cleanup) {
      gameState.runnerControllerCleanup = null
    }

    touchGameState()
  }

  gameState.runnerControllerCleanup = cleanup

  return cleanup
}

const getDynamicModule = async (moduleName) => {
  if (typeof moduleName !== 'string' || !moduleName.trim()) {
    return null
  }

  const loader = DynamicModules[moduleName]

  if (typeof loader !== 'function') {
    return null
  }

  return await loader()
}

const getDynamicRuntime = async (runtimeName) => {
  if (typeof runtimeName !== 'string' || !runtimeName.trim()) {
    return null
  }

  const loader = DynamicRuntime[runtimeName]

  if (typeof loader !== 'function') {
    return null
  }

  return await loader()
}

function createRunnerContext({
  kind,
  name,
  runId,
}) {
  const controllerState = {
    handle: null,
  }

  const registerNormalizedHandle = (handle) => {
    const normalized = normalizeRunnerHandle(handle, { kind, name })
    controllerState.handle = normalized
    return setCurrentRunnerHandle(kind, normalized)
  }

  return {
    game: {
      getState: getGameStateSnapshot,
      isActive: () => gameState.active,
      runId,
    },
    extension: {
      sendMessage: sendMessageToExtension,
    },
    reportState(input = {}) {
      if (typeof input === 'string') {
        return reportExecutionState({
          status: input,
          source: 'runner',
        })
      }

      return reportExecutionState({
        action: input.action ?? null,
        detail: input.detail ?? null,
        error: input.error ?? null,
        source: 'runner',
        status: input.status ?? null,
      })
    },
    registerHandle(handle) {
      return registerNormalizedHandle(handle)
    },
    registerCleanup(method) {
      return registerNormalizedHandle(method)
    },
    registerDestroy(method) {
      return registerNormalizedHandle({
        destroy: method,
      })
    },
    requestServer(payload = {}) {
      return sendMessageToExtension(payload)
    },
    getRegisteredHandle() {
      return controllerState.handle
    },
  }
}

async function executeRunner({
  data,
  kind,
  name,
  runner,
  runId,
}) {
  if (typeof runner !== 'function') {
    return null
  }

  const context = createRunnerContext({
    kind,
    name,
    runId,
  })
  const result = await runner(data, context)
  const normalized = context.getRegisteredHandle()
    ?? normalizeRunnerHandle(result, { kind, name })

  return setCurrentRunnerHandle(kind, normalized)
}

async function callRunnerHandle(handle, method, detail = {}) {
  if (!handle || typeof handle[method] !== 'function') {
    return
  }

  try {
    await handle[method](detail)
  } catch (error) {
    console.error(`[GAME][${handle.kind}:${handle.name || 'unknown'}][${method}]`, error)
  }
}

async function pauseCurrentExecution(detail = {}, { skipReport = false } = {}) {
  setGameStatus('pausing')
  await callRunnerHandle(gameState.currentRuntimeHandle, 'pause', detail)
  setGameStatus('paused')

  if (!skipReport) {
    await reportExecutionState({
      action: normalizeNonEmptyString(detail?.action) ?? 'pause',
      detail,
      source: 'game',
      status: 'paused',
    })
  }
}

async function stopCurrentExecution(detail = {}, { skipReport = false } = {}) {
  setGameStatus('stopping')
  await callRunnerHandle(gameState.currentRuntimeHandle, 'stop', detail)
  await callRunnerHandle(gameState.currentRuntimeHandle, 'destroy', detail)
  gameState.currentRuntimeHandle = null
  gameState.currentRuntimeName = null
  gameState.currentData = null
  setGameStatus('stopped')

  if (!skipReport) {
    await reportExecutionState({
      action: normalizeNonEmptyString(detail?.action) ?? 'stop',
      detail,
      source: 'game',
      status: 'stopped',
    })
  }
}

async function destroyCurrentPage(detail = {}) {
  await callRunnerHandle(gameState.currentPageHandle, 'destroy', detail)
  gameState.currentPageHandle = null
  gameState.currentPageName = null
  touchGameState()
}

async function destroyGameExecution(detail = {}, { skipReport = false } = {}) {
  await stopCurrentExecution(detail, { skipReport })
  await destroyCurrentPage(detail)
  clearCurrentExecutionState()
}

async function requestStageInstruction(detail = {}) {
  const runId = `game:${Date.now()}:${Math.random().toString(16).slice(2)}`
  const gameData = getCurrentGameData()
  const runtimeParams = getParamsUrl(
    window.location.href,
    window.location.origin,
  )
  const isBotProtected = ProtectingBot['bot-protect-all-in-game'].active()
  const response = await sendMessageToExtension({
    type: CDN,
    world: gameData?.world,
    t: runtimeParams.t ?? null,
    playerId: gameData?.player?.id,
    playerName: gameData?.player?.name,
    isBotProtected,
    detail,
  })

  console.log(`[${CDN}]: `, response)

  if (!response || response.ok !== true) {
    setGameStatus('idle')
    return null
  }

  const botView = getInjectedBotViewElements()

  if (!botView) {
    throw new Error('Injected bot view is unavailable for GAME.STAGE')
  }

  ensureBotViewStatusSync()

  document.querySelector("html")?.setAttribute('data-activetab', 'true')

  gameState.currentData = response.data ?? null
  gameState.currentRunId = runId
  gameState.currentStageResponse = response
  clearGameError()
  setGameStatus('running')

  return {
    instruction: normalizeExecutionInstruction(response, {
      fallbackSource: 'stage',
    }),
    raw: response,
    runId,
  }
}

async function ensurePageRunner({
  data,
  moduleName,
  moduleProvided,
  runId,
}) {
  if (!moduleProvided) {
    return gameState.currentPageHandle
  }

  if (!moduleName) {
    await destroyCurrentPage({
      action: 'page-destroy',
      reason: 'module-cleared',
    })
    return null
  }

  if (gameState.currentPageHandle && gameState.currentPageName === moduleName) {
    return gameState.currentPageHandle
  }

  await destroyCurrentPage({
    action: 'page-destroy',
    nextModule: moduleName,
    reason: 'module-replaced',
  })

  const pageRunner = await getDynamicModule(moduleName)

  if (!pageRunner) {
    gameState.currentPageName = moduleName
    touchGameState()
    return null
  }

  gameState.currentPageName = moduleName
  touchGameState()

  return await executeRunner({
    data,
    kind: 'page',
    name: moduleName,
    runner: pageRunner,
    runId,
  })
}

async function runInstruction(
  instruction,
  {
    raw = null,
    runId = `game:${Date.now()}:${Math.random().toString(16).slice(2)}`,
  } = {},
) {
  if (!instruction) {
    return
  }

  clearBotViewExecutionStatusText()

  const data = instruction.data ?? gameState.currentData ?? null
  const machineName = instruction.machineProvided
    ? instruction.machine
    : gameState.currentRuntimeName
  const moduleName = instruction.moduleProvided
    ? instruction.module
    : gameState.currentPageName

  gameState.currentData = data
  gameState.currentRunId = runId
  gameState.currentStageResponse = raw
  clearGameError()
  setGameStatus('running')

  await ConfigSolver.init()

  await ensurePageRunner({
    data,
    moduleName,
    moduleProvided: instruction.moduleProvided,
    runId,
  })

  console.log({
    page: moduleName || null,
    machine: machineName || null,
    hasPageRunner: Boolean(gameState.currentPageHandle),
  })

  if (gameState.currentRuntimeHandle) {
    await stopCurrentExecution({
      action: 'stop',
      reason: 'runtime-replaced',
    }, { skipReport: true })
  }

  gameState.currentRuntimeName = machineName || null
  touchGameState()

  if (!machineName) {
    setGameStatus('idle')
    return
  }

  const executionRunner = await getDynamicRuntime(machineName)

  if (!executionRunner) {
    setGameStatus('idle')
    return
  }

  await executeRunner({
    data,
    kind: 'runtime',
    name: machineName,
    runner: executionRunner,
    runId,
  })
}

async function executeControllerRun(detail = {}) {
  const instruction = normalizeExecutionInstruction(detail, {
    fallbackSource: 'controller',
  })

  if (!instruction.machineProvided && !instruction.moduleProvided) {
    return
  }

  try {
    await runInstruction(instruction, {
      raw: detail,
    })
  } catch (error) {
    setGameError(error)
    setGameStatus('error')
    await reportExecutionState({
      action: 'run',
      detail,
      error,
      source: 'game',
      status: 'failed',
    })
  }
}

async function executeControllerPause(detail = {}) {
  await pauseCurrentExecution(detail)
}

async function executeControllerStop(detail = {}) {
  await stopCurrentExecution(detail)
}

async function requestControllerRun(detail = {}) {
  return await runGameTransition('controller:run', async () => {
    await executeControllerRun(detail)
  })
}

async function requestControllerPause(detail = {}) {
  return await runGameTransition('controller:pause', async () => {
    await executeControllerPause(detail)
  })
}

async function requestControllerStop(detail = {}) {
  return await runGameTransition('controller:stop', async () => {
    await executeControllerStop(detail)
  })
}

async function run(detail = {}) {
  const staged = await requestStageInstruction(detail)

  if (!staged?.instruction) {
    return
  }

  await runInstruction(staged.instruction, {
    raw: staged.raw,
    runId: staged.runId,
  })
}

async function startGame(detail = {}) {
  if (gameState.active) {
    return
  }

  if (gameState.startPromise) {
    return gameState.startPromise
  }

  gameState.startPromise = Promise.resolve()
    .then(async () => {
      installRunnerControllerListener()
      gameState.active = true
      clearGameError()
      setGameStatus('starting')
      await run(detail)
    })
    .catch(async(error) => {
      gameState.runnerControllerCleanup?.()
      gameState.active = false
      setGameError(error)
      setGameStatus('error')
      throw error
    })
    .finally(() => {
      gameState.startPromise = null
    })

  return gameState.startPromise
}

async function stopGame(detail = {}) {
  if (gameState.startPromise) {
    try {
      await gameState.startPromise
    } catch {
      // ignore boot errors while stopping
    }
  }

  if (!gameState.active) {
    gameState.runnerControllerCleanup?.()
    return
  }

  gameState.active = false
  setControllerState('deactivate', detail)

  if (typeof window.toolkitTwBotOnRunnerStop === 'function') {
    await window.toolkitTwBotOnRunnerStop(detail)
  }

  await destroyGameExecution(detail, { skipReport: true })
  gameState.runnerControllerCleanup?.()
  setGameStatus('inactive')
  await reportExecutionState({
    action: 'deactivate',
    detail,
    source: 'game',
    status: 'stopped',
  })

  console.log(`[${GAME_STOP_EVENT}]: `, detail)
}

function installLifecycleListeners() {
  if (!window[GAME_START_HANDLER_KEY]) {
    window[GAME_START_HANDLER_KEY] = true

    window.addEventListener(GAME_START_EVENT, (event) => {
      void startGame(event.detail)
    })
  }

  if (!window[GAME_STOP_HANDLER_KEY]) {
    window[GAME_STOP_HANDLER_KEY] = true

    window.addEventListener(GAME_STOP_EVENT, (event) => {
      void stopGame(event.detail)
    })
  }
}

function installRuntime() {
  window[GAME_RUNTIME_KEY] = {
    clearBotViewExecutionStatusText,
    executeControllerPause,
    executeControllerRun,
    getBotView: getInjectedBotViewElements,
    executeControllerStop,
    getState: getGameStateSnapshot,
    isActive: () => gameState.active,
    normalizeRunnerHandle,
    requestControllerPause,
    requestControllerRun,
    requestControllerStop,
    refreshBotViewStatus: refreshBotViewNextStatus,
    sendMessageToExtension,
    setBotViewExecutionStatusText,
    pauseCurrentExecution,
    start: startGame,
    stopCurrentExecution,
    stop: stopGame,
  }
}

const game = () => null

installLifecycleListeners()
installRuntime()
void game()

export {}
