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

  'farm-handler': {
    importPath: './farm-max/handler/index.js',
    chunkName: 'farm-handler-runtime',
    exportName: 'default',
  },

  'farm-schedules': {
    importPath: './farm-max/schedules/index.js',
    chunkName: 'farm-schedules-runtime',
    exportName: 'default',
  },
}
