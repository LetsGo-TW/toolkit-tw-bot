import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document"
import { getParamsUrl } from "@toolkit-tw-bot/core"
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { DynamicModules } from "../dynamic-modules"
import { DynamicRuntime } from "../dynamic-runtime"
import ConfigSolver from "../hCaptcha/config"

const CDN = 'GAME.STAGE'
const RUNNER_BOT_PROTECT = 'BOT_RUNNER_BOT_PROTECT'
const RUNNER_CONTROLLER = 'BOT_RUNNER_CONTROLLER'
const GAME_RUNTIME_KEY = '__toolkitTwBotGameRuntime__'
const GAME_START_EVENT = 'toolkit:game:start'
const GAME_STOP_EVENT = 'toolkit:game:stop'
const GAME_CONTROLLER_BOT_PROTECT_EVENT = 'toolkit:game:controller:bot-protect'
const GAME_CONTROLLER_RUN_EVENT = 'toolkit:game:controller:run'
const GAME_CONTROLLER_PAUSE_EVENT = 'toolkit:game:controller:pause'
const GAME_CONTROLLER_STOP_EVENT = 'toolkit:game:controller:stop'
const GAME_START_HANDLER_KEY = '__toolkitTwBotGameStageStartHandlerInstalled__'
const GAME_STOP_HANDLER_KEY = '__toolkitTwBotGameStageStopHandlerInstalled__'
const RUNNER_HANDLE_STOP_KEYS = ['stop', 'stopExecution', 'destroy', 'dispose', 'cleanup', 'unbind', 'teardown']
const RUNNER_HANDLE_DESTROY_KEYS = ['destroy', 'dispose', 'cleanup', 'unbind', 'teardown', 'stop', 'stopExecution']
const RUNNER_HANDLE_PAUSE_KEYS = ['pause', 'pauseExecution']

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
  updatedAt: null,
}

function touchGameState() {
  gameState.updatedAt = Date.now()
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
    lastError: gameState.lastError,
    runnerControllerReady: gameState.runnerControllerReady,
    status: gameState.status,
    updatedAt: gameState.updatedAt,
  }
}

async function sendMessageToExtension(payload = {}) {
  return await chrome.runtime.sendMessage(RELEASE_EXTENSION_ID, {
    extensionId: RELEASE_EXTENSION_ID,
    ...payload,
  })
}

const getCurrentGameData = () => {
  if (typeof window !== "undefined" && typeof window.game_data !== "undefined") {
    return window.game_data
  }

  return getGameData()
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
        if (typeof window.toolkitTwBotOnControllerRun === 'function') {
          void window.toolkitTwBotOnControllerRun(event.data)
        }
        return
      case 'pause':
        dispatchControllerLifecycleEvent(GAME_CONTROLLER_PAUSE_EVENT, event.data)
        void pauseCurrentExecution(event.data)
        if (typeof window.toolkitTwBotOnControllerPause === 'function') {
          void window.toolkitTwBotOnControllerPause(event.data)
        }
        return
      case 'stop':
        dispatchControllerLifecycleEvent(GAME_CONTROLLER_STOP_EVENT, event.data)
        void stopCurrentExecution(event.data)
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

async function pauseCurrentExecution(detail = {}) {
  setGameStatus('pausing')
  await callRunnerHandle(gameState.currentRuntimeHandle, 'pause', detail)
  setGameStatus('paused')
}

async function stopCurrentExecution(detail = {}) {
  setGameStatus('stopping')
  await callRunnerHandle(gameState.currentRuntimeHandle, 'stop', detail)
  await callRunnerHandle(gameState.currentRuntimeHandle, 'destroy', detail)
  gameState.currentRuntimeHandle = null
  gameState.currentRuntimeName = null
  gameState.currentData = null
  setGameStatus('stopped')
}

async function destroyGameExecution(detail = {}) {
  await stopCurrentExecution(detail)
  await callRunnerHandle(gameState.currentPageHandle, 'destroy', detail)
  clearCurrentExecutionState()
}

async function run(detail = {}) {
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
    return
  }

  document.querySelector("html")?.setAttribute('data-activetab', 'true')

  const data = response.data ?? null
  const machineName = typeof response.machine === 'string'
    ? response.machine.trim()
    : ''
  const pageName = typeof response.module === 'string'
    ? response.module.trim()
    : ''

  gameState.currentData = data
  gameState.currentPageHandle = null
  gameState.currentPageName = pageName || null
  gameState.currentRunId = runId
  gameState.currentRuntimeHandle = null
  gameState.currentRuntimeName = machineName || null
  gameState.currentStageResponse = response
  clearGameError()
  setGameStatus('running')

  await ConfigSolver.init()

  if (machineName === 'solver') {
    const solver = await getDynamicRuntime(machineName)

    if (!solver) {
      setGameStatus('idle')
      return
    }

    await executeRunner({
      data,
      kind: 'runtime',
      name: machineName,
      runner: solver,
      runId,
    })
    return
  }

  const pageRunner = await getDynamicModule(pageName)
  const executionRunner = await getDynamicRuntime(machineName)

  console.log({
    page: pageName || null,
    machine: machineName || null,
    hasPageRunner: Boolean(pageRunner),
    hasExecutionRunner: Boolean(executionRunner),
  })

  if (pageRunner) {
    await executeRunner({
      data,
      kind: 'page',
      name: pageName,
      runner: pageRunner,
      runId,
    })
  }

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
    .catch((error) => {
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

  await destroyGameExecution(detail)
  gameState.runnerControllerCleanup?.()
  setGameStatus('inactive')

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
    getState: getGameStateSnapshot,
    isActive: () => gameState.active,
    normalizeRunnerHandle,
    sendMessageToExtension,
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
