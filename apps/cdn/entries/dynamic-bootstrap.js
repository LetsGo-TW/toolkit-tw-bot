module.exports = {
  composer: {
    importPath: './bootstrap/composer/index.js',
    chunkName: 'bootstrap-composer',
    exportName: 'default',
    build: {
      obfuscationLevel: 'low',
    },
  },
  collector: {
    importPath: './bootstrap/collector/index.js',
    chunkName: 'bootstrap-collector',
    exportName: 'default',
    build: {
      obfuscationLevel: 'low',
    },
  },
  'ctx-menu': {
    importPath: './bootstrap/ctx-menu/index.js',
    chunkName: 'bootstrap-ctx-menu',
    exportName: 'default',
    build: {
      obfuscationLevel: 'lowCompact',
    },
  },
  'planner-actions': {
    importPath: './bootstrap/planner-actions/index.js',
    chunkName: 'bootstrap-planner-actions',
    exportName: 'default',
    build: {
      obfuscationLevel: 'low',
    },
  },
}
