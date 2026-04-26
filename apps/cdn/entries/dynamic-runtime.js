module.exports = {
  incomingApply: {
    importPath: './incoming/apply-runner.js',
    chunkName: 'incoming-apply',
    exportName: 'default',
  },

  solver: {
    importPath: './hCaptcha/index.js',
    chunkName: 'solver-runtime',
    exportName: 'default',
  },
}
