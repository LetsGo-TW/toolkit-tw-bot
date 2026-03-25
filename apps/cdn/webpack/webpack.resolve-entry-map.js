// apps/cdn/webpack/webpack.resolve-entry-map.js
const path = require('path')
const entries = require('../entries')

function resolveEntries(group) {
  return Object.fromEntries(
    Object.entries(entries[group]).map(([name, relativePath]) => [
      name,
      path.resolve(__dirname, '../src', relativePath),
    ]),
  )
}

module.exports = {
  resolveEntries,
}
