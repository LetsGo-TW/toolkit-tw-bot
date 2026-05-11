const manifestTemplate = require('../manifest/version3.json')
const entries = require('../entries/entries')
const { getEntryBuildConfig } = require('./webpack.get-entry-config')

function loadReleaseConfig() {
  try {
    return require('@toolkit-tw-bot/release')
  } catch {
    return require('../../../packages/release/src')
  }
}

const { assetBasePath, extensionVersion } = loadReleaseConfig()
const BACKGROUND_DEFAULTS = {
  type: 'module',
}

function shouldExposeBundledCdnAssets() {
  const buildEnv = process.env.WEBPACK_BUILD_ENV || 'dev'

  return buildEnv === 'dev'
}

function cloneManifestTemplate() {
  return JSON.parse(JSON.stringify(manifestTemplate))
}

function getFirstEntry(group) {
  return Object.entries(entries[group] || {})[0] || null
}

function getPageHtmlFilename(pageName, pageConfig) {
  return pageConfig.htmlFilename || `${pageName}.html`
}

function getPopupPage() {
  return Object.entries(entries.pg || {}).find(([, config]) => config.type === 'popup') || null
}

function buildContentScriptEntry(entryName, entryConfig) {
  const contentScript = {
    matches: entryConfig.matches || [],
    js: [`./content-scripts/${entryName}.js`],
  }

  if (entryConfig.excludeMatches) {
    contentScript.exclude_matches = entryConfig.excludeMatches
  }

  if (entryConfig.runAt) {
    contentScript.run_at = entryConfig.runAt
  }

  if (entryConfig.world) {
    contentScript.world = entryConfig.world
  }

  if (entryConfig.allFrames !== undefined) {
    contentScript.all_frames = entryConfig.allFrames
  }

  if (entryConfig.matchAboutBlank !== undefined) {
    contentScript.match_about_blank = entryConfig.matchAboutBlank
  }

  if (entryConfig.includeGlobs) {
    contentScript.include_globs = entryConfig.includeGlobs
  }

  if (entryConfig.excludeGlobs) {
    contentScript.exclude_globs = entryConfig.excludeGlobs
  }

  if (entryConfig.css) {
    contentScript.css = entryConfig.css
  }

  return contentScript
}

function mergeContentScriptEntries(contentScripts) {
  const grouped = new Map()

  for (const contentScript of contentScripts) {
    const { js, ...signature } = contentScript
    const key = JSON.stringify(signature)

    if (!grouped.has(key)) {
      grouped.set(key, { ...signature, js: [] })
    }

    grouped.get(key).js.push(...js)
  }

  return Array.from(grouped.values())
}

function buildContentScripts(manifest) {
  const rawEntries = [...Object.entries(entries.csVanilla || {}), ...Object.entries(entries.csShadowDom || {})]

  return mergeContentScriptEntries(
    rawEntries.map(([entryName, entryConfig]) => (
      buildContentScriptEntry(entryName, entryConfig)
    )),
  )
}

function buildAsyncChunkWebAccessibleResources() {
  const rawEntries = [...Object.entries(entries.csVanilla || {}), ...Object.entries(entries.csShadowDom || {})]
  const asyncEntries = rawEntries.filter(([, entryConfig]) => getEntryBuildConfig(entryConfig).asyncChunks)

  if (asyncEntries.length === 0) {
    return []
  }

  const matches = Array.from(
    new Set(
      asyncEntries.flatMap(([, entryConfig]) => entryConfig.matches || []),
    ),
  )

  if (matches.length === 0) {
    return []
  }

  return [
    {
      resources: ['/content-scripts/chunks/*'],
      matches,
    },
  ]
}

function buildCdnWebAccessibleResources(manifest) {
  if (!shouldExposeBundledCdnAssets()) {
    return []
  }

  const matches = manifest.externally_connectable?.matches

  if (!Array.isArray(matches) || matches.length === 0) {
    return []
  }

  return [
    {
      resources: [
        `${assetBasePath}/web/*`,
        `${assetBasePath}/workers/*`,
      ],
      matches,
    },
  ]
}

function buildBackground(manifest) {
  const serviceWorkerEntry = getFirstEntry('sw')

  if (!serviceWorkerEntry) {
    return undefined
  }

  const [entryName] = serviceWorkerEntry

  return {
    ...BACKGROUND_DEFAULTS,
    ...(manifest.background || {}),
    service_worker: `./${entryName}.js`,
  }
}

function buildAction(manifest) {
  const popupPage = getPopupPage()

  if (!popupPage) {
    return manifest.action
  }

  const [pageName, pageConfig] = popupPage

  return {
    ...(manifest.action || {}),
    default_popup: getPageHtmlFilename(pageName, pageConfig),
  }
}

function buildExtensionManifest() {
  const manifest = cloneManifestTemplate()

  manifest.version = extensionVersion

  const background = buildBackground(manifest)
  if (background) {
    manifest.background = background
  } else {
    delete manifest.background
  }

  const contentScripts = buildContentScripts(manifest)
  if (contentScripts.length > 0) {
    manifest.content_scripts = contentScripts
  } else {
    delete manifest.content_scripts
  }

  const webAccessibleResources = [
    ...(manifest.web_accessible_resources || []),
    ...buildCdnWebAccessibleResources(manifest),
    ...buildAsyncChunkWebAccessibleResources(),
  ]

  if (webAccessibleResources.length > 0) {
    manifest.web_accessible_resources = webAccessibleResources
  } else {
    delete manifest.web_accessible_resources
  }

  manifest.action = buildAction(manifest)

  return manifest
}

class GenerateExtensionManifestPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('GenerateExtensionManifestPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'GenerateExtensionManifestPlugin',
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
        },
        () => {
          const source = `${JSON.stringify(buildExtensionManifest(), null, 2)}\n`
          compilation.emitAsset(
            'manifest.json',
            new compiler.webpack.sources.RawSource(source),
          )
        },
      )
    })
  }
}

module.exports = {
  buildExtensionManifest,
  GenerateExtensionManifestPlugin,
}
