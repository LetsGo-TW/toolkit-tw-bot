import type { WorldPlayerLicenseRecord } from '..'

const HOUR_IN_MS = 3600 * 1000
const MINUTE_IN_MS = 60 * 1000
const TOKEN_REFRESH_MARGIN_MS = 5 * MINUTE_IN_MS
const LICENSE_EXPIRING_WINDOW_MS = 24 * HOUR_IN_MS
const BUTTON_LICENSE_POST_COOLDOWN_MS = 2 * MINUTE_IN_MS
const RUNTIME_LICENSE_POST_COOLDOWN_MS = 60 * MINUTE_IN_MS

export type EnsureWorldPlayerLicenseSource = 'button' | 'runtime'

type LicenseTokenPayload = {
  id?: unknown
  due?: unknown
  exp?: unknown
}

function normalizeNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)

    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function decodeBase64Url(value: string) {
  const normalized = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')

  return atob(normalized)
}

function parseLicenseTokenPayload(license: WorldPlayerLicenseRecord) {
  const token = license?.token

  if (!token) {
    return null
  }

  const [, payload] = token.split('.')

  if (!payload) {
    return null
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as LicenseTokenPayload

    return parsed && typeof parsed === 'object'
      ? parsed
      : null
  } catch {
    return null
  }
}

function getLicenseTokenExp(license: WorldPlayerLicenseRecord) {
  return normalizeNumber(parseLicenseTokenPayload(license)?.exp)
}

function getLicenseDue(license: WorldPlayerLicenseRecord) {
  return normalizeNumber(parseLicenseTokenPayload(license)?.due)
}

export function getLicenseTokenExpiresAt(license: WorldPlayerLicenseRecord) {
  const exp = getLicenseTokenExp(license)

  return exp === null
    ? null
    : exp * 1000
}

export function getLicenseDueAt(license: WorldPlayerLicenseRecord) {
  const due = getLicenseDue(license)

  return due === null
    ? null
    : due * 1000
}

export function isExpired(
  license: WorldPlayerLicenseRecord,
  now = Date.now(),
) {
  const expiresAt = getLicenseTokenExpiresAt(license)

  return expiresAt === null || expiresAt <= now
}

export function isAllowedByLicense(
  license: WorldPlayerLicenseRecord,
  now = Date.now(),
) {
  const due = getLicenseDue(license)

  if (due === null) {
    return false
  }

  return Math.trunc(now / HOUR_IN_MS) <= Math.trunc(due / 3600)
}

export function isLicenseExpiring(
  license: WorldPlayerLicenseRecord,
  now = Date.now(),
) {
  if (!isAllowedByLicense(license, now)) {
    return false
  }

  const dueAt = getLicenseDueAt(license)

  return dueAt !== null && dueAt - now <= LICENSE_EXPIRING_WINDOW_MS
}

export function getDelayInMinutes(
  license: WorldPlayerLicenseRecord,
  now = Date.now(),
) {
  const expiresAt = getLicenseTokenExpiresAt(license)

  if (expiresAt === null) {
    return 0
  }

  const refreshAt = expiresAt - TOKEN_REFRESH_MARGIN_MS
  const delayInMs = refreshAt - now

  return delayInMs <= 0
    ? 0
    : delayInMs / MINUTE_IN_MS
}

export function resolveRuntimeLicense(license: WorldPlayerLicenseRecord) {
  return {
    isAllowedByLicense: isAllowedByLicense(license),
    isLicenseExpiring: isLicenseExpiring(license),
    delayInMinutes: getDelayInMinutes(license),
    isExpired: isExpired(license),
  }
}

export function getNextLicensePostAt(
  license: WorldPlayerLicenseRecord,
  source: EnsureWorldPlayerLicenseSource,
) {
  return source === 'button'
    ? license.nextPostLicenseButtonAt
    : license.nextPostLicenseRuntimeAt
}

export function canPostLicense(
  license: WorldPlayerLicenseRecord,
  source: EnsureWorldPlayerLicenseSource,
  now = Date.now(),
) {
  const nextPostAt = getNextLicensePostAt(license, source)

  return nextPostAt === null || nextPostAt <= now
}

export function createLicensePostCooldownState(
  status: number | null,
  now = Date.now(),
) {
  return {
    nextPostLicenseButtonAt: now + BUTTON_LICENSE_POST_COOLDOWN_MS,
    nextPostLicenseRuntimeAt: now + RUNTIME_LICENSE_POST_COOLDOWN_MS,
    lastPostLicenseStatus: status,
    lastPostLicenseAt: now,
  }
}

export function createActiveLicensePostState() {
  return {
    nextPostLicenseButtonAt: null,
    nextPostLicenseRuntimeAt: null,
    lastPostLicenseStatus: null,
    lastPostLicenseAt: null,
  }
}
