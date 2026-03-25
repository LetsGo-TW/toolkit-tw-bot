// apps/extension/webpack/webpack.get-entry-config.js
const entries = require('../entries/entries')

function getEntryConfigs(group) {
  return entries[group] || {}
}

function hasEntryConfigs(group) {
  return Object.keys(getEntryConfigs(group)).length > 0
}

module.exports = {
  getEntryConfigs,
  hasEntryConfigs,
}
