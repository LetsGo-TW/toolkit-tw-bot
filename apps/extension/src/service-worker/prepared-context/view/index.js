/// <reference types="chrome" />

const BOT_VIEW_ROOT_ID = 'go-extension-bot-view'
const BOT_VIEW_SLOT_PRIMARY_ID = 'go-extension-bot-view-slot-primary'
const BOT_VIEW_SLOT_SECONDARY_ID = 'go-extension-bot-view-slot-secondary'
const BOT_VIEW_ICON_PATH = 'icons/ico.green.128.png'
const BOT_VIEW_HTML_PATH = 'service-worker/prepared-context/view/index.html'
const BOT_VIEW_CSS_PATH = 'service-worker/prepared-context/view/style.css'
const BOT_VIEW_MOUNT_SELECTOR = '#main_layout tbody tr.shadedBG td.maincell div'
const BOT_VIEW_STATUS_ID = 'go-extension-bot-view-status-bar'
const BOT_VIEW_TOOLTIP_ID = 'go-extension-bot-view-tooltip-popup'

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
  slotPrimaryId,
  slotSecondaryId,
  statusId,
  tooltipId,
  state,
}) {
  const TOOLTIP_TARGET_SELECTOR = '[data-go-bot-view-tooltip], [aria-label], [title]'
  const TOOLTIP_POPUP_SELECTOR = '[data-go-bot-view-tooltip-popup="1"]'

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
      && root.querySelector(`#${slotPrimaryId}`) instanceof HTMLElement
      && root.querySelector(`#${slotSecondaryId}`) instanceof HTMLElement
    )
  }

  function resolveTooltipTarget(node, root) {
    if (!(root instanceof HTMLElement) || !(node instanceof Element)) return null
    const target = node.closest(TOOLTIP_TARGET_SELECTOR)
    if (!(target instanceof HTMLElement) || !root.contains(target)) return null
    if (target.getAttribute('data-go-bot-view-tooltip-disabled') === '1') return null
    return target
  }

  function resolveTooltipText(target) {
    if (!(target instanceof HTMLElement)) return ''

    const dataText = String(target.getAttribute('data-go-bot-view-tooltip') || '').trim()
    if (dataText) return dataText

    const ariaText = String(target.getAttribute('aria-label') || '').trim()
    if (ariaText) return ariaText

    const titleText = String(target.getAttribute('title') || '').trim()
    if (titleText) {
      target.setAttribute('data-go-bot-view-tooltip', titleText)
      target.removeAttribute('title')
      return titleText
    }

    return ''
  }

  function getTooltipPopup(root) {
    const detachedPopup = document.getElementById(tooltipId)
    if (detachedPopup instanceof HTMLElement) {
      return detachedPopup
    }

    return root.querySelector(TOOLTIP_POPUP_SELECTOR) instanceof HTMLElement
      ? root.querySelector(TOOLTIP_POPUP_SELECTOR)
      : null
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

  function separateTooltipPopup(root) {
    if (!(root instanceof HTMLElement) || !(document.body instanceof HTMLElement)) return

    const popup = root.querySelector(TOOLTIP_POPUP_SELECTOR)
    if (!(popup instanceof HTMLElement)) return

    const existing = document.getElementById(tooltipId)
    if (existing instanceof HTMLElement && existing !== popup) {
      existing.remove()
    }

    popup.id = tooltipId
    document.body.append(popup)
  }

  function hideTooltip(root) {
    const popup = getTooltipPopup(root)
    if (!(popup instanceof HTMLElement)) return
    popup.hidden = true
    popup.textContent = ''
    delete root.dataset.goBotViewTooltipTarget
  }

  function showTooltip(root, target) {
    const popup = getTooltipPopup(root)
    if (!(root instanceof HTMLElement) || !(popup instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      return
    }

    const text = resolveTooltipText(target)
    if (!text) {
      hideTooltip(root)
      return
    }

    const targetRect = target.getBoundingClientRect()

    popup.textContent = text
    popup.hidden = false
    popup.style.top = '0px'
    popup.style.left = '0px'

    const popupRect = popup.getBoundingClientRect()
    const margin = 6
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
    const centeredTop = targetRect.top + (targetRect.height / 2) - (popupRect.height / 2)
    const maxTop = Math.max(4, viewportHeight - popupRect.height - 4)
    const top = Math.min(Math.max(centeredTop, 4), maxTop)

    let left = targetRect.right + margin
    if (left + popupRect.width > viewportWidth - 4) {
      left = Math.max(4, targetRect.left - popupRect.width - margin)
    }

    popup.style.top = `${Math.round(top)}px`
    popup.style.left = `${Math.round(left)}px`
    root.dataset.goBotViewTooltipTarget = text
  }

  function bindTooltip(root) {
    if (!(root instanceof HTMLElement) || root.dataset.goBotViewTooltipBound === '1') return

    root.addEventListener('pointerover', (event) => {
      const target = resolveTooltipTarget(event.target, root)
      if (!(target instanceof HTMLElement)) return
      showTooltip(root, target)
    }, true)

    root.addEventListener('pointerout', (event) => {
      const fromTarget = resolveTooltipTarget(event.target, root)
      const toTarget = resolveTooltipTarget(event.relatedTarget, root)
      if (!(fromTarget instanceof HTMLElement) || fromTarget === toTarget) return
      hideTooltip(root)
    }, true)

    root.addEventListener('focusin', (event) => {
      const target = resolveTooltipTarget(event.target, root)
      if (!(target instanceof HTMLElement)) return
      showTooltip(root, target)
    }, true)

    root.addEventListener('focusout', (event) => {
      const nextTarget = resolveTooltipTarget(event.relatedTarget, root)
      if (nextTarget instanceof HTMLElement) {
        showTooltip(root, nextTarget)
        return
      }
      hideTooltip(root)
    }, true)

    root.dataset.goBotViewTooltipBound = '1'
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
  separateTooltipPopup(root)
  bindTooltip(root)

  return {
    hasSlots: hasBotViewSlots(),
    mutated,
  }
}

function removeBotViewFromPage({
  rootId,
  statusId,
  tooltipId,
}) {
  const nodes = [
    document.getElementById(rootId),
    document.getElementById(statusId),
    document.getElementById(tooltipId),
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
      slotPrimaryId: BOT_VIEW_SLOT_PRIMARY_ID,
      slotSecondaryId: BOT_VIEW_SLOT_SECONDARY_ID,
      statusId: BOT_VIEW_STATUS_ID,
      tooltipId: BOT_VIEW_TOOLTIP_ID,
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
      tooltipId: BOT_VIEW_TOOLTIP_ID,
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
