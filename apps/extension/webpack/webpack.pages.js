const path = require('path')
const Dotenv = require('dotenv-webpack')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const { getEntryConfigs } = require('./webpack.get-entry-config')
const { resolveEntries } = require('./webpack.resolve-entry-map')

function makePageHtmlPlugins() {
  return Object.entries(getEntryConfigs('pg')).map(([name, config]) => (
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, '../src/extension/index.html'),
      filename: config.htmlFilename || `${name}.html`,
      chunks: [name],
    })
  ))
}

module.exports = () => {
  const pages = {
    name: 'PG',

    dependencies: ['SW'],

    target: 'web',

    entry: resolveEntries('pg'),

    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
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
          test: /\.(?:ico|gif|png|jpg|jpeg)$/i,
          type: 'asset/resource',
        },
        {
          test: /\.(woff(2)?|eot|ttf|otf|svg)$/i,
          type: 'asset/inline',
        },
        {
          test: /\.json$/,
          type: 'json',
        },
      ],
    },

    output: {
      clean: false,
      path: path.resolve(__dirname, '../dist'),
      filename: 'pages/[name].[contenthash].js',
      chunkFilename: 'pages/[name].[contenthash].js',
      assetModuleFilename: 'pages/assets/[name].[contenthash][ext][query]',
    },

    plugins: [
      new Dotenv(),
      ...makePageHtmlPlugins(),
    ],

    optimization: {
      moduleIds: 'deterministic',
      runtimeChunk: 'single',
      splitChunks: {
        chunks: 'all',
      },
    },
  }

  return pages
}
