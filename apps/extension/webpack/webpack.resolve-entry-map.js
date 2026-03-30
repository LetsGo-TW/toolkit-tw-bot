// apps/extension/webpack/webpack.resolve-entry-map.js
const path = require('path')
const { getEntryBuildConfig, getEntryConfigs } = require('./webpack.get-entry-config')

const ASYNC_CHUNK_PUBLIC_PATH_RUNTIME = path.resolve(
  __dirname,
  '../src/content-scripts/vanilla/shared/runtime/setExtensionContentScriptPublicPath.js',
)

function makeEntryConfig(config) {
  const resolvedImport = path.resolve(__dirname, '../src', config.entry)
  const buildConfig = getEntryBuildConfig(config)
  const importPaths = buildConfig.asyncChunks
    ? [ASYNC_CHUNK_PUBLIC_PATH_RUNTIME, resolvedImport]
    : [resolvedImport]
  const entryConfig = { import: importPaths.length === 1 ? importPaths[0] : importPaths }

  if (config.dependOn) {
    entryConfig.dependOn = config.dependOn
  }

  if (config.filename) {
    entryConfig.filename = config.filename
  }

  const hasOnlyImport = Object.keys(entryConfig).length === 1
  const hasSingleImport = typeof entryConfig.import === 'string'

  if (hasOnlyImport && hasSingleImport) {
    return entryConfig.import
  }

  return entryConfig
}

function resolveEntries(group) {
  return resolveEntryConfigs(getEntryConfigs(group))
}

function resolveEntryConfigs(entryConfigs = {}) {
  return Object.fromEntries(
    Object.entries(entryConfigs).map(([name, config]) => [name, makeEntryConfig(config)]),
  )
}

module.exports = {
  resolveEntryConfigs,
  resolveEntries,
}
