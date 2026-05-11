// apps/cdn/webpack/webpack.common.js
const webpackWeb = require('./webpack.web')
const webpackWebworker = require('./webpack.webworker')

module.exports = [
  webpackWebworker(),
  ...webpackWeb(),
]
