// apps/extension/webpack/webpack.get-entry-config.js
const entries = require('../entries/entries')

function getEntryConfigs(group) {
  if (Array.isArray(group)) {
    return Object.assign({}, ...group.map((groupName) => entries[groupName] || {}))
  }

  return entries[group] || {}
}

function getEntryBuildConfig(config = {}) {
  const buildConfig = config.build || {}

  return {
    asyncChunks: Boolean(buildConfig.asyncChunks),
    obfuscate: buildConfig.obfuscate !== false,
    obfuscateAsyncChunks: buildConfig.obfuscateAsyncChunks !== false,
    profile: buildConfig.profile || 'default',
    obfuscationLevel: buildConfig.obfuscationLevel || null,
  }
}

function getGroupedEntryConfigs(group) {
  const grouped = new Map()

  for (const [entryName, entryConfig] of Object.entries(getEntryConfigs(group))) {
    const buildConfig = getEntryBuildConfig(entryConfig)
    const groupKey = JSON.stringify(buildConfig)

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        ...buildConfig,
        entries: {},
      })
    }

    grouped.get(groupKey).entries[entryName] = entryConfig
  }

  return Array.from(grouped.values())
}

function hasEntryConfigs(group) {
  return Object.keys(getEntryConfigs(group)).length > 0
}

module.exports = {
  getEntryBuildConfig,
  getEntryConfigs,
  getGroupedEntryConfigs,
  hasEntryConfigs,
}
