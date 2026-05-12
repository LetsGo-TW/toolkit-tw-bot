const { Compilation, sources } = require('webpack')
const JavaScriptObfuscator = require('javascript-obfuscator')
const multimatch = require('multimatch')
const transferSourceMap = require('multi-stage-sourcemap').transfer

const ALLOWED_EXTENSIONS = ['.js', '.mjs']
const IDENTIFIERS_PREFIX_BASE = 'a'

class ObfuscateAssetsPlugin {
  constructor(options = {}, {
    include = [],
    exclude = [],
  } = {}) {
    this.options = options
    this.include = Array.isArray(include) ? include : [include]
    this.exclude = Array.isArray(exclude) ? exclude : [exclude]
  }

  apply(compiler) {
    compiler.hooks.compilation.tap(this.constructor.name, (compilation) => {
      compilation.hooks.processAssets.tapPromise(
        {
          name: this.constructor.name,
          stage: Compilation.PROCESS_ASSETS_STAGE_DEV_TOOLING,
        },
        async(assets) => {
          let identifiersPrefixCounter = 0
          const sourcemapOutput = {}
          const filesToProcess = []

          compilation.chunks.forEach((chunk) => {
            chunk.files.forEach((fileName) => {
              const isSourceMap = Boolean(this.options.sourceMap) && fileName.toLowerCase().endsWith('.map')
              filesToProcess.push({ fileName, isSourceMap })
            })
          })

          const jsFiles = filesToProcess.filter((file) => !file.isSourceMap)
          const mapFiles = filesToProcess.filter((file) => file.isSourceMap)

          for (const { fileName } of jsFiles) {
            if (!this.shouldProcess(fileName)) {
              continue
            }

            const asset = compilation.assets[fileName]
            const { inputSource, inputSourceMap } = this.extractSourceAndSourceMap(asset)
            const { obfuscatedSource, obfuscationSourceMap } = await this.obfuscate(
              inputSource,
              fileName,
              identifiersPrefixCounter,
            )

            if (this.options.sourceMap && inputSourceMap) {
              sourcemapOutput[fileName] = obfuscationSourceMap
              const transferredSourceMap = transferSourceMap({
                fromSourceMap: obfuscationSourceMap,
                toSourceMap: inputSourceMap,
              })
              const finalSourcemap = JSON.parse(transferredSourceMap)
              assets[fileName] = new sources.SourceMapSource(
                obfuscatedSource,
                fileName,
                finalSourcemap,
              )
            } else {
              assets[fileName] = new sources.RawSource(obfuscatedSource, false)
            }

            identifiersPrefixCounter += 1
          }

          for (const { fileName } of mapFiles) {
            const srcName = fileName.toLowerCase().slice(0, -4)

            if (!this.shouldProcess(srcName) || !sourcemapOutput[srcName]) {
              continue
            }

            const transferredSourceMap = transferSourceMap({
              fromSourceMap: sourcemapOutput[srcName],
              toSourceMap: compilation.assets[fileName].source(),
            })
            const finalSourcemap = JSON.parse(transferredSourceMap)
            assets[fileName] = new sources.RawSource(JSON.stringify(finalSourcemap), false)
          }
        },
      )
    })
  }

  shouldProcess(filePath) {
    const hasAllowedExtension = ALLOWED_EXTENSIONS.some((extension) => (
      filePath.toLowerCase().endsWith(extension)
    ))

    if (!hasAllowedExtension) {
      return false
    }

    if (this.exclude.length > 0 && multimatch(filePath, this.exclude).length > 0) {
      return false
    }

    if (this.include.length === 0) {
      return true
    }

    return multimatch(filePath, this.include).length > 0
  }

  extractSourceAndSourceMap(asset) {
    if (asset.sourceAndMap) {
      const { source, map } = asset.sourceAndMap()
      return {
        inputSource: source,
        inputSourceMap: map,
      }
    }

    return {
      inputSource: asset.source(),
      inputSourceMap: asset.map(),
    }
  }

  async obfuscate(javascript, fileName, identifiersPrefixCounter) {
    const obfuscatorOptions = {
      identifiersPrefix: `${IDENTIFIERS_PREFIX_BASE}${identifiersPrefixCounter}`,
      inputFileName: fileName,
      sourceMapMode: 'separate',
      sourceMapFileName: `${fileName}.map`,
      ...this.options,
    }

    const obfuscationResult = JavaScriptObfuscator.obfuscate(javascript, obfuscatorOptions)

    return {
      obfuscatedSource: obfuscationResult.getObfuscatedCode(),
      obfuscationSourceMap: obfuscationResult.getSourceMap(),
    }
  }
}

module.exports = {
  ObfuscateAssetsPlugin,
}
