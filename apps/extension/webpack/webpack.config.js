const { merge } = require('webpack-merge')
const commonConfig = require('./webpack.common.js')
const WebpackObfuscator = require('webpack-obfuscator')
const { getObfuscatorOptions } = require('@toolkit-tw-bot/webpack')

function getConfigObfuscatorOptions(configName) {
  const perConfig = {
    SW: { level: 'medium', overrides: ['extension'] },
    CS_VANILLA: { level: 'high', overrides: ['extension'] },
    CS_SHADOWDOM: { level: 'medium', overrides: ['extension'] },
    PG: { level: 'low', overrides: ['extension'] },
  }

  const config = perConfig[String(configName).toUpperCase()] || {
    level: 'default',
    overrides: ['extension'],
  }

  const level = process.env.OBFUSCATE_LEVEL || config.level

  return getObfuscatorOptions(level, config.overrides)
}

module.exports = (envVars = {}) => {
  const { env = 'dev' } = envVars
  const envConfig = require(`./webpack.${env}.js`)

  return commonConfig.map((config) => {
    const merged = merge(config, envConfig)

    if (env === 'prod' && process.env.OBFUSCATE !== 'false') {
      merged.plugins = merged.plugins || []
      merged.plugins.push(
        new WebpackObfuscator(getConfigObfuscatorOptions(merged.name)),
      )
    }

    return merged
  })
}
