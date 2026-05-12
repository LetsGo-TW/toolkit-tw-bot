// apps/extension/webpack/webpack.service-worker.js
const path = require('path')
const CopyPlugin = require('copy-webpack-plugin')
const { resolveEntries } = require('./webpack.resolve-entry-map')
const { GenerateExtensionManifestPlugin } = require('./webpack.make-manifest')
const { makeDotenvPlugin } = require('./webpack.make-dotenv-plugin')
const babelConfigFile = path.resolve(__dirname, '../../../babel.config.json')

function loadReleaseConfig() {
  try {
    return require('@toolkit-tw-bot/release')
  } catch {
    return require('../../../packages/release/src')
  }
}

const { assetBasePath } = loadReleaseConfig()
const bundledCdnOutputDir = assetBasePath.replace(/^\/+/, '')
const bundledCdnSourceDir = path.resolve(__dirname, '../../cdn/dist')

function shouldBundleExtensionCdn() {
  const buildEnv = process.env.WEBPACK_BUILD_ENV || 'dev'

  return buildEnv === 'dev'
}

module.exports = () => {
  const copyPatterns = [
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
    {
      from: path.resolve(__dirname, '../src/sounds'),
      to: 'sounds',
      noErrorOnMissing: true,
    },
    {
      from: path.resolve(__dirname, '../src/service-worker/prepared-context/view'),
      to: 'service-worker/prepared-context/view',
      noErrorOnMissing: true,
      globOptions: {
        ignore: ['**/index.js'],
      },
    },
  ]

  if (shouldBundleExtensionCdn()) {
    copyPatterns.push({
      from: path.resolve(bundledCdnSourceDir, '**/*'),
      context: bundledCdnSourceDir,
      to: `${bundledCdnOutputDir}/[path][name][ext]`,
      noErrorOnMissing: true,
    })
  }

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
            options: {
              configFile: babelConfigFile,
            },
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
      makeDotenvPlugin(),
      new GenerateExtensionManifestPlugin(),
      new CopyPlugin({
        patterns: copyPatterns,
      }),
    ],
  }

  return serviceWorker
}
