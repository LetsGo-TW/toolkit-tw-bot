__webpack_nonce__ = 'c29tZSBjb29sIHN0cmluZyB3aWxsIHBvcCB1cCAxMjM='

import { getParamsUrl } from '@toolkit-tw-bot/core'
import { getGameData } from '@toolkit-tw-bot/browser'
import { DynamicImports } from './dynamic-import'

const CONNECT = 'CONNECT'
const PREPARED = 'PREPARED'
const START = 'BOT_RUNNER_START'
const STOP = 'BOT_RUNNER_STOP'

const runnerState = {
  extensionId: null,
  scopeKey: null,
  running: false,
  startPromise: null,
  stopHandlers: new Map(),
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

function setConnectionState(data) {
  if (data.extensionId) {
    runnerState.extensionId = data.extensionId
  }

  if (data.scopeKey) {
    runnerState.scopeKey = data.scopeKey
  }
}

function clearStopHandlers() {
  runnerState.stopHandlers.clear()
}

function registerStopHandler(key, result) {
  if (typeof result === 'function') {
    runnerState.stopHandlers.set(key, result)
    return
  }

  if (result && typeof result.stop === 'function') {
    runnerState.stopHandlers.set(key, () => result.stop())
  }
}

function getRuntimeModules() {
  const runtimeParams = getParamsUrl(
    window.location.href,
    window.location.origin,
  )
  const { isInGame, isInLogin, screen, isIntro } = runtimeParams

  if (!isInGame && !isInLogin) {
    throw new Error('Scripts only work in Tribal Wars.')
  }

  if (isIntro) {
    throw new Error('Scripts are not executed on the introductory page.')
  }

  return {
    ...runtimeParams,
    isInLogin,
    screen,
  }
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

async function postPreparedToExtension() {
  if (!runnerState.extensionId) {
    throw new Error('Extension Id is required.')
  }

  const response = await chrome.runtime.sendMessage(runnerState.extensionId, {
    extensionId: runnerState.extensionId,
    type: PREPARED,
    data: getPreparedContext(),
  })

  setConnectionState(response || {})
}

async function loadModule(key) {
  if (!DynamicImports[key]) {
    return null
  }

  return DynamicImports[key]()
}

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

    const { isInLogin, screen } = getRuntimeModules()

    clearStopHandlers()

    if (isInLogin) {
      const login = await loadModule('login')

      if (!login) {
        runnerState.running = true
        return
      }

      const result = await login(runnerState.extensionId)
      registerStopHandler('login', result)
      runnerState.running = true
      return
    }

    const game = await loadModule('game')
    const screenModule = screen ? await loadModule(screen) : null

    if (screenModule) {
      const result = await screenModule(runnerState.extensionId)
      registerStopHandler(screen, result)
    }

    if (game) {
      const result = await game(runnerState.extensionId)
      registerStopHandler('game', result)
    }

    runnerState.running = true
  })()
    .catch((error) => {
      clearStopHandlers()
      throw error
    })
    .finally(() => {
      runnerState.startPromise = null
    })

  return runnerState.startPromise
}

async function stopRunner() {
  if (runnerState.startPromise) {
    try {
      await runnerState.startPromise
    } catch {
      // ignore boot errors while stopping
    }
  }

  if (!runnerState.running && runnerState.stopHandlers.size === 0) {
    return
  }

  const stopEntries = Array.from(runnerState.stopHandlers.entries()).reverse()
  clearStopHandlers()

  for (const [key, stop] of stopEntries) {
    try {
      await stop()
    } catch (error) {
      console.warn(`[GAME.PREPARED][STOP:${key}]`, error)
    }
  }

  runnerState.running = false
}

async function onConnectMessage(data) {
  setConnectionState(data)
  await postPreparedToExtension()
}

async function onStartMessage(data) {
  setConnectionState(data)
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

  await stopRunner()
}

async function onPageMessage(event) {
  if (!isValidPageMessage(event)) {
    return
  }

  const { data, origin, source } = event

  console.log('GAME.PREPARED', { data, origin, source })

  try {
    switch (data.type) {
      case CONNECT:
        await onConnectMessage(data)
        return
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

export {}
