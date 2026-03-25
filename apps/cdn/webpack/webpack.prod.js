// apps/cdn/webpack/webpack.prod.js
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
const TerserPlugin = require('terser-webpack-plugin')

module.exports = {
  mode: 'production',
  output: { clean: true },
  devtool: false,
  plugins: [...(process.env.ANALYZE === 'true' ? [new BundleAnalyzerPlugin()] : [])],
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
