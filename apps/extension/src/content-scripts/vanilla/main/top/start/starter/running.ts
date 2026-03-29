import { assetBasePath } from '@toolkit-tw-bot/release'
import insertJQueryScript from './insertJQueryScript'
import insertTagScript from './insertTagScript'

const getPreparedScriptUrl = () => {
  const assetOrigin = process.env.EXTENSION_ASSET_ORIGIN

  if (!assetOrigin) {
    throw new Error('Missing EXTENSION_ASSET_ORIGIN')
  }

  return new URL(`${assetBasePath}/web/game.prepared.js`, assetOrigin).toString()
}

export async function starter() {
  const preparedScriptUrl = getPreparedScriptUrl()

  try {
    await insertTagScript(preparedScriptUrl)
  } catch {
    await insertJQueryScript(preparedScriptUrl)
  }
}
