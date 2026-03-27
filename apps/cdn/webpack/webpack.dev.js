// apps/cdn/webpack/webpack.dev.js
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
      const outputPath = compiler.options.output?.path

      if (!outputPath) {
        return
      }

      const outputDirName = path.basename(outputPath)
      const targetDir = path.resolve(
        __dirname,
        '../../api/src/public',
        assetBaseDir,
        outputDirName,
      )

      fs.mkdirSync(path.dirname(targetDir), { recursive: true })
      fs.rmSync(targetDir, { recursive: true, force: true })
      fs.cpSync(outputPath, targetDir, { recursive: true })

      console.log(`[cdn:dev] synced ${outputDirName} -> ${targetDir}`)
    })
  }
}

module.exports = {
  mode: 'development',
  devtool: 'inline-source-map',
  plugins: [new SyncApiPublicCdnPlugin()],
}
