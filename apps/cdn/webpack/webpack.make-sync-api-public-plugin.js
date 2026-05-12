const fs = require('fs')
const path = require('path')

function loadReleaseConfig() {
  try {
    return require('@toolkit-tw-bot/release')
  } catch {
    return require('../../../packages/release/src')
  }
}

const { assetBasePath } = loadReleaseConfig()
const assetBaseDir = assetBasePath.replace(/^\/+/, '')

class SyncApiPublicCdnPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap('SyncApiPublicCdnPlugin', () => {
      const sourceDir = path.resolve(__dirname, '../dist')
      const targetDir = path.resolve(
        __dirname,
        '../../api/src/public',
        assetBaseDir,
      )

      if (!fs.existsSync(sourceDir)) {
        return
      }

      fs.mkdirSync(path.dirname(targetDir), { recursive: true })
      fs.rmSync(targetDir, { recursive: true, force: true })
      fs.cpSync(sourceDir, targetDir, { recursive: true })

      console.log(`[cdn] synced dist -> ${targetDir}`)
    })
  }
}

module.exports = {
  SyncApiPublicCdnPlugin,
}
