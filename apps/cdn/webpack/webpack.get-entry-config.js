const entries = require('../entries/entries')

function getEntryConfigs(group) {
  return entries[group] || {}
}

function getEntryBuildConfig(config = {}) {
  const normalizedConfig = typeof config === 'string'
    ? { entry: config }
    : config
  const buildConfig = normalizedConfig.build || {}

  return {
    obfuscate: buildConfig.obfuscate !== false,
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

module.exports = {
  getEntryBuildConfig,
  getEntryConfigs,
  getGroupedEntryConfigs,
}
