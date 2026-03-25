// apps/cdn/webpack/webpack.make-dynamic-i18n-patterns.js
const path = require('path')
const dynamicModules = require('../entries/dynamic-modules')

function makeDynamicI18nPatterns() {
  return Object.entries(dynamicModules).map(([moduleName, config]) => ({
    from: path.resolve(__dirname, '../src', config.i18nDir),
    to: path.resolve(__dirname, '../dist/i18n', moduleName),
    noErrorOnMissing: true,
  }))
}

module.exports = {
  makeDynamicI18nPatterns,
}
