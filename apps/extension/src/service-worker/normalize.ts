export function normalizeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function normalizeStrictBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

export function normalizeBoolean(value: unknown) {
  return value === true
}

export function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
