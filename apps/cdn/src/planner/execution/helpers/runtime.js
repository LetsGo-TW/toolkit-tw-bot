import Running from "../../../running";

const plannerSendRunning = new Running('plannerSend')

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function awaitPlannerSendRunning(intervalMs = 250) {
  while (plannerSendRunning.is_paused('plannerSend')) {
    await sleep(intervalMs)
  }
}

export function getJitterMs() {
  return 200 + Math.floor(Math.random() * 51)
}

export function normalizeExecutionCadenceProfile(value) {
  return String(value || '').trim().toLowerCase() === 'aggressive'
    ? 'aggressive'
    : 'conservative'
}

function getRandomIntInclusive(min, max) {
  const normalizedMin = Math.floor(Number(min) || 0)
  const normalizedMax = Math.floor(Number(max) || 0)
  if (normalizedMax <= normalizedMin) return Math.max(0, normalizedMin)
  return normalizedMin + Math.floor(Math.random() * (normalizedMax - normalizedMin + 1))
}

export function createExecutionCadence(profile) {
  const normalizedProfile = normalizeExecutionCadenceProfile(profile)
  const phases = normalizedProfile === 'aggressive'
    ? {
        phase1: { minMs: 0, maxMs: 0 },
        phase2: { minMs: 0, maxMs: 0 },
        phase3: { minMs: 201, maxMs: 221, perAttack: true }
      }
    : {
        phase1: { minMs: 80, maxMs: 120 },
        phase2: { minMs: 80, maxMs: 120 },
        phase3: { minMs: 201, maxMs: 241, perAttack: true }
      }

  return {
    profile: normalizedProfile,
    phases
  }
}

export function getExecutionCadenceDelayMs(cadence, phaseName, count = 1) {
  const phase = cadence?.phases?.[phaseName]
  if (!phase) return 0
  const baseDelay = getRandomIntInclusive(phase?.minMs, phase?.maxMs)
  if (!(baseDelay > 0)) return 0
  if (!phase?.perAttack) return baseDelay
  const safeCount = Math.max(1, Math.floor(Number(count) || 1))
  return baseDelay * safeCount
}

export function isCaptchaError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  const cause = String(error?.cause || '').toLowerCase()
  return (
    message.includes('captcha') ||
    message.includes('bot protection') ||
    message.includes('protecting-bot') ||
    cause.includes('protecting-bot')
  )
}
