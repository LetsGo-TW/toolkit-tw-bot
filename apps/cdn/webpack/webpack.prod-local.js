const { merge } = require('webpack-merge')
const { SyncApiPublicCdnPlugin } = require('./webpack.make-sync-api-public-plugin')
const prodConfig = require('./webpack.prod')

module.exports = merge(prodConfig, {
  plugins: [new SyncApiPublicCdnPlugin()],
})
