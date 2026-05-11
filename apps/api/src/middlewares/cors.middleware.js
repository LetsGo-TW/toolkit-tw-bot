const { extensionId: RELEASE_EXTENSION_ID } = require('@toolkit-tw-bot/release')

const EXTENSION_ORIGIN = `chrome-extension://${RELEASE_EXTENSION_ID}`
const DEFAULT_ALLOWED_HEADERS = 'Content-Type, Authorization, X-Requested-With'
const DEFAULT_ALLOWED_METHODS = 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS'

function getConfiguredAllowedOrigins() {
  return new Set(
    String(process.env.API_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  )
}

const CONFIGURED_ALLOWED_ORIGINS = getConfiguredAllowedOrigins()

function parseOrigin(origin) {
  try {
    return new URL(origin)
  } catch {
    return null
  }
}

function isSameAppOrigin(req, requestOrigin) {
  const parsedOrigin = parseOrigin(requestOrigin)

  if (!parsedOrigin) {
    return false
  }

  return (
    (parsedOrigin.protocol === 'http:' || parsedOrigin.protocol === 'https:')
    && parsedOrigin.host === req.get('host')
  )
}

function isAllowedOrigin(req, requestOrigin) {
  if (!requestOrigin) {
    return true
  }

  if (requestOrigin === EXTENSION_ORIGIN) {
    return true
  }

  if (CONFIGURED_ALLOWED_ORIGINS.has(requestOrigin)) {
    return true
  }

  return isSameAppOrigin(req, requestOrigin)
}

function applyCorsHeaders(req, res, requestOrigin) {
  const requestHeaders = req.get('Access-Control-Request-Headers')

  if (requestOrigin) {
    res.header('Access-Control-Allow-Origin', requestOrigin)
    res.header('Vary', 'Origin, Access-Control-Request-Headers, Access-Control-Request-Method')
  }

  res.header('Access-Control-Allow-Methods', DEFAULT_ALLOWED_METHODS)
  res.header('Access-Control-Allow-Headers', requestHeaders || DEFAULT_ALLOWED_HEADERS)
}

function corsMiddleware(req, res, next) {
  const requestOrigin = req.get('Origin')

  if (!isAllowedOrigin(req, requestOrigin)) {
    res.status(403).json({
      error: 'Origin not allowed',
    })
    return
  }

  applyCorsHeaders(req, res, requestOrigin)

  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }

  next()
}

module.exports = corsMiddleware
