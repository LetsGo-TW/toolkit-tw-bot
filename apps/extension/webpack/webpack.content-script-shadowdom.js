const path = require('path')
const Dotenv = require('dotenv-webpack')
const { resolveEntries } = require('./webpack.resolve-entry-map')

module.exports = () => {
  const contentScriptShadowdom = {
    name: 'CS_SHADOWDOM',

    dependencies: ['SW'],

    target: 'web',

    entry: resolveEntries('csShadowDom'),

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
      path: path.resolve(__dirname, '../dist'),
      filename: '[name].js',
      chunkFilename: '[name].js',
      assetModuleFilename: 'content-scripts/assets/[name].[contenthash][ext][query]',
    },

    optimization: {
      splitChunks: false,
      runtimeChunk: false,
    },

    plugins: [new Dotenv()],
  }

  return contentScriptShadowdom
}
