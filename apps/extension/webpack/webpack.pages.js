const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const { getEntryConfigs } = require('./webpack.get-entry-config')
const { resolveEntries } = require('./webpack.resolve-entry-map')
const { makeDotenvPlugin } = require('./webpack.make-dotenv-plugin')
const babelConfigFile = path.resolve(__dirname, '../../../babel.config.json')

function makePageHtmlPlugins() {
  return Object.entries(getEntryConfigs('pg')).map(([name, config]) => (
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, '../src/pages/index.html'),
      filename: config.htmlFilename || `${name}.html`,
      chunks: ['runtime', 'react-vendor', 'styled-vendor', name],
      chunksSortMode: 'manual',
      title: config.title || "Let's GO! - Player Assistant",
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
      filename: 'pages/[name].js',
      chunkFilename: 'pages/chunks/[name].js',
      assetModuleFilename: 'pages/assets/[name][ext][query]',
    },

    plugins: [
      makeDotenvPlugin(),
      ...makePageHtmlPlugins(),
    ],

    optimization: {
      moduleIds: 'deterministic',
      chunkIds: 'deterministic',
      runtimeChunk: 'single',
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          default: false,
          defaultVendors: false,
          reactVendor: {
            test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            name: 'react-vendor',
            enforce: true,
          },
          styledVendor: {
            test: /[\\/]node_modules[\\/](styled-components|stylis|@emotion|tslib)[\\/]/,
            name: 'styled-vendor',
            enforce: true,
          },
        },
      },
    },
  }

  return pages
}
