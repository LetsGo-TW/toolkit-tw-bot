// apps/cdn/webpack/webpack.webworker.js
const path = require('path')
const Dotenv = require('dotenv-webpack');
const { resolveEntries } = require('./webpack.resolve-entry-map');

module.exports = () => {
  const webworker = {
    name: 'WORKERS',

    target: 'webworker',

    entry: resolveEntries('workers'),

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
      path: path.resolve(__dirname, '../dist/workers'),
      filename: '[name].js',
    },

    plugins: [
      new Dotenv(),
    ],
  }

  return webworker;
}

