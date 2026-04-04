__webpack_nonce__ = 'c29tZSBjb29sIHN0cmluZyB3aWxsIHBvcCB1cCAxMjM='

import { getParamsUrl } from '@toolkit-tw-bot/core'
import { getGameData } from '@toolkit-tw-bot/document'
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'

const CONNECT = 'CONNECT'
const CTX = 'CTX'
const START = 'BOT_RUNNER_START'
const STOP = 'BOT_RUNNER_STOP'
const RUNNER_BOT_PROTECT = 'BOT_RUNNER_BOT_PROTECT'
const RUNNER_BOT_PROTECT_EVENT = 'toolkit:runner-bot-protect'
const PREPARED_ENTRY_PATTERN = /\/game\.prepared\.js(?:[?#].*)?$/

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
  preparedBaseUrl: resolvePreparedBaseUrl(),
}

function resolvePreparedBaseUrl() {
  const currentScript = document.currentScript

  if (currentScript instanceof HTMLScriptElement && currentScript.src) {
    return new URL('./', currentScript.src).toString()
  }

  const preparedScript = Array.from(document.scripts)
    .reverse()
    .find((script) => typeof script.src === 'string' && PREPARED_ENTRY_PATTERN.test(script.src))

  if (!preparedScript?.src) {
    return null
  }

  return new URL('./', preparedScript.src).toString()
}

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

  return data?.type === START || data?.type === STOP || data?.type === RUNNER_BOT_PROTECT
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
      url.searchParams.set('screen', 'overview')
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

async function injectStageScript(filename) {
  const scriptUrl = getStageScriptUrl(filename)

  if (
    runnerState.stagedScriptUrl === scriptUrl
    && runnerState.stagedScriptEl?.isConnected
  ) {
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

  console.log('[PREPARED] sending CTX', getPreparedContext())

  await chrome.runtime.sendMessage(runnerState.extensionId, {
    extensionId: runnerState.extensionId,
    type: CTX,
    data: getPreparedContext(),
  })
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

    const stageEntry = getStageEntry()

    if (stageEntry?.filename) {
      await injectStageScript(stageEntry.filename)
    }

    runnerState.running = true
  })()
    .catch((error) => {
      removeStageScript()
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

  removeStageScript()
  runnerState.running = false
  // desativa CS listen
  document.querySelector("html")?.setAttribute('data-activetab', 'false')
}

async function onConnectMessage(data) {
  ensureExpectedExtensionId(data)
  setConnectionState(data)
  console.log('[PREPARED] CONNECT received', data)
  void postCtxToExtension()
}

async function onStartMessage(data) {
  setConnectionState(data)
  console.log('[PREPARED] START received', data)
  await startRunner()
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

async function onRunnerBotProtectMessage(data) {
  console.warn('[PREPARED] BOT_PROTECT received', data)

  window.dispatchEvent(new CustomEvent(RUNNER_BOT_PROTECT_EVENT, {
    detail: data,
  }))
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
      case RUNNER_BOT_PROTECT:
        await onRunnerBotProtectMessage(data)
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
