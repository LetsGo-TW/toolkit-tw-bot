// apps/extension/webpack/webpack.resolve-entry-map.js
const path = require('path')
const { getEntryConfigs } = require('./webpack.get-entry-config')

function makeEntryConfig(config) {
  const resolvedImport = path.resolve(__dirname, '../src', config.entry)
  const entryConfig = { import: resolvedImport }

  if (config.dependOn) {
    entryConfig.dependOn = config.dependOn
  }

  if (config.filename) {
    entryConfig.filename = config.filename
  }

  return Object.keys(entryConfig).length === 1 ? resolvedImport : entryConfig
}

function resolveEntries(group) {
  return Object.fromEntries(
    Object.entries(getEntryConfigs(group)).map(([name, config]) => [name, makeEntryConfig(config)]),
  )
}

module.exports = {
  resolveEntries,
}
