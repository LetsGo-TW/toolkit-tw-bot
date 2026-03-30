const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
const TerserPlugin = require('terser-webpack-plugin')
const {
  EscapeInvalidUnicodeInJsAssetsPlugin,
} = require('./webpack.escape-invalid-unicode-plugin')

module.exports = {
  mode: 'production',
  devtool: false,
  plugins: [
    ...(process.env.ANALYZE === 'true' ? [new BundleAnalyzerPlugin()] : []),
    new EscapeInvalidUnicodeInJsAssetsPlugin(),
  ],

  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true,
          },
        },
      }),
    ],
  },
}
