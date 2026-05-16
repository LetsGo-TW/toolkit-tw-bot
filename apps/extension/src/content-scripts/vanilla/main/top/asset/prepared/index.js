__webpack_nonce__ = 'c29tZSBjb29sIHN0cmluZyB3aWxsIHBvcCB1cCAxMjM='

import { getParamsUrl, resolvePreparedBaseUrl, syncPreparedBaseUrl } from '@toolkit-tw-bot/core'
import { getGameData } from '@toolkit-tw-bot/document'
import { assetBasePath, extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'

const CONNECT = 'CONNECT'
const CTX = 'CTX'
const START = 'BOT_RUNNER_START'
const STOP = 'BOT_RUNNER_STOP'
const GAME_RUNTIME_KEY = '__toolkitTwBotGameRuntime__'
const GAME_START_EVENT = 'toolkit:game:start'
const GAME_STOP_EVENT = 'toolkit:game:stop'
const PREPARED_ENTRY_PATTERN = /\/game\.prepared\.js(?:[?#].*)?$/
const PREPARED_BASE_URL_KEY = '__toolkitTwBotPreparedBaseUrl__'
const EXTENSION_ASSET_ORIGIN = `chrome-extension://${RELEASE_EXTENSION_ID}`

/**
 * @typedef {Object} RunnerState
 * @property {string | null} extensionId
 * @property {string | null} scopeKey
 * @property {boolean} running
 * @property {Promise<void> | null} startPromise
 * @property {string | null} stagedScriptUrl
 * @property {HTMLScriptElement | null} stagedScriptEl
 * @property {string | null} preparedBaseUrl
 */

/** @type {RunnerState} */
const runnerState = {
  extensionId: RELEASE_EXTENSION_ID,
  scopeKey: null,
  running: false,
  startPromise: null,
  stagedScriptUrl: null,
  stagedScriptEl: null,
  preparedBaseUrl: resolvePreparedBaseUrl({
    preparedEntryPattern: PREPARED_ENTRY_PATTERN,
    assetOrigin: process.env.EXTENSION_ASSET_ORIGIN,
    extensionAssetOrigin: EXTENSION_ASSET_ORIGIN,
    assetBasePath,
  }),
}

syncPreparedBaseUrl(runnerState.preparedBaseUrl, PREPARED_BASE_URL_KEY)

function isValidPageMessage({ data, origin, source }) {
  if (source !== window) {
    return false
  }

  if (origin !== window.location.origin) {
    return false
  }

  if (!data || typeof data !== 'object') {
    return false
  }

  return true
}

function isValidConnectMessage(event) {
  return isValidPageMessage(event) && event.data?.type === CONNECT
}

function isValidRunnerMessage(event) {
  if (!isValidPageMessage(event)) {
    return false
  }

  const { data } = event

  if (data?.extensionId !== runnerState.extensionId) {
    return false
  }

  return data?.type === START || data?.type === STOP
}

function setConnectionState(data) {
  if (data.scopeKey) {
    runnerState.scopeKey = data.scopeKey
  }
}

function ensureExpectedExtensionId(data) {
  if (data?.extensionId !== runnerState.extensionId) {
    throw new Error('Prepared handshake extensionId mismatch.')
  }
}

function getRuntimeModules() {
  const runtimeParams = getParamsUrl(
    window.location.href,
    window.location.origin,
  )
  const { isInGame, isInLogin, isIntro } = runtimeParams

  if (!isInGame && !isInLogin) {
    throw new Error('Scripts only work in Tribal Wars.')
  }

  if (isIntro) {
    document.title = '♻️ ' + document.title
    // printError('Wait starting...', 'green')
    setTimeout(() => {
      const gameData = window?.game_data || getGameData()
      const url = new URL(gameData?.link_base_pure, window?.location?.origin)
      url.searchParams.set('screen', 'buddies')
      url.searchParams.set('group', gameData?.groupId || 0)
      window.location.assign(url.toString())
    }, 5 * 1000);
    // setTimeout(() => window.location.assign(withGroupFix('/game.php?screen=overview')), 10 * 1000);
    throw new Error('Scripts are not executed on the introductory page.')
  }

  return {
    ...runtimeParams,
    isInLogin,
  }
}

function getStageEntry() {
  const runtimeParams = getRuntimeModules()

  if (runtimeParams.isInLogin) {
    return null
  }

  return {
    kind: 'game',
    filename: 'game.staged.js',
  }
}

function getStageScriptUrl(filename) {
  if (!runnerState.preparedBaseUrl) {
    throw new Error('Missing prepared base URL.')
  }

  return new URL(filename, runnerState.preparedBaseUrl).toString()
}

function removeStageScript() {
  runnerState.stagedScriptEl?.remove()
  runnerState.stagedScriptEl = null
  runnerState.stagedScriptUrl = null
}

function getGameRuntime() {
  return window[GAME_RUNTIME_KEY] || null
}

function hasGameRuntime() {
  const runtime = getGameRuntime()

  return Boolean(
    runtime
    && typeof runtime.start === 'function'
    && typeof runtime.stop === 'function'
  )
}

function dispatchGameLifecycleEvent(type, detail = {}) {
  window.dispatchEvent(new CustomEvent(type, {
    detail: {
      extensionId: runnerState.extensionId,
      scopeKey: runnerState.scopeKey,
      ...detail,
    },
  }))
}

async function injectStageScript(filename) {
  const scriptUrl = getStageScriptUrl(filename)

  if (hasGameRuntime()) {
    return
  }

  removeStageScript()

  const script = document.createElement('script')
  const target = document.head || document.documentElement

  if (!target) {
    throw new Error('Missing document root to inject staged script.')
  }

  script.src = scriptUrl
  script.async = false
  script.dataset.toolkitTwBotStaged = filename

  await new Promise((resolve, reject) => {
    script.addEventListener('load', () => {
      script.remove()

      if (runnerState.stagedScriptEl === script) {
        runnerState.stagedScriptEl = null
      }

      if (runnerState.stagedScriptUrl === scriptUrl) {
        runnerState.stagedScriptUrl = null
      }

      resolve()
    }, { once: true })
    script.addEventListener('error', () => {
      script.remove()

      if (runnerState.stagedScriptEl === script) {
        runnerState.stagedScriptEl = null
      }

      if (runnerState.stagedScriptUrl === scriptUrl) {
        runnerState.stagedScriptUrl = null
      }

      reject(new Error(`Failed to load staged script: ${scriptUrl}`))
    }, { once: true })

    target.appendChild(script)
  })

  runnerState.stagedScriptUrl = scriptUrl
  runnerState.stagedScriptEl = script
}

async function ensureGameRuntime() {
  if (hasGameRuntime()) {
    return getGameRuntime()
  }

  const stageEntry = getStageEntry()

  if (!stageEntry?.filename) {
    return null
  }

  await injectStageScript(stageEntry.filename)

  const runtime = getGameRuntime()

  if (!runtime) {
    throw new Error('GAME runtime was not installed.')
  }

  return runtime
}

function getPreparedContext() {
  const runtimeParams = getRuntimeModules()
  const gameData = getGameData(document) || {}
  const world = runtimeParams.hostname && !runtimeParams.hostname.startsWith('www.')
    ? runtimeParams.hostname.split('.')[0] || null
    : null
  const playerIdValue = Number(gameData?.player?.id)

  return {
    context: runtimeParams.isInLogin ? 'LOGIN' : 'GAME',
    world,
    t: runtimeParams.t ?? null,
    isTryConfirm: runtimeParams.isTryConfirm === true,
    playerId: Number.isFinite(playerIdValue) ? playerIdValue : null,
    playerName: gameData?.player?.name || null,
  }
}

async function postCtxToExtension() {
  if (!runnerState.extensionId) {
    throw new Error('Extension Id is required.')
  }

  const context = getPreparedContext()

  console.log('[PREPARED] sending CTX', context)

  const response = await chrome.runtime.sendMessage(runnerState.extensionId, {
    extensionId: runnerState.extensionId,
    type: CTX,
    data: context,
  })

  console.log('[PREPARED] CTX response', response)

  return response
}

/** @returns {Promise<void>} */
async function startRunner() {
  if (runnerState.running) {
    return
  }

  if (runnerState.startPromise) {
    return runnerState.startPromise
  }

  runnerState.startPromise = (async () => {
    if (!runnerState.extensionId) {
      throw new Error('Extension Id is required.')
    }

    const runtime = await ensureGameRuntime()
    runnerState.running = true
    document.querySelector("html")?.setAttribute('data-activetab', 'true')

    if (runtime) {
      dispatchGameLifecycleEvent(GAME_START_EVENT)

      if (typeof runtime.start === 'function') {
        await runtime.start()
      }
    }
  })()
    .catch((error) => {
      removeStageScript()
      runnerState.running = false
      throw error
    })
    .finally(() => {
      runnerState.startPromise = null
    })

  return runnerState.startPromise
}

/** @returns {Promise<void>} */
async function stopRunner() {
  if (runnerState.startPromise) {
    try {
      await runnerState.startPromise
    } catch {
      // ignore boot errors while stopping
    }
  }

  if (!runnerState.running) {
    return
  }

  runnerState.running = false
  document.querySelector("html")?.setAttribute('data-activetab', 'false')

  if (!hasGameRuntime()) {
    return
  }

  dispatchGameLifecycleEvent(GAME_STOP_EVENT)
}

async function onConnectMessage(data) {
  ensureExpectedExtensionId(data)
  setConnectionState(data)
  console.log('[PREPARED] CONNECT received', data)
  await postCtxToExtension()
}

async function onStartMessage(data) {
  setConnectionState(data)
  console.log('[PREPARED] START received', data)
  const wasRunning = runnerState.running
  await startRunner()

  if (!wasRunning) {
    try {
      await postCtxToExtension()
    } catch (error) {
      console.error('[PREPARED] CTX refresh after START failed', error)
    }
  }
}

async function onStopMessage(data) {
  if (
    runnerState.scopeKey
    && data.scopeKey
    && runnerState.scopeKey !== data.scopeKey
  ) {
    return
  }

  console.log('[PREPARED] STOP received', data)
  await stopRunner()
}

async function onPageMessage(event) {
  if (!isValidConnectMessage(event)) {
    return
  }

  const { data } = event

  window.removeEventListener('message', onPageMessage, true)
  window.addEventListener('message', onRunnerMessage, true)

  try {
    await onConnectMessage(data)
  } catch (error) {
    console.error(error)
  }
}

async function onRunnerMessage(event) {
  if (!isValidRunnerMessage(event)) {
    return
  }

  const { data } = event

  try {
    switch (data.type) {
      case START:
        await onStartMessage(data)
        return
      case STOP:
        await onStopMessage(data)
        return
      default:
        return
    }
  } catch (error) {
    console.error(error)
  }
}

window.addEventListener('message', onPageMessage, true)

console.log('[PREPARED] running')

export {}
