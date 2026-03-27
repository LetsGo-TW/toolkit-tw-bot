import { assetBasePath } from '@toolkit-tw-bot/release'
import insertScript from './insertTagScript'

const getPreparedScriptUrl = () => {
  const assetOrigin = process.env.EXTENSION_ASSET_ORIGIN

  if (!assetOrigin) {
    throw new Error('Missing EXTENSION_ASSET_ORIGIN')
  }

  return new URL(`${assetBasePath}/web/game.prepared.js`, assetOrigin).toString()
}

export async function starter() {
  await insertScript(getPreparedScriptUrl())
}
