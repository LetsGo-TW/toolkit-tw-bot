// apps/cdn/entries/entries.js
module.exports = {
  web: {
    'game.prepared': {
      entry: '../src/index.js',
      build: {
        obfuscationLevel: 'low',
      },
    },
    'game.staged': {
      entry: '../src/game/index.js',
      build: {
        obfuscationLevel: 'high',
      },
    },
  },

  workers: {},
}
