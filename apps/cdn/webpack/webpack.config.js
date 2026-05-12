const { merge } = require('webpack-merge')
const commonConfig = require('./webpack.common.js')
const { getObfuscatorOptions } = require('@toolkit-tw-bot/webpack')
const { ObfuscateAssetsPlugin } = require('./webpack.make-obfuscate-assets-plugin')
const { getEntryBuildConfig, getEntryConfigs, getGroupedEntryConfigs } = require('./webpack.get-entry-config')
const dynamicModules = require('../entries/dynamic-modules')
const dynamicRuntime = require('../entries/dynamic-runtime')
const dynamicBootstrap = require('../entries/dynamic-bootstrap')
const dynamicChunks = require('../entries/dynamic-chunks')

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

function normalizeAssetTargetBuildConfig(buildConfig = null) {
  const normalized = buildConfig && typeof buildConfig === 'object'
    ? buildConfig
    : {}

  return {
    obfuscate: normalized.obfuscate !== false,
    obfuscationLevel: normalized.obfuscationLevel || null,
  }
}

function makeWebEntryAssetTargets() {
  return getGroupedEntryConfigs('web')
    .flatMap(({ entries, ...groupedBuildConfig }) => (
      Object.keys(entries).map((entryName) => ({
        assetPatterns: [`${entryName}.js`],
        ...normalizeAssetTargetBuildConfig(groupedBuildConfig),
      }))
    ))
}

function makeWorkerAssetTargets() {
  return Object.entries(getEntryConfigs('workers')).map(([entryName, entryConfig]) => ({
    assetPatterns: [`${entryName}.js`],
    ...normalizeAssetTargetBuildConfig(getEntryBuildConfig(entryConfig)),
  }))
}

function makeDynamicChunkAssetTargets(registry) {
  return Object.values(registry || {}).map((entryConfig = {}) => ({
    assetPatterns: [`**/${String(entryConfig.chunkName || '').trim()}.js`],
    ...normalizeAssetTargetBuildConfig(entryConfig.build),
  }))
}

function makeNamedChunkAssetTargets() {
  return Object.entries(dynamicChunks || {}).map(([chunkName, config = {}]) => ({
    assetPatterns: [`**/${String(chunkName).trim()}.js`],
    ...normalizeAssetTargetBuildConfig(config.build),
  }))
}

function makeAssetTargetsForConfig(config) {
  if (getBaseConfigName(config.name) === 'WEB') {
    return [
      ...makeWebEntryAssetTargets(),
      ...makeDynamicChunkAssetTargets(dynamicModules),
      ...makeDynamicChunkAssetTargets(dynamicRuntime),
      ...makeDynamicChunkAssetTargets(dynamicBootstrap),
      ...makeNamedChunkAssetTargets(),
    ]
  }

  if (getBaseConfigName(config.name) === 'WORKERS') {
    return makeWorkerAssetTargets()
  }

  return []
}

function applyAssetObfuscators(config) {
  const assetTargets = makeAssetTargetsForConfig(config)

  for (const assetTarget of assetTargets) {
    if (!assetTarget.obfuscate) {
      continue
    }

    config.plugins.push(
      new ObfuscateAssetsPlugin(
        getConfigObfuscatorOptions(config.name, assetTarget.obfuscationLevel),
        {
          include: assetTarget.assetPatterns,
        },
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
      applyAssetObfuscators(merged)
    }

    return merged
  })
}
