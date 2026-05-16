const path = require('path')
const { resolveEntryConfigs } = require('./webpack.resolve-entry-map')
const { makeDotenvPlugin } = require('./webpack.make-dotenv-plugin')
const { getGroupedEntryConfigs } = require('./webpack.get-entry-config')
const babelConfigFile = path.resolve(__dirname, '../../../babel.config.json')

function sanitizeNameSegment(value, fallback = 'default') {
  const sanitizedValue = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return sanitizedValue || fallback
}

function makeConfigName(profileName, obfuscationLevel, asyncChunks, obfuscateAsyncChunks, obfuscate) {
  if (profileName === 'default' && !obfuscationLevel && !asyncChunks && obfuscate !== false) {
    return 'CS_VANILLA'
  }

  const profileSegment = String(profileName || 'default')
    .replace(/[^a-z0-9_-]/gi, '_')
    .toUpperCase()
  const levelSegment = String(obfuscationLevel || 'inherit')
    .replace(/[^a-z0-9_-]/gi, '_')
    .toUpperCase()
  const asyncSegment = asyncChunks ? 'ASYNC' : 'SYNC'
  const chunkObfuscationSegment = asyncChunks
    ? (obfuscateAsyncChunks ? 'CHUNKOBF' : 'NOCHUNKOBF')
    : 'NOASYNC'
  const obfuscationSegment = obfuscate === false ? 'NOOBF' : 'OBF'

  return `CS_VANILLA__${profileSegment}__${levelSegment}__${asyncSegment}__${chunkObfuscationSegment}__${obfuscationSegment}`
}

function makeStableAsyncChunkFilename(profileName) {
  return `chunks/${sanitizeNameSegment(profileName)}.[name].js`
}

function makeContentScriptVanillaConfig({
  asyncChunks,
  obfuscate,
  obfuscateAsyncChunks,
  profile,
  obfuscationLevel,
  entries,
}) {
  return {
    name: makeConfigName(profile, obfuscationLevel, asyncChunks, obfuscateAsyncChunks, obfuscate),

    dependencies: ['SW'],

    target: 'web',

    entry: resolveEntryConfigs(entries),

    resolve: {
      extensions: ['.ts', '.tsx', '.js'],
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
        {
          test: /\.css$/i,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.(?:ico|gif|png|jpg|jpeg|svg)$/i,
          type: 'asset',
        },
      ],
    },

    output: {
      clean: false,
      path: path.resolve(__dirname, '../dist/content-scripts'),
      publicPath: '',
      filename: '[name].js',
      chunkFilename: asyncChunks ? makeStableAsyncChunkFilename(profile) : '[name].js',
      assetModuleFilename: 'assets/[name].[contenthash][ext][query]',
    },

    optimization: {
      // Keep async chunk ids stable across extension updates so older tabs can still
      // load the newer chunk file after Chrome swaps the installed extension bundle.
      splitChunks: false,
      runtimeChunk: false,
      chunkIds: asyncChunks ? 'named' : 'deterministic',
      moduleIds: 'deterministic',
    },

    plugins: [makeDotenvPlugin()],
  }
}

module.exports = () => (
  getGroupedEntryConfigs(['csVanilla', 'csAssetVanilla'])
    .map((group) => makeContentScriptVanillaConfig(group))
)
