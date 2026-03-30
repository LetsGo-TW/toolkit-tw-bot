import { assetBasePath } from '@toolkit-tw-bot/release'
import {
  PREPARED_READY_ATTRIBUTE,
  STARTER_PREPARED_ERROR,
  STARTER_PREPARED_READY,
} from '../../../../shared/preparedBootstrap'
import insertJQueryScript from './insertJQueryScript'
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
  window.postMessage({ type: STARTER_PREPARED_READY }, window.location.origin)
}

function notifyPreparedError(error: unknown) {
  document.documentElement?.removeAttribute(PREPARED_READY_ATTRIBUTE)
  window.postMessage(
    {
      type: STARTER_PREPARED_ERROR,
      error: error instanceof Error ? error.message : String(error),
    },
    window.location.origin,
  )
}

export async function starter() {
  const preparedScriptUrl = getPreparedScriptUrl()

  try {
    try {
      await insertTagScript(preparedScriptUrl)
      console.log('[Starter] prepared injected via tag')
    } catch (error) {
      console.error(error)
      await insertJQueryScript(preparedScriptUrl)
      console.log('[Starter] prepared injected via jquery')
    }

    notifyPreparedReady()
  } catch (error) {
    notifyPreparedError(error)
    throw error
  }
}
