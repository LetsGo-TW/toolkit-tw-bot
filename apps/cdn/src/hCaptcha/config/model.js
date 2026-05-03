import { getGameData } from "@toolkit-tw-bot/document"
import StorageLocalCompat from "../../shared/indexdb/storage-local-compat"
import { svgToDataUri } from "../../components/go-buttons/util"

const HCAPTCHA_SOLVER_CONFIG_EVENT = 'go:hcaptcha-solver:config-change'

const DEFAULT_HCAPTCHA_SOLVER_CONFIG = {
  active: false,
  seconds: 3600,
  sound: false,
}

export const HCAPTCHA_REPORT_ICON_URL = svgToDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<rect x="5" y="3.5" width="14" height="17" rx="2.2" fill="#fff" stroke="#7c5a1e" stroke-width="1.4"/>' +
    '<path d="M8 8h8M8 11h8M8 14h6" stroke="#7c5a1e" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="16.8" cy="16.8" r="3.2" fill="#facc15" stroke="#7c5a1e" stroke-width="1.2"/>' +
    '<path d="M15.9 16.8h1.8M16.8 15.9v1.8" stroke="#7c5a1e" stroke-width="1.2" stroke-linecap="round"/>' +
  '</svg>'
)

let storageInstance = null

function resolveWindowTarget() {
  return typeof window !== 'undefined' ? window : null
}

function emitHCaptchaSolverConfigChange(config) {
  const target = resolveWindowTarget()
  if (!target || typeof target.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') {
    return
  }

  target.dispatchEvent(new CustomEvent(HCAPTCHA_SOLVER_CONFIG_EVENT, {
    detail: normalizeHCaptchaSolverConfig(config),
  }))
}

export function normalizeHCaptchaSolverConfig(source = {}) {
  const normalizedSeconds = Number(source?.seconds)

  return {
    active: Boolean(source?.active),
    seconds: Number.isFinite(normalizedSeconds) && normalizedSeconds > 0
      ? Math.floor(normalizedSeconds)
      : DEFAULT_HCAPTCHA_SOLVER_CONFIG.seconds,
    sound: Boolean(source?.sound),
  }
}

export function getDefaultHCaptchaSolverConfig() {
  return { ...DEFAULT_HCAPTCHA_SOLVER_CONFIG }
}

export function getHCaptchaSolverStorage() {
  if (storageInstance) {
    return storageInstance
  }

  const gameData = getGameData()
  if (!gameData?.world || !gameData?.player?.id) {
    return null
  }

  storageInstance = StorageLocalCompat.create({
    world: gameData.world,
    playerId: gameData.player.id,
    path: ['hcaptcha-solver', 'config'],
  })

  return storageInstance
}

export async function readHCaptchaSolverConfig() {
  const storage = getHCaptchaSolverStorage()
  if (!storage) {
    return getDefaultHCaptchaSolverConfig()
  }

  if (!await storage.exists()) {
    const defaults = getDefaultHCaptchaSolverConfig()
    await storage.set(defaults)
    return defaults
  }

  const config = await storage.get()
  const normalized = normalizeHCaptchaSolverConfig(config)

  if (
    !config
    || normalized.active !== Boolean(config?.active)
    || normalized.sound !== Boolean(config?.sound)
    || normalized.seconds !== Number(config?.seconds)
  ) {
    await storage.set(normalized)
  }

  return normalized
}

export async function writeHCaptchaSolverConfig(nextConfig = {}) {
  const storage = getHCaptchaSolverStorage()
  const normalized = normalizeHCaptchaSolverConfig(nextConfig)

  if (storage) {
    await storage.set(normalized)
  }

  emitHCaptchaSolverConfigChange(normalized)
  return normalized
}

export function subscribeHCaptchaSolverConfig(listener) {
  const target = resolveWindowTarget()
  if (!target || typeof target.addEventListener !== 'function' || typeof listener !== 'function') {
    return () => {}
  }

  const onChange = (event) => {
    listener(normalizeHCaptchaSolverConfig(event?.detail || {}), event)
  }

  target.addEventListener(HCAPTCHA_SOLVER_CONFIG_EVENT, onChange)

  return () => {
    target.removeEventListener(HCAPTCHA_SOLVER_CONFIG_EVENT, onChange)
  }
}
