import { assetBasePath } from '@toolkit-tw-bot/release'
import {
  PREPARED_CONNECT_SERVER_ERROR_ATTRIBUTE,
  PREPARED_READY_ATTRIBUTE,
  STARTER_PREPARED_ERROR,
  STARTER_PREPARED_READY,
} from '../../../../shared/preparedBootstrap'
// import insertJQueryScript from './insertJQueryScript'
import insertTagScript from './insertTagScript'

const getPreparedScriptUrl = () => {
  const assetOrigin = process.env.EXTENSION_ASSET_ORIGIN

  if (!assetOrigin) {
    throw new Error('Missing EXTENSION_ASSET_ORIGIN')
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
    await insertTagScript(preparedScriptUrl)
    console.log('[Starter] prepared injected via tag')

    notifyPreparedReady()
  } catch (error) {
    notifyPreparedError(error)
    throw error
  }
}
