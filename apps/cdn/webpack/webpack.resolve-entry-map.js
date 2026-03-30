// apps/cdn/webpack/webpack.resolve-entry-map.js
const path = require('path')
const { getEntryConfigs } = require('./webpack.get-entry-config')

function getEntryPath(config) {
  return typeof config === 'string'
    ? config
    : config.entry
}

function resolveEntries(groupOrEntries) {
  const entryConfigs = typeof groupOrEntries === 'string'
    ? getEntryConfigs(groupOrEntries)
    : groupOrEntries

  return Object.fromEntries(
    Object.entries(entryConfigs).map(([name, config]) => [
      name,
      path.resolve(__dirname, '../src', getEntryPath(config)),
    ]),
  )
}

module.exports = {
  resolveEntries,
}
