// apps/cdn/webpack/webpack.dev.js
const { merge } = require('webpack-merge')
const { SyncApiPublicCdnPlugin } = require('./webpack.make-sync-api-public-plugin')
const prodConfig = require('./webpack.prod')
const { output: _prodOutput, ...prodConfigWithoutOutput } = prodConfig

module.exports = merge(prodConfigWithoutOutput, {
  devtool: 'source-map',
  plugins: [new SyncApiPublicCdnPlugin()],
})
