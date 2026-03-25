const { merge } = require('webpack-merge')
const commonConfig = require('./webpack.common.js')
const WebpackObfuscator = require('webpack-obfuscator')
const { getObfuscatorOptions } = require('@toolkit-tw-bot/webpack')

function getConfigObfuscatorOptions(configName) {
  const perConfig = {
    WEB: { level: 'high', overrides: [] },
    WORKERS: { level: 'high', overrides: [] },
  }

  const config = perConfig[String(configName).toUpperCase()] || {
    level: 'default',
    overrides: [],
  }

  return getObfuscatorOptions(config.level, config.overrides)
}

module.exports = (envVars = {}) => {
  const { env = 'dev' } = envVars
  const envConfig = require(`./webpack.${env}.js`)

  return commonConfig.map((config) => {
    const merged = merge(config, envConfig)

    if (env === 'prod') {
      merged.plugins = merged.plugins || []
      merged.plugins.push(
        new WebpackObfuscator(getConfigObfuscatorOptions(merged.name)),
      )
    }

    return merged
  })
}
