// apps/cdn/webpack/webpack.web.js
// apps/cdn/webpack/webpack.web.js
const path = require('path')
const Dotenv = require('dotenv-webpack')
const CopyPlugin = require('copy-webpack-plugin')
const { WebpackManifestPlugin } = require('webpack-manifest-plugin')
const { makeDynamicI18nPatterns } = require('./webpack.make-dynamic-i18n-patterns')
const { resolveEntries } = require('./webpack.resolve-entry-map')

module.exports = () => {
  const dynamicI18nPatterns = makeDynamicI18nPatterns()

  const web = {
    name: 'WEB',

    target: 'web',

    entry: resolveEntries('web'),

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
        {
          test: /\.html$/i,
          loader: 'html-loader',
        },
        {
          test: /\.css$/i,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.png$/i,
          type: 'asset',
        },
        {
          test: /\.svg$/i,
          type: 'asset',
        },
      ],
    },

    output: {
      clean: true,
      path: path.resolve(__dirname, '../dist/web'),
      filename: '[name].js',
      chunkFilename: '[name].js',
      assetModuleFilename: '[name].[contenthash][ext][query]',
    },

    plugins: [
      new Dotenv(),
      new WebpackManifestPlugin({
        publicPath: '',
      }),
    ],
  }

  if (dynamicI18nPatterns.length > 0) {
    web.plugins.splice(
      1,
      0,
      new CopyPlugin({
        patterns: dynamicI18nPatterns,
      }),
    )
  }

  return web
}
