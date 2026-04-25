const { nDateTime } = require('@toolkit-tw-bot/core')
const ProtectingBot = require('./protecting-bot')
const { dateServer } = require('./date-tw')

const I18N = {
  ro: {
    monthLiteral: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'ago', 'sep', 'out', 'nov', 'dec'],
    today: 'astăzi la ora',
    tomorrow: 'mâine',
    yesterday: 'leri',
  },
  en: {
    monthLiteral: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'ago', 'sep', 'out', 'nov', 'dec'],
    today: 'today',
    tomorrow: 'tomorrow',
    yesterday: 'yesterday',
  },
  us: {
    monthLiteral: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'ago', 'sep', 'out', 'nov', 'dec'],
    today: 'today',
    tomorrow: 'tomorrow',
    yesterday: 'yesterday',
  },
  uk: {
    monthLiteral: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'ago', 'sep', 'out', 'nov', 'dec'],
    today: 'today',
    tomorrow: 'tomorrow',
    yesterday: 'yesterday',
  },
  br: {
    monthLiteral: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
    today: 'hoje',
    tomorrow: 'amanhã',
    yesterday: 'ontem',
  },
  pt: {
    monthLiteral: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
    today: 'hoje',
    tomorrow: 'amanhã',
    yesterday: 'ontem',
  },
  it: {
    monthLiteral: ['gen', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'set', 'oct', 'nov', 'dec'],
    today: 'oggi',
    tomorrow: 'domani',
    yesterday: 'leri',
  },
}

function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function blockedRequestActive(html = document) {
  return html.querySelector('#error > div.center > div.content.box-border.red > div.inner > div.full-content')
    || (
      !html.querySelector('#home > div.center > div.content.box-border.red > div.inner > div.right.login > div.wrap')
      && !html.querySelector('#contentContainer')
    )
}

function gameUpdateActive(html = document) {
  return html.querySelector('#error') ? true : false
}

function extractTwSpecialMessage(html = document) {
  const selectors = [
    '#error > div.center > div.content.box-border.red > div.inner > div.full-content',
    '#error .full-content',
    '#error .inner',
    '#content_value div.error_box',
    'div.error_box',
  ]

  for (const selector of selectors) {
    const text = normalizeText(html?.querySelector?.(selector)?.textContent || '')

    if (text) {
      return text
    }
  }

  const fallback = normalizeText(
    html?.querySelector?.('#error')?.textContent
    || html?.body?.textContent
    || '',
  )

  if (!fallback) {
    return null
  }

  return fallback.slice(0, 240)
}

function assertNoCaptchaInGame(html = document, context = 'request') {
  if (!ProtectingBot['bot-protect-all-in-game'].active(html)) return
  const error = ProtectingBot.error()
  error.cause = error.cause || 'Protecting-Bot'
  error.goContext = context
  throw error
}

function assertNoGameUpdateOrBlockedRequest(
  html = document,
  {
    context = 'request',
  } = {},
) {
  const isGameUpdate = gameUpdateActive(html)
  const isBlockedRequest = blockedRequestActive(html)

  if (!isGameUpdate && !isBlockedRequest) return

  const fallbackMessage = isGameUpdate
    ? 'Tribal Wars retornou uma tela de atualização do jogo.'
    : 'Tribal Wars retornou uma tela de solicitação bloqueada.'

  const error = new Error(extractTwSpecialMessage(html) || fallbackMessage)
  error.cause = isGameUpdate ? 'GameUpdate' : 'BlockedRequest'
  error.goContext = context
  throw error
}

function normalizeDateTwString(value = '', { host = null, doc = document } = {}) {
  const twServer = String(host || globalThis?.window?.location?.host || '')
    .split('.')[0]
    ?.match(/^[a-z]{2}/i)?.[0]?.toLowerCase() || null
  const locale = twServer ? I18N[twServer] : null
  const strDate = String(value || '').trim().toLowerCase()
  const currentDate = dateServer(doc)

  if (!locale || !strDate || typeof currentDate !== 'string') return null

  if (strDate.indexOf(locale.today.toLowerCase()) !== -1) {
    return currentDate || null
  }

  if (strDate.indexOf(locale.tomorrow.toLowerCase()) !== -1) {
    return new Date(nDateTime(currentDate) + (1000 * 60 * 60 * 24)).toLocaleDateString('pt-BR')
  }

  if (strDate.indexOf(locale.yesterday.toLowerCase()) !== -1) {
    return new Date(nDateTime(currentDate) - (1000 * 60 * 60 * 24)).toLocaleDateString('pt-BR')
  }

  const numericMatch = strDate.match(/[0-9]{1,2}[.|/][0-9]{1,2}[.|/][0-9]{0,4}/i)

  if (numericMatch) {
    const arrDate = numericMatch[0].split(/[.|/]/)
    const monthNow = new Date(nDateTime(currentDate)).getMonth()
    const yearNow = new Date(nDateTime(currentDate)).getFullYear()

    if (!arrDate[2]) {
      arrDate[2] = Number(arrDate[1]) < monthNow ? yearNow + 1 : yearNow
    }

    const normalized = new Date(`${arrDate[1]}.${arrDate[0]}.${arrDate[2]}`).toLocaleDateString('pt-BR')

    return normalized !== 'Invalid Date'
      ? normalized
      : null
  }

  const monthMatch = strDate.match(/[a-z]{3}/i)
  if (!monthMatch) return null

  const ind = locale.monthLiteral.indexOf(monthMatch[0])
  if (ind === -1) return null

  const translatedDate = new Date(
    strDate.replace(locale.monthLiteral[ind].toLowerCase(), I18N.en.monthLiteral[ind]),
  ).toLocaleDateString('pt-BR')

  if (translatedDate !== 'Invalid Date') {
    return translatedDate
  }

  const dayMatch = strDate.match(/[0-9]{1,2}/i)
  const yearMatch = strDate.match(/[0-9]{2,4}$/i)

  if (!dayMatch || !yearMatch) return null

  return new Date(`${String(ind + 1).length > 1
    ? String(ind + 1)
    : `0${String(ind + 1)}`}.${dayMatch[0]}.${yearMatch[0]}`).toLocaleDateString('pt-BR')
}

module.exports = {
  normalizeText,
  blockedRequestActive,
  gameUpdateActive,
  extractTwSpecialMessage,
  assertNoCaptchaInGame,
  assertNoGameUpdateOrBlockedRequest,
  normalizeDateTwString,
}
