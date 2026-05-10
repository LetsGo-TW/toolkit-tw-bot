import { extensionId } from '@toolkit-tw-bot/release'

const DEFAULT_BOT_ICON_URL = `chrome-extension://${extensionId}/icons/ico.green.128.png`

let plannerOneToManyModulePromise = null

export async function loadPlannerOneToMany() {
  if (!plannerOneToManyModulePromise) {
    plannerOneToManyModulePromise = import('../planner').then((module) => module?.plannerOneToMany)
  }
  const plannerOneToMany = await plannerOneToManyModulePromise
  if (typeof plannerOneToMany !== 'function') {
    throw new Error('[GO][Planner] plannerOneToMany not available')
  }
  return plannerOneToMany
}

export function getBotTooltipIconUrl() {
  const candidates = [
    window.ICON_48_URL,
    DEFAULT_BOT_ICON_URL
  ]

  return candidates
    .map((value) => String(value || '').trim())
    .find((url) => (
      /^https?:\/\//i.test(url) ||
      /^chrome-extension:\/\//i.test(url) ||
      /^moz-extension:\/\//i.test(url) ||
      /^data:image\//i.test(url)
    )) || ''
}

export function renderTooltipIconText(iconUrl, text) {
  const safeText = String(text || '').trim()
  if (!safeText) return null
  if (!iconUrl) return safeText
  return `
    <div style="display:flex;align-items:center;gap:6px;">
      <span style="
        width:16px;
        height:16px;
        border-radius:999px;
        display:inline-block;
        flex:0 0 auto;
        background-image:url('${iconUrl}');
        background-position:center;
        background-repeat:no-repeat;
        background-size:contain;
      "></span>
      <span>${safeText}</span>
    </div>
  `
}

export function stopAll(event) {
  event?.preventDefault?.()
  event?.stopPropagation?.()
  if (typeof event?.stopImmediatePropagation === 'function') {
    event.stopImmediatePropagation()
  }
  return false
}

export function parseParam(href, key) {
  if (!href) return null
  const re = new RegExp(`[?&]${key}=(\\d+)`)
  const match = String(href).match(re)
  return match ? Number(match[1]) : null
}
