// apps/extension/webpack/webpack.service-worker.js
const path = require('path')
const Dotenv = require('dotenv-webpack')
const CopyPlugin = require('copy-webpack-plugin')
const { resolveEntries } = require('./webpack.resolve-entry-map')
const { GenerateExtensionManifestPlugin } = require('./webpack.make-manifest')

module.exports = () => {
  const serviceWorker = {
    name: 'SW',

    target: 'webworker',

    entry: resolveEntries('sw'),

    resolve: {
      extensions: ['.ts', '.js'],
      extensionAlias: {
        '.js': ['.js', '.ts'],
      },
    },

    module: {
      rules: [
        {
          test: /\.[cm]?[jt]sx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
          },
        },
      ],
    },

    output: {
      clean: true,
      path: path.resolve(__dirname, '../dist'),
      filename: '[name].js',
    },

    optimization: {
      splitChunks: false,
      runtimeChunk: false,
    },

    plugins: [
      new Dotenv(),
      new GenerateExtensionManifestPlugin(),
      new CopyPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, '../src/icons'),
            to: 'icons',
            noErrorOnMissing: true,
          },
          {
            from: path.resolve(__dirname, '../src/styles'),
            to: 'styles',
            noErrorOnMissing: true,
          },
          {
            from: path.resolve(__dirname, '../src/rules'),
            to: 'rules',
            noErrorOnMissing: true,
          },
          {
            from: path.resolve(__dirname, '../src/_locales'),
            to: '_locales',
            noErrorOnMissing: true,
          },
        ],
      }),
    ],
  }

  return serviceWorker
}
