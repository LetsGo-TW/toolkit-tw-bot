const METHODS = new Set(['log', 'info', 'debug', 'warn', 'error'])
const DEFAULT_LABEL = '[GO:DEV]'
const rateState = new Map()

const state = {
  enabled: detectDevRuntime(),
}

function detectDevRuntime() {
  if (typeof window !== 'undefined' && typeof window.__GO_CONSOLE_DEV__ === 'boolean') {
    return window.__GO_CONSOLE_DEV__
  }

  if (typeof process !== 'undefined' && process && process.env && process.env.NODE_ENV) {
    return process.env.NODE_ENV === 'development'
  }

  if (typeof document !== 'undefined' && document && document.scripts) {
    return Array.from(document.scripts).some((script) => {
      const src = String(script?.src || '')
      return src.includes('/scripts/dev/')
    })
  }

  return false
}

function safeStringify(value, spaces = 2) {
  const seen = new WeakSet()
  return JSON.stringify(
    value,
    (_, current) => {
      if (current instanceof Error) {
        return {
          name: current.name,
          message: current.message,
          stack: current.stack,
        }
      }
      if (typeof current === 'function') {
        return `[Function ${current.name || 'anonymous'}]`
      }
      if (typeof current === 'object' && current !== null) {
        if (seen.has(current)) return '[Circular]'
        seen.add(current)
      }
      return current
    },
    spaces,
  )
}

function buildTimeTag(time) {
  if (!time) return ''

  const now = new Date()
  if (time === 'iso') return now.toISOString()
  if (typeof time === 'object' && time !== null) {
    const locale = time.locale || 'pt-BR'
    const withDate = Boolean(time.withDate)
    return withDate ? now.toLocaleString(locale) : now.toLocaleTimeString(locale)
  }
  return now.toLocaleTimeString('pt-BR')
}

function applyArrayLimit(value, limit) {
  if (!Array.isArray(value)) return { value, limitTag: '' }
  const n = Number(limit)
  if (!Number.isFinite(n) || n < 0) return { value, limitTag: '' }
  const size = Math.floor(n)
  if (value.length <= size) return { value, limitTag: '' }
  return {
    value: value.slice(0, size),
    limitTag: `[array ${size}/${value.length}]`,
  }
}

function normalizeValue(value, format) {
  if (!format) return value
  if (typeof value === 'string') return value
  const serialized = safeStringify(value, 2)
  return serialized === undefined ? String(value) : serialized
}

function canWriteByRate({
  rateKey,
  throttleMs,
  maxLogs,
  windowMs,
  defaultKey,
}) {
  const throttle = Number(throttleMs)
  const max = Number(maxLogs)
  const window = Number(windowMs)
  const hasThrottle = Number.isFinite(throttle) && throttle > 0
  const hasWindowLimit = Number.isFinite(max) && max >= 0

  if (!hasThrottle && !hasWindowLimit) {
    return { allowed: true, firstInWindow: true, hasWindowLimit: false }
  }

  const key = String(rateKey || defaultKey || 'default')
  const now = Date.now()
  const entry = rateState.get(key) || {
    lastAt: 0,
    windowStartAt: now,
    count: 0,
  }

  if (hasWindowLimit) {
    const range = Number.isFinite(window) && window > 0 ? window : 60_000
    if (now - entry.windowStartAt >= range) {
      entry.windowStartAt = now
      entry.count = 0
    }
    if (entry.count >= Math.floor(max)) {
      rateState.set(key, entry)
      return { allowed: false, firstInWindow: false, hasWindowLimit }
    }
  }

  if (hasThrottle && now - entry.lastAt < throttle) {
    rateState.set(key, entry)
    return { allowed: false, firstInWindow: false, hasWindowLimit }
  }

  const firstInWindow = hasWindowLimit ? entry.count === 0 : true
  entry.lastAt = now
  if (hasWindowLimit) entry.count += 1
  rateState.set(key, entry)
  return { allowed: true, firstInWindow, hasWindowLimit }
}

function write(level, value, options = {}) {
  if (!state.enabled) return

  const method = METHODS.has(level) ? level : 'log'
  const {
    icon = '',
    color = '',
    format = false,
    label = DEFAULT_LABEL,
    time = false,
    limit,
    clear = false,
    rateKey = '',
    throttleMs,
    maxLogs,
    windowMs,
  } = options || {}
  const rate = canWriteByRate({
    rateKey,
    throttleMs,
    maxLogs,
    windowMs,
    defaultKey: `${label}:${method}`,
  })
  if (!rate.allowed) return
  if (clear && (!rate.hasWindowLimit || rate.firstInWindow)) console.clear()
  const timeTag = buildTimeTag(time)
  const { value: limitedValue, limitTag } = applyArrayLimit(value, limit)
  const prefix = [label, icon, timeTag, limitTag].filter(Boolean).join(' ')
  const payload = normalizeValue(limitedValue, format)

  if (color) {
    if (typeof payload === 'undefined') {
      console[method](`%c${prefix}`, `color:${color};font-weight:600;`)
      return
    }
    console[method](`%c${prefix}`, `color:${color};font-weight:600;`, payload)
    return
  }

  if (typeof payload === 'undefined') {
    console[method](prefix)
    return
  }
  console[method](prefix, payload)
}

function consoleDev(value, options = {}) {
  write('log', value, options)
}

consoleDev.log = (value, options = {}) => write('log', value, options)
consoleDev.info = (value, options = {}) => write('info', value, options)
consoleDev.debug = (value, options = {}) => write('debug', value, options)
consoleDev.warn = (value, options = {}) => write('warn', value, options)
consoleDev.error = (value, options = {}) => write('error', value, options)
consoleDev.clear = () => {
  if (!state.enabled) return
  console.clear()
}
consoleDev.setEnabled = (next) => {
  state.enabled = Boolean(next)
  return state.enabled
}
consoleDev.isEnabled = () => state.enabled
consoleDev.resetRate = (rateKey) => {
  if (!rateKey) {
    rateState.clear()
    return
  }
  rateState.delete(String(rateKey))
}

module.exports = consoleDev
