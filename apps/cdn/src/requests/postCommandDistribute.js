function normalizeBaseRoot(root) {
  const candidate = (root && typeof root === 'object')
    ? (root.base || root.root || root.origin || root.url || '')
    : root
  const raw = String(candidate || '').trim()
  if (!raw) throw new Error('API root inválido')

  let value = raw
  if (/^localhost(?::\d+)?(?:\/.*)?$/i.test(value) || /^127\.0\.0\.1(?::\d+)?(?:\/.*)?$/i.test(value)) {
    value = `http://${value}`
  } else if (!/^[a-z][a-z\d+\-.]*:\/\//i.test(value) && typeof window !== 'undefined') {
    if (value.startsWith('/')) value = new URL(value, window.location.origin).toString()
    else value = `${window.location.protocol}//${value}`
  }

  const url = new URL(value)
  if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`
  return url.toString()
}

function buildDistributeUrl(root) {
  const base = new URL(normalizeBaseRoot(root))
  const basePath = String(base.pathname || '/').replace(/\/+$/, '')
  const nextPath = /\/api$/i.test(basePath)
    ? `${basePath}/commands/distribute`
    : `${basePath}/api/commands/distribute`
  base.pathname = nextPath.replace(/\/{2,}/g, '/')
  return base.toString()
}

export async function postCommandDistribute({ root, token, payload, signal } = {}) {
  const authToken = String(token || '').trim()
  if (!authToken) throw new Error('Token da API inválido')

  let requestUrl = ''
  try {
    requestUrl = buildDistributeUrl(root)
  } catch (error) {
    console.error('[postCommandDistribute:url:error]', {
      root,
      candidate: (root && typeof root === 'object')
        ? (root.base || root.root || root.origin || root.url || null)
        : root,
      error: error?.message || error
    })
    throw new Error(`URL inválida para distribuição (root="${String((root && typeof root === 'object') ? (root.base || root.root || root.origin || root.url || '[object]') : (root || ''))}")`)
  }

  console.log('[postCommandDistribute:url]', {
    root,
    url: requestUrl
  })

  const req = new Request(requestUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify(payload || {}),
    cache: 'no-store',
    credentials: 'omit',
    signal
  })

  const res = await fetch(req)
  let data = null
  try {
    data = await res.json()
  } catch (_) {}

  if (!res.ok) {
    throw new Error(
      data?.message
      || data?.error
      || `HTTP ${res.status}`
    )
  }

  if (!data || data.ok !== true) {
    throw new Error(data?.message || 'Falha ao calcular distribuição')
  }

  return data
}
