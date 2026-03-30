const { merge } = require('webpack-merge')
const commonConfig = require('./webpack.common.js')
const WebpackObfuscator = require('webpack-obfuscator')
const { getObfuscatorOptions } = require('@toolkit-tw-bot/webpack')
const { getGroupedEntryConfigs } = require('./webpack.get-entry-config')

function getBaseConfigName(configName) {
  return String(configName).split('__')[0].toUpperCase()
}

function getConfigObfuscatorOptions(configName, levelOverride = null) {
  const perConfig = {
    WEB: { level: 'high', overrides: [] },
    WORKERS: { level: 'low', overrides: ['worker'] },
  }

  const config = perConfig[getBaseConfigName(configName)] || {
    level: 'default',
    overrides: [],
  }

  return getObfuscatorOptions(
    process.env.OBFUSCATE_LEVEL || levelOverride || config.level,
    config.overrides,
  )
}

function makeEntryExcludePatterns(groupedEntryConfigs, targetEntryNames) {
  const keep = new Set(targetEntryNames.map((entryName) => `${entryName}.js`))

  return groupedEntryConfigs
    .flatMap(({ entries }) => Object.keys(entries))
    .map((entryName) => `${entryName}.js`)
    .filter((assetName) => !keep.has(assetName))
}

function applyWebEntryObfuscators(config) {
  const groupedEntryConfigs = getGroupedEntryConfigs('web')
  const hasGlobalObfuscationLevel = typeof process.env.OBFUSCATE_LEVEL === 'string'
    && process.env.OBFUSCATE_LEVEL.length > 0

  if (hasGlobalObfuscationLevel) {
    config.plugins.push(
      new WebpackObfuscator(
        getConfigObfuscatorOptions(config.name),
      ),
    )

    return
  }

  for (const groupedConfig of groupedEntryConfigs) {
    if (groupedConfig.obfuscate === false) {
      continue
    }

    const targetEntryNames = Object.keys(groupedConfig.entries)
    const excludes = makeEntryExcludePatterns(groupedEntryConfigs, targetEntryNames)

    config.plugins.push(
      new WebpackObfuscator(
        getConfigObfuscatorOptions(config.name, groupedConfig.obfuscationLevel),
        excludes,
      ),
    )
  }
}

module.exports = (envVars = {}) => {
  const { env = 'dev' } = envVars
  const isProductionLikeBuild = env === 'prod' || env === 'prod-local'
  const envConfig = require(`./webpack.${env}.js`)

  return commonConfig.map((config) => {
    const merged = merge(config, envConfig)

    if (isProductionLikeBuild && process.env.OBFUSCATE !== 'false') {
      merged.plugins = merged.plugins || []

      if (getBaseConfigName(merged.name) === 'WEB') {
        applyWebEntryObfuscators(merged)
      } else {
        merged.plugins.push(
          new WebpackObfuscator(getConfigObfuscatorOptions(merged.name)),
        )
      }
    }

    return merged
  })
}
