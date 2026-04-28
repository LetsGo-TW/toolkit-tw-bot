function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

let activeBoxState = null

function closeActiveBox() {
  if (!activeBoxState) return
  const { warn, prevStyle, prevHtml } = activeBoxState
  if (warn) {
    warn.style.cssText = prevStyle || ''
    warn.innerHTML = prevHtml || ''
    warn.removeAttribute('data-go-unexpected-recovery')
  }
  activeBoxState = null
}

function buildWarningHtml({ distributedCount = 0, missingCount = 0 } = {}) {
  return `
    <div class="content" style="
      margin: 3px 3px 3px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
      flex-wrap: wrap;
    ">
      <div style="line-height: 1.35;">
        Let's GO!<br>
        Error: O último envio foi interrompido inesperadamente.<br>
        Distribuídos: ${escapeHtml(distributedCount)} | Não enviados: ${escapeHtml(missingCount)}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="btn" data-go-recovery-open>Abrir último envio</button>
        <button type="button" class="btn btn-default" data-go-recovery-dismiss>Não mostrar novamente</button>
      </div>
    </div>
  `
}

function renderUnexpectedInterruptionWarning({
  state = null,
  onOpen = null,
  onDismiss = null
} = {}) {
  const warn = document.querySelector('#script_warning')
  if (!warn || !state) return null

  closeActiveBox()

  const distributedCount = Math.max(0, Math.floor(Number(state?.distributedCount) || 0))
  const missingCount = Math.max(0, Math.floor(Number(state?.missingCount) || 0))
  const prevStyle = warn.style.cssText || ''
  const prevHtml = warn.innerHTML || ''

  warn.style.cssText = 'display: flex; color: red;'
  warn.setAttribute('data-go-unexpected-recovery', '1')
  warn.innerHTML = buildWarningHtml({ distributedCount, missingCount })

  const handleOpen = () => {
    closeActiveBox()
    onOpen?.(state)
  }
  const handleDismiss = () => {
    closeActiveBox()
    onDismiss?.(state)
  }

  warn.querySelector('[data-go-recovery-open]')?.addEventListener('click', handleOpen)
  warn.querySelector('[data-go-recovery-dismiss]')?.addEventListener('click', handleDismiss)

  activeBoxState = {
    warn,
    prevStyle,
    prevHtml
  }

  return {
    close: closeActiveBox
  }
}

export function showUnexpectedInterruptionInfoBox({
  state = null,
  onOpen = null,
  onDismiss = null
} = {}) {
  if (!state) return null
  if (document.readyState === 'loading') {
    const handleReady = () => {
      document.removeEventListener('DOMContentLoaded', handleReady)
      renderUnexpectedInterruptionWarning({ state, onOpen, onDismiss })
    }
    document.addEventListener('DOMContentLoaded', handleReady)
    return {
      close: closeActiveBox
    }
  }
  return renderUnexpectedInterruptionWarning({ state, onOpen, onDismiss })
}
