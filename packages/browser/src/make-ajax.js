function makeAjaxHeadersPost() {
  const headers = new Headers()

  headers.set('accept', 'application/json, text/javascript, */*; q=0.01')
  headers.set('tribalwars-ajax', '1')
  headers.set('x-requested-with', 'XMLHttpRequest')
  headers.set('content-type', 'application/x-www-form-urlencoded; charset=UTF-8')

  return headers
}

function makeAjaxHeadersGet() {
  const headers = new Headers()

  headers.set('accept', 'application/json, text/javascript, */*; q=0.01')
  headers.set('tribalwars-ajax', '1')
  headers.set('x-requested-with', 'XMLHttpRequest')

  return headers
}

function makeAjaxHeadersGetDoc() {
  const headers = new Headers()

  headers.set(
    'accept',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  )
  headers.set('upgrade-insecure-requests', '1')

  return headers
}

function makeAjaxBody(payload) {
  const body = new URLSearchParams()

  if (Array.isArray(payload)) {
    payload.forEach((entry) => {
      if (!Array.isArray(entry) || entry.length < 2) {
        return
      }

      const [key, value] = entry

      if (!key) {
        return
      }

      body.append(String(key), value ?? '')
    })

    return body
  }

  if (payload && typeof payload === 'object') {
    for (const [key, value] of Object.entries(payload)) {
      body.append(key, value ?? '')
    }
  }

  return body
}

module.exports = {
  makeAjaxHeadersPost,
  makeAjaxHeadersGet,
  makeAjaxHeadersGetDoc,
  makeAjaxBody,
}
