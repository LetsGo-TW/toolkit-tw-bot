const webpackServiceWorker = require('./webpack.service-worker')
const webpackContentScriptVanilla = require('./webpack.content-script-vanilla')
const webpackContentScriptShadowdom = require('./webpack.content-script-shadowdom')
const webpackPages = require('./webpack.pages')
const { hasEntryConfigs } = require('./webpack.get-entry-config')

const configs = [
  webpackServiceWorker(),
  webpackContentScriptVanilla(),
  webpackPages(),
]

if (hasEntryConfigs('csShadowDom')) {
  configs.push(webpackContentScriptShadowdom())
}

module.exports = configs
