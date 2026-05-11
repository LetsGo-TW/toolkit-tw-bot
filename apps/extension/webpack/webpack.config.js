const { merge } = require('webpack-merge')
const WebpackObfuscator = require('webpack-obfuscator')
const { getObfuscatorOptions } = require('@toolkit-tw-bot/webpack')

function getConfigObfuscatorOptions(config = {}) {
  const configName = config.name
  const perConfig = {
    SW: { enabled: false, level: 'low', overrides: ['worker'], excludes: [] },
    CS_VANILLA: { level: 'high', overrides: ['extension'], excludes: [] },
    CS_SHADOWDOM: { level: 'medium', overrides: ['extension'], excludes: [] },
    PG: { level: 'low', overrides: ['extension'], excludes: [] },
  }

  const defaultConfig = perConfig[String(configName).toUpperCase()] || {
    enabled: true,
    level: 'default',
    overrides: ['extension'],
    excludes: [],
  }

  if (defaultConfig.enabled === false) {
    return {
      enabled: false,
      excludes: [],
      options: null,
    }
  }

  const configTokens = String(configName).split('__')

  if (configTokens.includes('NOOBF')) {
    return {
      enabled: false,
      excludes: [],
      options: null,
    }
  }

  if (configTokens[0] === 'CS_VANILLA' && configTokens.length >= 3) {
    const csVanillaConfig = perConfig.CS_VANILLA
    const levelToken = String(
      configTokens[2] || 'inherit',
    ).toLowerCase()
    const shouldObfuscateAsyncChunks = String(configTokens[4] || 'CHUNKOBF').toUpperCase() !== 'NOCHUNKOBF'
    const level = process.env.OBFUSCATE_LEVEL
      || (levelToken === 'inherit' ? csVanillaConfig.level : levelToken)

    return {
      enabled: true,
      excludes: shouldObfuscateAsyncChunks
        ? csVanillaConfig.excludes
        : [...csVanillaConfig.excludes, 'chunks/*.js'],
      options: getObfuscatorOptions(level, csVanillaConfig.overrides),
    }
  }

  const level = process.env.OBFUSCATE_LEVEL || defaultConfig.level

  return {
    enabled: true,
    excludes: defaultConfig.excludes,
    options: getObfuscatorOptions(level, defaultConfig.overrides),
  }
}

module.exports = (envVars = {}) => {
  const { env = 'dev' } = envVars
  const isProductionLikeBuild = env === 'prod' || env === 'prod-local'
  process.env.WEBPACK_BUILD_ENV = env

  const makeCommonConfigs = require('./webpack.common.js')
  const commonConfigs = makeCommonConfigs()
  const envConfig = require(`./webpack.${env}.js`)

  return commonConfigs.map((config) => {
    const merged = merge(config, envConfig)

    if (isProductionLikeBuild && process.env.OBFUSCATE !== 'false') {
      const { enabled, options, excludes } = getConfigObfuscatorOptions(merged)

      if (enabled !== false) {
        merged.plugins = merged.plugins || []
        merged.plugins.push(
          new WebpackObfuscator(options, excludes),
        )
      }
    }

    return merged
  })
}
