function parseNumericSearchParam(value) {
  const numericValue = Number(String(value || '').match(/[0-9]+/)?.[0])

  return Number.isFinite(numericValue) ? numericValue : null
}

function createUrl(base, origin) {
  if (!base) {
    return null
  }

  try {
    return origin ? new URL(base, origin) : new URL(base)
  } catch {
    return null
  }
}

function getParamsUrl(base, origin) {
  const url = createUrl(base, origin)

  if (!url) {
    return {}
  }

  const sessionExpired = url.searchParams.get('session_expired') || null
  const screen = url.searchParams.get('screen') || null
  const mode = url.searchParams.get('mode') || null
  const targetId = parseNumericSearchParam(url.searchParams.get('target'))
  const villageId = parseNumericSearchParam(url.searchParams.get('village'))
  const t = parseNumericSearchParam(url.searchParams.get('t'))
  const isTryConfirm = url.searchParams.get('try')?.includes('confirm') || false
  const isIntro = url.searchParams.has('intro')
  const groupId = parseNumericSearchParam(url.searchParams.get('group'))
  const page = parseNumericSearchParam(url.searchParams.get('page'))
  const isMdf = t !== null
  const pathname = url.pathname || '/'
  const hostname = url.hostname || null
  const isInGame = pathname === '/game.php'
  const isPortalPage = /^\/page\/play(?:\/|$)/.test(pathname)
  const isInLogin = !isInGame && (
    pathname === '/'
    || isPortalPage
    || hostname?.startsWith('www.') === true
  )

  return {
    href: url.href,
    origin: url.origin,
    hostname,
    pathname,
    sessionExpired,
    screen,
    mode,
    targetId,
    villageId,
    t,
    isTryConfirm,
    isIntro,
    groupId,
    page,
    isMdf,
    isInGame,
    isPortalPage,
    isInLogin,
  }
}

module.exports = getParamsUrl
