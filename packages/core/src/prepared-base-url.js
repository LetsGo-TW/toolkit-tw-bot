const DEFAULT_PREPARED_ENTRY_PATTERN = /\/game\.prepared\.js(?:[?#].*)?$/

function shouldUseExtensionAssetOrigin(assetOrigin) {
  try {
    const url = new URL(assetOrigin)

    return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

function normalizePreparedScriptSource(script) {
  return typeof script?.src === 'string' && script.src
    ? script.src
    : null
}

function resolvePreparedBaseUrl({
  preparedEntryPattern = DEFAULT_PREPARED_ENTRY_PATTERN,
  assetOrigin = null,
  extensionAssetOrigin = null,
  assetBasePath = null,
  currentScript = typeof document !== 'undefined' ? document.currentScript : null,
  scripts = typeof document !== 'undefined' ? document.scripts : [],
} = {}) {
  if (assetOrigin && assetBasePath) {
    if (extensionAssetOrigin && shouldUseExtensionAssetOrigin(assetOrigin)) {
      return `${extensionAssetOrigin}${assetBasePath}/web/`
    }

    return new URL(`${assetBasePath}/web/`, assetOrigin).toString()
  }

  const currentScriptSrc = normalizePreparedScriptSource(currentScript)

  if (currentScriptSrc) {
    return new URL('./', currentScriptSrc).toString()
  }

  const preparedScript = Array.from(scripts || [])
    .reverse()
    .find((script) => {
      const scriptSrc = normalizePreparedScriptSource(script)
      return Boolean(scriptSrc) && preparedEntryPattern.test(scriptSrc)
    })

  const preparedScriptSrc = normalizePreparedScriptSource(preparedScript)

  if (!preparedScriptSrc) {
    return null
  }

  return new URL('./', preparedScriptSrc).toString()
}

function syncPreparedBaseUrl(preparedBaseUrl, key, scope = typeof window !== 'undefined' ? window : null) {
  if (!scope || typeof key !== 'string' || !key) {
    return
  }

  if (typeof preparedBaseUrl === 'string' && preparedBaseUrl.length > 0) {
    scope[key] = preparedBaseUrl
    return
  }

  delete scope[key]
}

module.exports = {
  DEFAULT_PREPARED_ENTRY_PATTERN,
  resolvePreparedBaseUrl,
  shouldUseExtensionAssetOrigin,
  syncPreparedBaseUrl,
}
