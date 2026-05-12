// apps/cdn/webpack/webpack.web.js
// apps/cdn/webpack/webpack.web.js
const path = require('path')
const Dotenv = require('dotenv-webpack')
const CopyPlugin = require('copy-webpack-plugin')
const { WebpackManifestPlugin } = require('webpack-manifest-plugin')
const { makeDynamicI18nPatterns } = require('./webpack.make-dynamic-i18n-patterns')
const { getGroupedEntryConfigs } = require('./webpack.get-entry-config')
const { resolveEntries } = require('./webpack.resolve-entry-map')

function sanitizeNameSegment(value, fallback = 'default') {
  const sanitizedValue = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return sanitizedValue || fallback
}

function makeConfigName(entryName) {
  return `WEB__${String(entryName || 'default').replace(/[^a-z0-9_-]/gi, '_').toUpperCase()}`
}

function makeRuntimeScopeName(entryName) {
  return `toolkit_tw_bot_cdn__${sanitizeNameSegment(entryName, 'default')}`
}

function makeWebConfig(
  groupedConfig,
  {
    dynamicI18nPatterns = [],
    isFirst = false,
    isLast = false,
  } = {},
) {
  const entryNames = Object.keys(groupedConfig.entries || {})
  const primaryEntryName = entryNames[0] || 'default'

  const plugins = [
    new Dotenv(),
  ]

  if (isFirst && dynamicI18nPatterns.length > 0) {
    plugins.push(
      new CopyPlugin({
        patterns: dynamicI18nPatterns,
      }),
    )
  }

  if (isLast) {
    plugins.push(
      new WebpackManifestPlugin({
        publicPath: '',
      }),
    )
  }

  return {
    name: makeConfigName(primaryEntryName),

    target: 'web',

    entry: resolveEntries(groupedConfig.entries),

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
          test: /\.shadow\.css$/i,
          type: 'asset/source',
        },
        {
          test: /\.css$/i,
          exclude: /\.shadow\.css$/i,
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
      clean: isFirst,
      path: path.resolve(__dirname, '../dist/web'),
      filename: '[name].js',
      chunkFilename: `chunks/${sanitizeNameSegment(primaryEntryName)}/[name].js`,
      assetModuleFilename: '[name].[contenthash][ext][query]',
      uniqueName: makeRuntimeScopeName(primaryEntryName),
      chunkLoadingGlobal: `webpackChunk_${makeRuntimeScopeName(primaryEntryName)}`,
    },

    optimization: {
      splitChunks: false,
      runtimeChunk: false,
    },

    plugins,
  }
}

module.exports = () => {
  const dynamicI18nPatterns = makeDynamicI18nPatterns()
  const groupedEntryConfigs = getGroupedEntryConfigs('web')

  return groupedEntryConfigs.map((groupedConfig, index) => makeWebConfig(
    groupedConfig,
    {
      dynamicI18nPatterns,
      isFirst: index === 0,
      isLast: index === groupedEntryConfigs.length - 1,
    },
  ))
}
