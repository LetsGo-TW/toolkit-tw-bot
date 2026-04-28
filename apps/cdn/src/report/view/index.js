import './index.css'
import renderCallReportView from './call'
import renderOfferReportView from './offer'
import renderPullReportView from './pull'
import renderHCaptchaReportView from './hcaptcha'
import { extensionId } from '@toolkit-tw-bot/release'

const DEFAULT_BOT_ICON_URL = `chrome-extension://${extensionId}/icons/ico.green.128.png`;
const reportViewHtml = `
<div
  class="go-report-popup"
  data-go-report-popup
  role="dialog"
  aria-modal="false"
  aria-label="Relatorios"
>
  <div class="go-report-popup-header" data-go-report-drag-handle>
    <img class="go-report-popup-icon" data-go-report-icon alt="BOT" />
    <strong class="go-report-popup-title" data-go-report-title>Relatorios</strong>
    <button
      type="button"
      class="go-report-popup-close"
      data-go-report-close
      aria-label="Fechar"
      title="Fechar"
    >×</button>
  </div>

  <div class="go-report-popup-body" data-go-report-body>
    <div class="go-report-popup-empty">
      Base da view de relatorios.
    </div>
  </div>
</div>
`

const clamp = (value, min, max) => Math.max(min, Math.min(value, max))

const normalizeReportType = (value = '') => String(value || '').trim().toLowerCase()

const REPORT_VIEW_RENDERERS = {
  call: renderCallReportView,
  offer: renderOfferReportView,
  pull: renderPullReportView,
  hcaptcha: renderHCaptchaReportView
}

const getBotIconUrl = () => {
  const candidates = [window.ICON_48_URL, DEFAULT_BOT_ICON_URL]
  return candidates
    .map((value) => String(value || '').trim())
    .find((url) => (
      /^https?:\/\//i.test(url)
      || /^chrome-extension:\/\//i.test(url)
      || /^moz-extension:\/\//i.test(url)
      || /^data:image\//i.test(url)
    )) || DEFAULT_BOT_ICON_URL
}

const createPopupFromTemplate = () => {
  const template = document.createElement('template')
  template.innerHTML = String(reportViewHtml || '').trim()
  const root = template.content.firstElementChild
  return root instanceof HTMLElement ? root : null
}

export function createReportView({
  container = document.body,
  title = 'Relatorios',
  icon = '',
  reportType = '',
  startOpen = false
} = {}) {
  if (!container) return null

  const root = createPopupFromTemplate()
  if (!root) return null

  const headerEl = root.querySelector('[data-go-report-drag-handle]')
  const iconEl = root.querySelector('[data-go-report-icon]')
  const titleEl = root.querySelector('[data-go-report-title]')
  const bodyEl = root.querySelector('[data-go-report-body]')

  let dragSession = null
  let isDestroyed = false
  let currentReportType = normalizeReportType(reportType)

  const setTitle = (nextTitle = '') => {
    if (!titleEl) return
    titleEl.textContent = String(nextTitle || '').trim() || 'Relatorios'
  }

  const setIcon = (nextIcon = '') => {
    if (!iconEl) return
    const iconSrc = String(nextIcon || '').trim() || getBotIconUrl()
    iconEl.setAttribute('src', iconSrc)
  }

  const open = () => {
    if (isDestroyed) return
    renderCurrentReport()
    root.classList.add('is-open')
  }

  const close = () => {
    if (isDestroyed) return
    root.classList.remove('is-open')
    root.classList.remove('is-dragging')
    dragSession = null
  }

  const toggle = () => {
    if (root.classList.contains('is-open')) close()
    else open()
  }

  const renderDefaultBody = () => {
    if (!(bodyEl instanceof HTMLElement)) return
    bodyEl.innerHTML = '<div class="go-report-popup-empty">Base da view de relatorios.</div>'
  }

  const renderLoadingBody = () => {
    if (!(bodyEl instanceof HTMLElement)) return
    bodyEl.innerHTML = '<div class="go-report-popup-empty">Carregando relatorios...</div>'
  }

  const renderCurrentReport = () => {
    if (!(bodyEl instanceof HTMLElement)) return

    const renderer = REPORT_VIEW_RENDERERS[currentReportType]
    if (typeof renderer !== 'function') {
      renderDefaultBody()
      return
    }

    const renderId = String(Date.now() + Math.random())
    bodyEl.dataset.goReportRenderId = renderId
    renderLoadingBody()

    Promise.resolve(renderer({ mountEl: bodyEl, renderId }))
      .catch(() => {
        if (!(bodyEl instanceof HTMLElement)) return
        if (bodyEl.dataset.goReportRenderId !== renderId) return
        renderDefaultBody()
      })
  }

  const setReportType = (nextType = '') => {
    currentReportType = normalizeReportType(nextType)
    renderCurrentReport()
  }

  const onPointerMove = (event) => {
    if (!dragSession) return
    if (event.pointerId !== dragSession.pointerId) return

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
    if (event && event.pointerId !== dragSession.pointerId) return

    const session = dragSession
    dragSession = null
    root.classList.remove('is-dragging')

    try {
      session.handle?.releasePointerCapture?.(session.pointerId)
    } catch {}
  }

  const onPointerDown = (event) => {
    if (event.button !== 0) return
    const handle = event.target?.closest?.('[data-go-report-drag-handle]')
    if (!handle || !headerEl) return
    if (event.target?.closest?.('[data-go-report-close]')) return

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
    } catch {}

    event.preventDefault()
  }

  const onClick = (event) => {
    const closeBtn = event.target?.closest?.('[data-go-report-close]')
    if (!closeBtn) return
    event.preventDefault()
    close()
  }

  const onEsc = (event) => {
    if (!root.classList.contains('is-open')) return
    const isEsc = event.key === 'Escape' || event.key === 'Esc' || event.keyCode === 27
    if (!isEsc) return
    close()
  }

  root.addEventListener('pointerdown', onPointerDown)
  root.addEventListener('click', onClick)
  window.addEventListener('pointermove', onPointerMove, true)
  window.addEventListener('pointerup', endDrag, true)
  window.addEventListener('pointercancel', endDrag, true)
  window.addEventListener('keydown', onEsc, true)

  setTitle(title)
  setIcon(icon)
  container.appendChild(root)
  renderCurrentReport()

  if (startOpen) open()

  const destroy = () => {
    if (isDestroyed) return
    isDestroyed = true

    window.removeEventListener('pointermove', onPointerMove, true)
    window.removeEventListener('pointerup', endDrag, true)
    window.removeEventListener('pointercancel', endDrag, true)
    window.removeEventListener('keydown', onEsc, true)

    root.removeEventListener('pointerdown', onPointerDown)
    root.removeEventListener('click', onClick)
    root.remove()
  }

  return {
    root: () => root,
    open,
    close,
    toggle,
    setReportType,
    setTitle,
    setIcon,
    destroy
  }
}

export default createReportView
