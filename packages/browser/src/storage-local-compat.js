const { ScriptStorage } = require('./script-storage')

const StorageLocalCompat = {
  create(compose = {}) {
    const resolvedCompose = ScriptStorage.compose(compose)

    return {
      async exists() {
        const response = await ScriptStorage.get(resolvedCompose)
        return response?.found === true
      },

      async get() {
        const response = await ScriptStorage.get(resolvedCompose)
        return response?.data ?? null
      },

      async set(data) {
        const response = await ScriptStorage.put(resolvedCompose, data)
        return response?.data ?? data
      },

      async remove() {
        await ScriptStorage.delete(resolvedCompose)
      },
    }
  },
}

module.exports = StorageLocalCompat
