import { svgToDataUri } from '../go-buttons/util'
import youtubeLinkImage from '../youtube-link-image'
import { printMessage } from '../printMessage'
import './style.css'

const ICON_CLEAR_SELECTION = svgToDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<path d="M7 8.5h10v10a1.8 1.8 0 0 1-1.8 1.8H8.8A1.8 1.8 0 0 1 7 18.5z" fill="none" stroke="#111" stroke-width="2.8" stroke-linejoin="round"/>' +
    '<path d="M7 8.5h10v10a1.8 1.8 0 0 1-1.8 1.8H8.8A1.8 1.8 0 0 1 7 18.5z" fill="none" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<path d="M5.8 8.5h12.4M9.5 6.2h5" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>' +
  '</svg>'
)

const ICON_PASTE_SELECTION = svgToDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<path d="M8 6.7h8.2a1.8 1.8 0 0 1 1.8 1.8v9.7a1.8 1.8 0 0 1-1.8 1.8H8a1.8 1.8 0 0 1-1.8-1.8V8.5A1.8 1.8 0 0 1 8 6.7z" fill="none" stroke="#111" stroke-width="2.8" stroke-linejoin="round"/>' +
    '<path d="M8 6.7h8.2a1.8 1.8 0 0 1 1.8 1.8v9.7a1.8 1.8 0 0 1-1.8 1.8H8a1.8 1.8 0 0 1-1.8-1.8V8.5A1.8 1.8 0 0 1 8 6.7z" fill="none" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<path d="M9.2 4.8h5.6a1 1 0 0 1 1 1v1.4H8.2V5.8a1 1 0 0 1 1-1z" fill="none" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<path d="M10.2 10h4.4M10.2 12.9h4.4M10.2 15.8h3" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>' +
  '</svg>'
)
const DEFAULT_BOT_ICON_URL = 'https://raw.githubusercontent.com/UnrecognizedBR/public/master/icons/icon_green_60.png'

function getDefaultBotIconUrl() {
  const candidates = [
    window.ICON_48_URL,
    DEFAULT_BOT_ICON_URL
  ]
  return candidates
    .map((value) => String(value || '').trim())
    .find((url) => (
      /^https?:\/\//i.test(url)
      || /^chrome-extension:\/\//i.test(url)
      || /^moz-extension:\/\//i.test(url)
      || /^data:image\//i.test(url)
    )) || ''
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max))
}

export function createCollectorBasePopup({
  title = 'Coletor',
  count = 0,
  statusLabel = 'selecionadas:',
  container = null,
  onClose = null,
  onClear = null,
  onPaste = null,
  draggable = true
} = {}) {
  const host = container || document.body
  if (!host) return null

  let currentCount = 0
  let dragSession = null
  let isDestroyed = false

  const root = document.createElement('div')
  root.className = 'go-collector-base'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'false')
  root.innerHTML = `
    <button
      type="button"
      class="go-collector-base-close"
      data-collector-close
      data-go-title="Fechar"
      aria-label="Fechar"
    >×</button>
    <div class="go-collector-base-header" data-collector-drag-handle>
      <img class="go-collector-base-bot-icon" data-collector-bot-icon alt="BOT">
      <strong class="go-collector-base-title" data-collector-title></strong>
    </div>
    <div class="go-collector-base-toolbar" data-collector-toolbar hidden></div>
    <div class="go-collector-base-status" data-collector-status>
      <span class="go-collector-base-status-label" data-collector-status-label></span>
      <span class="go-collector-base-count-badge" data-collector-count>0</span>
      <span class="go-collector-base-spacer"></span>
      <button
        type="button"
        class="go-collector-base-action go-collector-base-paste"
        data-collector-paste
        data-go-title="Colar coordenadas"
        aria-label="Colar coordenadas da área de transferência"
      ><img src="${ICON_PASTE_SELECTION}" alt=""></button>
      <button
        type="button"
        class="go-collector-base-action go-collector-base-clear"
        data-collector-clear
        data-go-title="Limpar seleção"
        aria-label="Limpar seleção"
      ><img src="${ICON_CLEAR_SELECTION}" alt=""></button>
    </div>
    <div class="go-collector-base-body" data-collector-body hidden></div>
    <div class="go-collector-base-footer" data-collector-footer>
      <div class="go-collector-base-actions-slot" data-collector-actions-slot></div>
    </div>
  `

  const titleEl = root.querySelector('[data-collector-title]')
  const headerEl = root.querySelector('[data-collector-drag-handle]')
  const statusLabelEl = root.querySelector('[data-collector-status-label]')
  const countEl = root.querySelector('[data-collector-count]')
  const clearBtnEl = root.querySelector('[data-collector-clear]')
  const pasteBtnEl = root.querySelector('[data-collector-paste]')
  const botIconEl = root.querySelector('[data-collector-bot-icon]')
  const toolbarEl = root.querySelector('[data-collector-toolbar]')
  const bodyEl = root.querySelector('[data-collector-body]')
  const footerEl = root.querySelector('[data-collector-footer]')
  const actionsSlotEl = root.querySelector('[data-collector-actions-slot]')

  if (headerEl && titleEl) {
    const youTube = youtubeLinkImage('', (message, time) => {
      printMessage.error(message, time)
    })
    youTube.classList.add('go-collector-base-youtube-link')
    youTube.setAttribute('data-go-title', 'Abrir tutorial do coletor')
    youTube.setAttribute('data-go-brand-tooltip', '1')
    youTube.removeAttribute('title')
    youTube.setAttribute('data-collector-no-drag', '1')
    titleEl.insertAdjacentElement('afterend', youTube)
  }

  const syncSlotsVisibility = () => {
    if (toolbarEl) toolbarEl.hidden = toolbarEl.childElementCount <= 0
    if (bodyEl) bodyEl.hidden = bodyEl.childElementCount <= 0
  }

  const setTitle = (nextTitle = '') => {
    if (!titleEl) return
    titleEl.textContent = String(nextTitle || '').trim() || 'Coletor'
  }

  const setStatusLabel = (nextLabel = '') => {
    if (!statusLabelEl) return
    statusLabelEl.textContent = String(nextLabel || '').trim() || 'selecionadas:'
  }

  const setCount = (nextCount = 0) => {
    const normalized = Number.isFinite(Number(nextCount))
      ? Math.max(0, Math.floor(Number(nextCount)))
      : 0
    currentCount = normalized
    if (countEl) countEl.textContent = String(normalized)
    if (clearBtnEl) clearBtnEl.disabled = normalized <= 0
  }

  const setBotIcon = (iconUrl = '') => {
    if (!botIconEl) return
    const src = String(iconUrl || '').trim() || getDefaultBotIconUrl()
    botIconEl.setAttribute('src', src)
  }

  const open = () => {
    if (isDestroyed) return
    root.classList.add('is-open')
    try {
      root.dispatchEvent(new CustomEvent('go:collector-base:open', {
        bubbles: true,
        detail: { root }
      }))
    } catch (_) {}
  }

  const close = ({ notify = true } = {}) => {
    if (isDestroyed) return
    root.classList.remove('is-open')
    root.classList.remove('is-dragging')
    dragSession = null
    try {
      root.dispatchEvent(new CustomEvent('go:collector-base:close', {
        bubbles: true,
        detail: { root }
      }))
    } catch (_) {}
    if (notify && typeof onClose === 'function') onClose({ root, controller })
  }

  const onDragMove = (event) => {
    if (!dragSession || !draggable) return
    if (dragSession.pointerId !== event.pointerId) return

    const rect = root.getBoundingClientRect()
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8)
    const maxTop = Math.max(8, window.innerHeight - rect.height - 8)
    const nextLeft = Math.round(event.clientX - dragSession.offsetX)
    const nextTop = Math.round(event.clientY - dragSession.offsetY)

    root.style.left = `${clamp(nextLeft, 8, maxLeft)}px`
    root.style.top = `${clamp(nextTop, 8, maxTop)}px`
    root.style.transform = 'none'
  }

  const endDrag = (event) => {
    if (!dragSession) return
    if (event && dragSession.pointerId !== event.pointerId) return
    const session = dragSession
    dragSession = null
    root.classList.remove('is-dragging')
    try {
      session.handle?.releasePointerCapture?.(session.pointerId)
    } catch (_) {}
  }

  const onDragStart = (event) => {
    if (!draggable) return
    const handle = event.target?.closest?.('[data-collector-drag-handle]')
    if (!handle) return
    if (event.target?.closest?.('[data-collector-no-drag]')) return
    if (event.button !== 0) return

    const rect = root.getBoundingClientRect()
    root.style.left = `${Math.round(rect.left)}px`
    root.style.top = `${Math.round(rect.top)}px`
    root.style.transform = 'none'
    dragSession = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      handle
    }
    root.classList.add('is-dragging')
    try {
      handle.setPointerCapture?.(event.pointerId)
    } catch (_) {}
  }

  const onRootClick = async (event) => {
    const closeBtn = event.target?.closest?.('[data-collector-close]')
    if (closeBtn) {
      event.preventDefault?.()
      event.stopPropagation?.()
      close()
      return
    }

    const pasteBtn = event.target?.closest?.('[data-collector-paste]')
    if (pasteBtn) {
      event.preventDefault?.()
      event.stopPropagation?.()
      if (pasteBtn.disabled) return
      if (typeof onPaste !== 'function') return
      const result = await onPaste({ root, controller, count: currentCount, event })
      if (Number.isFinite(Number(result))) setCount(result)
      if (Number.isFinite(Number(result?.count))) setCount(result.count)
      return
    }

    const clearBtn = event.target?.closest?.('[data-collector-clear]')
    if (!clearBtn) return
    event.preventDefault?.()
    event.stopPropagation?.()
    if (clearBtn.disabled) return
    if (typeof onClear === 'function') {
      const result = await onClear({ root, controller, count: currentCount, event })
      if (Number.isFinite(Number(result))) setCount(result)
      if (Number.isFinite(Number(result?.count))) setCount(result.count)
      return
    }
    setCount(0)
  }

  const destroy = () => {
    if (isDestroyed) return
    isDestroyed = true
    document.removeEventListener('pointermove', onDragMove, true)
    document.removeEventListener('pointerup', endDrag, true)
    document.removeEventListener('pointercancel', endDrag, true)
    root.removeEventListener('pointerdown', onDragStart, true)
    root.removeEventListener('click', onRootClick, true)
    root.remove()
  }

  const controller = {
    root: () => root,
    open,
    close,
    destroy,
    setTitle,
    setStatusLabel,
    setCount,
    setBotIcon,
    getCount: () => currentCount,
    setPasteDisabled: (disabled = false) => {
      if (!pasteBtnEl) return
      pasteBtnEl.disabled = Boolean(disabled)
    },
    toolbar: () => toolbarEl,
    body: () => bodyEl,
    footer: () => footerEl,
    actionsSlot: () => actionsSlotEl,
    refreshLayout: syncSlotsVisibility
  }

  if (botIconEl) setBotIcon(getDefaultBotIconUrl())
  setTitle(title)
  setStatusLabel(statusLabel)
  setCount(count)
  if (pasteBtnEl) {
    pasteBtnEl.disabled = typeof onPaste !== 'function'
  }

  document.addEventListener('pointermove', onDragMove, true)
  document.addEventListener('pointerup', endDrag, true)
  document.addEventListener('pointercancel', endDrag, true)
  root.addEventListener('pointerdown', onDragStart, true)
  root.addEventListener('click', onRootClick, true)

  host.appendChild(root)
  syncSlotsVisibility()
  return controller
}

export default createCollectorBasePopup
