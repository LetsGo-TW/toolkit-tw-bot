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
        obfuscationLevel: 'mediumSafe',
      },
    },
  },

  workers: {
    "worker.table-production": {
      entry: "../src/table-production/worker/index.js",
      build: {
        obfuscationLevel: "high",
      },
    },
    "worker.farm-schedules": {
      entry: "../src/farm-max/schedules/worker/index.js",
      build: {
        obfuscationLevel: "high",
      },
    },
  },
}
