import { storageConfigFarm, configBase } from "."

async function saveLastInConfig(source, target) {
  const storageConfig = await storageConfigFarm.get() || configBase
  storageConfig.last = Math.round(Date.now() / 1000) + 7
  await storageConfigFarm.set(storageConfig)
  window.postMessage({ source, target, action: "set-farm-last" });
}

export { saveLastInConfig }
