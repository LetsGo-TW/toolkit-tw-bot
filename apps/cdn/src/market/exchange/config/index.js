import { StorageLocalCompat } from "@toolkit-tw-bot/browser"
import { getGameData } from "@toolkit-tw-bot/document"
import configDefault from "./default.json"

const EXCHANGE_CONFIG_STORAGE_PATH = ["exchange", "config"]

let storageInstance = null

function cloneConfigDefault() {
  return JSON.parse(JSON.stringify(configDefault))
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function mergeConfigShape(defaultValue, sourceValue) {
  if (Array.isArray(defaultValue)) {
    return Array.isArray(sourceValue)
      ? JSON.parse(JSON.stringify(sourceValue))
      : JSON.parse(JSON.stringify(defaultValue))
  }

  if (!isPlainObject(defaultValue)) {
    return typeof sourceValue === "undefined"
      ? defaultValue
      : sourceValue
  }

  const nextValue = Object.keys(defaultValue).reduce((acc, key) => {
    acc[key] = mergeConfigShape(defaultValue[key], isPlainObject(sourceValue) ? sourceValue[key] : undefined)
    return acc
  }, {})

  if (isPlainObject(sourceValue)) {
    Object.keys(sourceValue).forEach((key) => {
      if (!(key in nextValue)) {
        nextValue[key] = sourceValue[key]
      }
    })
  }

  return nextValue
}

function normalizeConfig(config) {
  return mergeConfigShape(cloneConfigDefault(), isPlainObject(config) ? config : {})
}

function getCurrentGameData() {
  if (typeof window !== "undefined" && typeof window.game_data !== "undefined") {
    return window.game_data
  }

  if (typeof document === "undefined") {
    return null
  }

  return getGameData()
}

function getExchangeConfigStorage() {
  if (storageInstance) {
    return storageInstance
  }

  const gameData = getCurrentGameData()
  const world = String(gameData?.world || "").trim() || null
  const playerId = Number(gameData?.player?.id)

  if (!world || !Number.isFinite(playerId) || playerId <= 0) {
    return null
  }

  storageInstance = StorageLocalCompat.create({
    world,
    playerId,
    path: EXCHANGE_CONFIG_STORAGE_PATH,
  })

  return storageInstance
}

async function saveConfig(config) {
  const normalized = normalizeConfig(config)
  const storage = getExchangeConfigStorage()

  if (storage) {
    await storage.set(normalized)
  }

  return normalized
}

async function getConfig() {
  const storage = getExchangeConfigStorage()

  if (!storage) {
    return cloneConfigDefault()
  }

  if (await storage.exists()) {
    const storedConfig = await storage.get()
    const normalized = normalizeConfig(storedConfig)

    if (JSON.stringify(normalized) !== JSON.stringify(storedConfig || null)) {
      await storage.set(normalized)
    }

    return normalized
  }

  const config = cloneConfigDefault()
  await storage.set(config)
  return config
}

export {
  configDefault,
  getExchangeConfigStorage,
  saveConfig,
  getConfig,
  normalizeConfig,
}
