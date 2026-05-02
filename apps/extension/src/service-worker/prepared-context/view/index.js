/// <reference types="chrome" />

const BOT_VIEW_ROOT_ID = 'go-extension-bot-view'
const BOT_VIEW_SLOT_IDS = [
  'go-extension-bot-view-slot-config',
  'go-extension-bot-view-slot-collector',
  'go-extension-bot-view-slot-planner',
  'go-extension-bot-view-slot-draft',
]
const BOT_VIEW_ICON_PATH = 'icons/ico.green.128.png'
const BOT_VIEW_HTML_PATH = 'service-worker/prepared-context/view/index.html'
const BOT_VIEW_CSS_PATH = 'service-worker/prepared-context/view/style.css'
const BOT_VIEW_MOUNT_SELECTOR = '#main_layout tbody tr.shadedBG td.maincell div'
const BOT_VIEW_STATUS_ID = 'go-extension-bot-view-status-bar'

let botViewHtmlPromise = null

function getTopTabTarget(tabId) {
  if (typeof tabId !== 'number' || !Number.isFinite(tabId)) {
    return null
  }

  return {
    tabId,
  }
}

function getSenderTarget(sender) {
  return getTopTabTarget(sender?.tab?.id)
}

async function readBotViewHtml(iconUrl) {
  if (!botViewHtmlPromise) {
    botViewHtmlPromise = fetch(chrome.runtime.getURL(BOT_VIEW_HTML_PATH))
      .then(async(response) => {
        if (!response.ok) {
          throw new Error(`Failed to load bot view html: ${response.status}`)
        }

        return await response.text()
      })
      .catch((error) => {
        botViewHtmlPromise = null
        throw error
      })
  }

  const html = await botViewHtmlPromise

  return html.replaceAll('__BOT_VIEW_ICON_URL__', iconUrl)
}

function injectBotViewIntoPage({
  html,
  mountSelector,
  rootId,
  slotIds = [],
  statusId,
  state,
}) {
  function createBotViewRoot(templateHtml) {
    const template = document.createElement('template')
    template.innerHTML = templateHtml.trim()

    return template.content.firstElementChild instanceof HTMLElement
      ? template.content.firstElementChild
      : null
  }

  function hasBotViewSlots() {
    const root = document.getElementById(rootId)

    return (
      root instanceof HTMLElement
      && Array.isArray(slotIds)
      && slotIds.every((slotId) => root.querySelector(`#${slotId}`) instanceof HTMLElement)
    )
  }

  function separateStatusBar(root) {
    if (!(root instanceof HTMLElement) || !(document.body instanceof HTMLElement)) return

    const status = root.querySelector('[data-go-bot-view-status="1"]')
    if (!(status instanceof HTMLElement)) return

    const existing = document.getElementById(statusId)
    if (existing instanceof HTMLElement && existing !== status) {
      existing.remove()
    }

    status.id = statusId
    document.body.append(status)
  }

  const mountTarget = document.querySelector(mountSelector)

  if (!(mountTarget instanceof HTMLElement)) {
    return {
      hasSlots: false,
      mutated: false,
    }
  }

  if (window.getComputedStyle(mountTarget).position === 'static') {
    mountTarget.style.position = 'relative'
  }

  let root = document.getElementById(rootId)
  let mutated = false

  if (!hasBotViewSlots()) {
    const nextRoot = createBotViewRoot(html)

    if (!(nextRoot instanceof HTMLElement)) {
      return {
        hasSlots: false,
        mutated: false,
      }
    }

    if (root instanceof HTMLElement) {
      root.remove()
    }

    mountTarget.prepend(nextRoot)
    root = nextRoot
    mutated = true
  }

  if (!(root instanceof HTMLElement)) {
    return {
      hasSlots: false,
      mutated,
    }
  }

  if (root.parentElement !== mountTarget || mountTarget.lastElementChild !== root) {
    mountTarget.append(root)
    mutated = true
  }

  root.style.position = 'absolute'
  root.style.top = '150px'
  root.style.left = '-65px'
  root.setAttribute('data-go-bot-view-state', state)
  separateStatusBar(root)

  return {
    hasSlots: hasBotViewSlots(),
    mutated,
  }
}

function removeBotViewFromPage({
  rootId,
  statusId,
}) {
  const nodes = [
    document.getElementById(rootId),
    document.getElementById(statusId),
  ].filter((node) => node instanceof HTMLElement)

  nodes.forEach((node) => node.remove())

  return {
    removed: nodes.length > 0,
  }
}

async function ensureInjectedGameBotViewForTarget(target, state = 'running') {
  if (!target) {
    return false
  }

  const iconUrl = chrome.runtime.getURL(BOT_VIEW_ICON_PATH)
  const html = await readBotViewHtml(iconUrl)
  const results = await chrome.scripting.executeScript({
    target,
    func: injectBotViewIntoPage,
    args: [{
      html,
      mountSelector: BOT_VIEW_MOUNT_SELECTOR,
      rootId: BOT_VIEW_ROOT_ID,
      slotIds: BOT_VIEW_SLOT_IDS,
      statusId: BOT_VIEW_STATUS_ID,
      state,
    }],
  })

  if (results.some((result) => result.result?.mutated === true)) {
    await chrome.scripting.insertCSS({
      target,
      files: [BOT_VIEW_CSS_PATH],
    })
  }

  return results.some((result) => result.result?.hasSlots === true)
}

async function removeInjectedGameBotViewForTarget(target) {
  if (!target) {
    return false
  }

  const results = await chrome.scripting.executeScript({
    target,
    func: removeBotViewFromPage,
    args: [{
      rootId: BOT_VIEW_ROOT_ID,
      statusId: BOT_VIEW_STATUS_ID,
    }],
  })

  const removed = results.some((result) => result.result?.removed === true)

  if (removed) {
    try {
      await chrome.scripting.removeCSS({
        target,
        files: [BOT_VIEW_CSS_PATH],
      })
    } catch (_) {}
  }

  return removed
}

export async function ensureInjectedGameBotView(sender, state = 'running') {
  return await ensureInjectedGameBotViewForTarget(getSenderTarget(sender), state)
}

export async function removeInjectedGameBotView(sender) {
  return await removeInjectedGameBotViewForTarget(getSenderTarget(sender))
}

export async function syncInjectedGameBotView(sender, {
  visible = false,
  state = 'running',
} = {}) {
  if (visible) {
    return await ensureInjectedGameBotViewForTarget(getSenderTarget(sender), state)
  }

  await removeInjectedGameBotViewForTarget(getSenderTarget(sender))
  return false
}

export async function syncInjectedGameBotViewByTabId(tabId, {
  visible = false,
  state = 'running',
} = {}) {
  const target = getTopTabTarget(tabId)

  if (visible) {
    return await ensureInjectedGameBotViewForTarget(target, state)
  }

  await removeInjectedGameBotViewForTarget(target)
  return false
}
