const webpackServiceWorker = require('./webpack.service-worker')
const webpackContentScriptVanilla = require('./webpack.content-script-vanilla')
const webpackContentScriptShadowdom = require('./webpack.content-script-shadowdom')
const webpackPages = require('./webpack.pages')
const { hasEntryConfigs } = require('./webpack.get-entry-config')

function makeCommonConfigs() {
  const configs = [
    webpackServiceWorker(),
    webpackContentScriptVanilla(),
    webpackPages(),
  ]

  if (hasEntryConfigs('csShadowDom')) {
    configs.push(webpackContentScriptShadowdom())
  }

  return configs
}

module.exports = makeCommonConfigs
