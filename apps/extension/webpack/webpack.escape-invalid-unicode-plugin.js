function isUnicodeNonCharacter(codePoint) {
  if (codePoint >= 0xFDD0 && codePoint <= 0xFDEF) {
    return true
  }

  return (codePoint & 0xFFFE) === 0xFFFE && codePoint <= 0x10FFFF
}

function escapeCodePoint(codePoint) {
  if (codePoint <= 0xFFFF) {
    return `\\u${codePoint.toString(16).toUpperCase().padStart(4, '0')}`
  }

  const normalizedCodePoint = codePoint - 0x10000
  const highSurrogate = 0xD800 + (normalizedCodePoint >> 10)
  const lowSurrogate = 0xDC00 + (normalizedCodePoint & 0x3FF)

  return [
    `\\u${highSurrogate.toString(16).toUpperCase().padStart(4, '0')}`,
    `\\u${lowSurrogate.toString(16).toUpperCase().padStart(4, '0')}`,
  ].join('')
}

function escapeUnsafeUnicode(source) {
  let sanitized = ''
  let changed = false

  for (const symbol of source) {
    const codePoint = symbol.codePointAt(0)

    if (codePoint > 0x7F || isUnicodeNonCharacter(codePoint)) {
      sanitized += escapeCodePoint(codePoint)
      changed = true
      continue
    }

    sanitized += symbol
  }

  return changed ? sanitized : source
}

class EscapeInvalidUnicodeInJsAssetsPlugin {
  apply(compiler) {
    const { Compilation, sources } = compiler.webpack

    compiler.hooks.compilation.tap('EscapeInvalidUnicodeInJsAssetsPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'EscapeInvalidUnicodeInJsAssetsPlugin',
          stage: Compilation.PROCESS_ASSETS_STAGE_REPORT,
        },
        () => {
          for (const asset of compilation.getAssets()) {
            if (!asset.name.endsWith('.js')) {
              continue
            }

            const rawSource = asset.source.source()
            const source = Buffer.isBuffer(rawSource) ? rawSource.toString('utf8') : String(rawSource)
            const sanitized = escapeUnsafeUnicode(source)

            if (sanitized === source) {
              continue
            }

            compilation.updateAsset(asset.name, new sources.RawSource(sanitized))
          }
        },
      )
    })
  }
}

module.exports = {
  EscapeInvalidUnicodeInJsAssetsPlugin,
}
