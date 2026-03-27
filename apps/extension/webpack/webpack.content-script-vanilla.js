const path = require('path')
const { resolveEntries } = require('./webpack.resolve-entry-map')
const { makeDotenvPlugin } = require('./webpack.make-dotenv-plugin')
const babelConfigFile = path.resolve(__dirname, '../../../babel.config.json')

module.exports = () => {
  const contentScriptVanilla = {
    name: 'CS_VANILLA',

    dependencies: ['SW'],

    target: 'web',

    entry: resolveEntries('csVanilla'),

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
      chunkFilename: '[name].js',
      assetModuleFilename: 'assets/[name].[contenthash][ext][query]',
    },

    optimization: {
      splitChunks: false,
      runtimeChunk: false,
    },

    plugins: [makeDotenvPlugin()],
  }

  return contentScriptVanilla
}
