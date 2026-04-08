const { random } = require("@toolkit-tw-bot/core")
const getGameData = require("../get-game-data")

const BOT_PROTECT_DATASET_KEY = 'botProtect'

function hasSelector(html = document, selector = '') {
  return Boolean(selector && html?.querySelector?.(selector))
}

function countDivsByClass(html = document, className = '') {
  if (!className || !html?.querySelectorAll) {
    return 0
  }

  return Array.from(html.querySelectorAll('div'))
    .filter((entry) => entry.className === className)
    .length
}

function hasDivByClass(html = document, className = '') {
  return countDivsByClass(html, className) > 0
}

function dsBody(html = document) {
  return html?.querySelector?.('#ds_body') || null
}

function dsBodyStateMatches(html = document, expectedState = '') {
  const body = dsBody(html)

  if (!body?.dataset) {
    return false
  }

  return Boolean(
    body.dataset[BOT_PROTECT_DATASET_KEY]
    && body.dataset[BOT_PROTECT_DATASET_KEY].toLowerCase() === String(expectedState || '').toLowerCase()
  )
}

const ProtectingBot = {
  type: 'Bot-Protect',
  dsBody,
  screen: ['info_player', 'report', 'ally', 'settings'],
  redirect: () => {
    const ran = Math.floor(random(1, 4))
    const url = new URL(`${getGameData().link_base_pure}${ProtectingBot.screen[ran - 1]}`, window.location.origin)
    document.location.assign(url);
  },
  error() {
    return new Error('Identified bot protection', { cause: 'Protecting-Bot' })
  },
  'bot-protection-quest': {
    active(html = document) {
      return hasSelector(html, '#botprotection_quest')
        || dsBodyStateMatches(html, 'pending')
    },
  },
  'bot-protect': {
    active(html = document) {
      return hasSelector(html, '#bot_check .btn')
        || dsBodyStateMatches(html, 'throttled')
    },
  },
  'hCaptcha-in-page': {
    active(html = document) {
      const captcha = html?.querySelector?.('#bot_check .captcha')

      if (captcha?.innerHTML) {
        return true
      }

      if (hasSelector(html, '#popup_box_bot_protection > div > div > iframe')) {
        return true
      }

      if (!html?.querySelectorAll) {
        return false
      }

      return Array.from(html.querySelectorAll('div'))
        .some((entry) => String(entry.className || '').toLowerCase() === 'hcaptcha')
    },
  },
  'hCaptcha-in-popup': {
    active(html = document) {
      return hasSelector(html, '#popup_box_bot_protection > div > div > iframe')
    },
  },
  'bot-protect-all-in-game': {
    active(html = document, win = typeof window !== 'undefined' ? window : undefined) {
      const forced = html?.all
        ? Array.from(html.all).filter((entry) => (
          entry.className === 'no-selection'
          || typeof entry.className === 'object'
        ))
        : []

      if (hasSelector(html, '#botprotection_quest')) {
        return true
      }

      if (hasSelector(html, '#bot_check .btn')) {
        return true
      }

      if (hasDivByClass(html, 'captcha')) {
        return true
      }

      if (hasSelector(html, '#popup_box_bot_protection > div > div > iframe')) {
        return true
      }

      if (html?.querySelectorAll?.('.bot-protection-row')?.length) {
        return true
      }

      if (win?.hcaptcha) {
        return true
      }

      if (forced.length) {
        return true
      }

      const body = dsBody(html)

      if (!body) {
        return true
      }

      if (body.dataset && body.dataset[BOT_PROTECT_DATASET_KEY]) {
        return true
      }

      return false
    },
  },
}

module.exports = ProtectingBot
