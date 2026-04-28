import { getTwTroopTemplates } from "./twTroopTemplates";
import { sleep } from "../../stable-compat/utils";
import { getGameData } from "@toolkit-tw-bot/document";
import StorageLocalCompat from "../../shared/indexdb/storage-local-compat.js";

const TEMPLATE_COMPONENT_STATE_PATH = ['planner', 'templates', 'component-state']
const TEMPLATE_COMMANDS_PATH = ['planner', 'templates', 'commands']

const getCurrentGameData = () => {
  if (typeof window !== "undefined" && typeof window.game_data !== "undefined") {
    return window.game_data
  }

  if (typeof document === "undefined") return null

  return getGameData()
}

let componentStorageCurrent = null
let commandStorageCurrent = null
let componentStateCache = {}
let templatesCache = []
let hydrated = false
let hydratePromise = null
let persistQueue = Promise.resolve()

function getStorageContext() {
  const gameData = getCurrentGameData()
  const world = String(gameData?.world || '').trim()
  const playerId = Number(gameData?.player?.id || 0)
  if (!world || !Number.isFinite(playerId) || playerId <= 0) return null
  return { world, playerId }
}

function createStorage(path = []) {
  const context = getStorageContext()
  if (!context) return null
  return StorageLocalCompat.create({
    world: context.world,
    playerId: context.playerId,
    path,
  })
}

function getComponentStorage() {
  if (!componentStorageCurrent) {
    componentStorageCurrent = createStorage(TEMPLATE_COMPONENT_STATE_PATH)
  }
  return componentStorageCurrent
}

function getCommandStorage() {
  if (!commandStorageCurrent) {
    commandStorageCurrent = createStorage(TEMPLATE_COMMANDS_PATH)
  }
  return commandStorageCurrent
}

function normalizeComponentState(value = null) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : {}
}

function normalizeTemplates(value = null) {
  return Array.isArray(value) ? [...value] : []
}

function queuePersist(task, label = 'persist') {
  persistQueue = persistQueue
    .catch(() => null)
    .then(task)
    .catch((error) => {
      console.warn(`[planner][templates][${label}]`, error?.message || error)
    })
}

async function hydratePlannerTemplatesStorage() {
  const [componentStateRaw, templatesRaw] = await Promise.all([
    getComponentStorage()?.get?.() ?? null,
    getCommandStorage()?.get?.() ?? null
  ])
  componentStateCache = normalizeComponentState(componentStateRaw)
  templatesCache = normalizeTemplates(templatesRaw)
  hydrated = true
  return {
    componentState: normalizeComponentState(componentStateCache),
    templates: normalizeTemplates(templatesCache)
  }
}

export async function readyPlannerTemplatesStorage() {
  if (hydrated) {
    return {
      componentState: normalizeComponentState(componentStateCache),
      templates: normalizeTemplates(templatesCache)
    }
  }
  if (!hydratePromise) {
    hydratePromise = hydratePlannerTemplatesStorage()
      .catch((error) => {
        console.warn('[planner][templates][ready]', error?.message || error)
        componentStateCache = {}
        templatesCache = []
        hydrated = true
        return {
          componentState: {},
          templates: []
        }
      })
      .finally(() => {
        hydratePromise = null
      })
  }
  return await hydratePromise
}

const getState = (key, fallback = undefined) => {
  const stored = normalizeComponentState(componentStateCache)
  if (!key) return stored
  return stored?.[key] ?? fallback
}

const setState = (key, value) => {
  componentStateCache = {
    ...normalizeComponentState(componentStateCache),
    [key]: value,
  }
  const snapshot = normalizeComponentState(componentStateCache)
  queuePersist(async() => {
    const storage = getComponentStorage()
    if (!storage) return
    if (!Object.keys(snapshot).length) {
      await storage.remove?.()
      return
    }
    await storage.set?.(snapshot)
  }, 'state')
}

const getTemplates = () => normalizeTemplates(templatesCache)

const setTemplates = (templates = []) => {
  templatesCache = normalizeTemplates(templates)
  const snapshot = normalizeTemplates(templatesCache)
  queuePersist(async() => {
    const storage = getCommandStorage()
    if (!storage) return
    if (!snapshot.length) {
      await storage.remove?.()
      return
    }
    await storage.set?.(snapshot)
  }, 'templates')
}

async function plannerTemplates({ target = document, signal } = {}) {
  try {
    const twTroopTemplates = await getTwTroopTemplates({ signal });
    if (twTroopTemplates && target) {
      await sleep(2)
      target.dispatchEvent(
        new CustomEvent('go:templates:tw', {
          bubbles: true,
          detail: { templates: twTroopTemplates, source: 'tw' }
        })
      )
    }
    return twTroopTemplates
  } catch (error) {
    if (signal?.aborted) return null
    throw error
  }
}

export { plannerTemplates, getState, setState, getTemplates, setTemplates }
