import { assetBasePath, extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import {
  PREPARED_CONNECT_SERVER_ERROR_ATTRIBUTE,
  PREPARED_READY_ATTRIBUTE,
  STARTER_PREPARED_ERROR,
  STARTER_PREPARED_READY,
} from '../../../../shared/preparedBootstrap'
// import insertJQueryScript from './insertJQueryScript'
import insertTagScript from './insertTagScript'

const CONNECT_SERVER_RETRY_BASE_DELAY_MS = 2_000
const CONNECT_SERVER_RETRY_MAX_DELAY_MS = 15_000
const EXTENSION_ASSET_ORIGIN = `chrome-extension://${RELEASE_EXTENSION_ID}`

function shouldUseExtensionAssetOrigin(assetOrigin: string) {
  try {
    const url = new URL(assetOrigin)

    return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

const getPreparedScriptUrl = () => {
  const assetOrigin = process.env.EXTENSION_ASSET_ORIGIN

  if (!assetOrigin) {
    throw new Error('Missing EXTENSION_ASSET_ORIGIN')
  }

  if (shouldUseExtensionAssetOrigin(assetOrigin)) {
    return `${EXTENSION_ASSET_ORIGIN}${assetBasePath}/web/game.prepared.js`
  }

  return new URL(`${assetBasePath}/web/game.prepared.js`, assetOrigin).toString()
}

function notifyPreparedReady() {
  document.documentElement?.setAttribute(PREPARED_READY_ATTRIBUTE, 'true')
  document.documentElement?.removeAttribute(PREPARED_CONNECT_SERVER_ERROR_ATTRIBUTE)
  window.postMessage({ type: STARTER_PREPARED_READY }, window.location.origin)
}

function isConnectServerError(error: unknown) {
  return (
    error instanceof Error
    && (
      error.name === 'ConnectServerError'
      || (error as Error & { isConnectServerError?: boolean }).isConnectServerError === true
    )
  )
}

function notifyPreparedError(error: unknown) {
  document.documentElement?.removeAttribute(PREPARED_READY_ATTRIBUTE)
  const isPreparedConnectServerError = isConnectServerError(error)

  if (isPreparedConnectServerError) {
    document.documentElement?.setAttribute(PREPARED_CONNECT_SERVER_ERROR_ATTRIBUTE, 'true')
  } else {
    document.documentElement?.removeAttribute(PREPARED_CONNECT_SERVER_ERROR_ATTRIBUTE)
  }

  window.postMessage(
    {
      type: STARTER_PREPARED_ERROR,
      error: error instanceof Error ? error.message : String(error),
      isConnectServerError: isPreparedConnectServerError,
    },
    window.location.origin,
  )
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs)
  })
}

function getConnectServerRetryDelayMs(attempt: number) {
  const exponentialDelayMs = CONNECT_SERVER_RETRY_BASE_DELAY_MS * (2 ** Math.max(0, attempt - 1))

  return Math.min(CONNECT_SERVER_RETRY_MAX_DELAY_MS, exponentialDelayMs)
}

async function insertPreparedScriptWithRetry(preparedScriptUrl: string) {
  let attempt = 0
  let notifiedConnectServerError = false

  while (true) {
    try {
      await insertTagScript(preparedScriptUrl)
      console.log('[Starter] prepared injected via tag', {
        attempt,
      })
      return
    } catch (error) {
      if (!isConnectServerError(error)) {
        throw error
      }

      attempt += 1

      if (!notifiedConnectServerError) {
        notifyPreparedError(error)
        notifiedConnectServerError = true
      }

      const retryDelayMs = getConnectServerRetryDelayMs(attempt)

      console.warn('[Starter] failed to load prepared script, retrying', {
        attempt,
        preparedScriptUrl,
        retryDelayMs,
        error,
      })

      await wait(retryDelayMs)
    }
  }
}

export async function starter() {
  const preparedScriptUrl = getPreparedScriptUrl()

  try {
    // try {
    //   await insertTagScript(preparedScriptUrl)
    //   console.log('[Starter] prepared injected via tag')
    // } catch (error) {
    //   console.error(error)
    //   await insertJQueryScript(preparedScriptUrl)
    //   console.log('[Starter] prepared injected via jquery')
    // }
    await insertPreparedScriptWithRetry(preparedScriptUrl)

    notifyPreparedReady()
  } catch (error) {
    notifyPreparedError(error)
    throw error
  }
}
