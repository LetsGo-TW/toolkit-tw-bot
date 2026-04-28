import './button.css'

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeSafeIconUrl(value = '') {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^chrome-extension:\/\/invalid\/?/i.test(url)) return ''
  if (/^chrome-extension:\/\/[a-p]{32}\//i.test(url)) return url
  if (/^https?:\/\//i.test(url)) return url
  if (/^data:image\//i.test(url)) return url
  return ''
}

export function createTargetsDraftButton(container, {
  onAction = () => {},
  variant = 'chip'
} = {}) {
  if (!container) return null

  let root = null
  let chipEl = null
  let menuEl = null
  let isOpen = false

  const positionMenuWithinViewport = () => {
    if (!root || !menuEl || menuEl.hidden) return

    const margin = 6
    const viewportWidth = window.visualViewport?.width || window.innerWidth
    const viewportHeight = window.visualViewport?.height || window.innerHeight
    const viewportMaxWidth = Math.max(140, viewportWidth - margin * 2)
    const viewportMaxHeight = Math.max(80, viewportHeight - margin * 2)
    const rootRect = root.getBoundingClientRect()

    menuEl.classList.remove('is-open-upward')
    menuEl.style.left = ''
    menuEl.style.right = ''
    menuEl.style.top = ''
    menuEl.style.bottom = ''
    menuEl.style.maxWidth = `${viewportMaxWidth}px`
    menuEl.style.maxHeight = `${viewportMaxHeight}px`

    const menuRect = menuEl.getBoundingClientRect()
    let nextLeft = rootRect.width - menuRect.width
    let shouldOpenUpward = false

    if (rootRect.left + nextLeft < margin) {
      nextLeft = margin - rootRect.left
    }
    if (rootRect.left + nextLeft + menuRect.width > viewportWidth - margin) {
      nextLeft = viewportWidth - margin - rootRect.left - menuRect.width
    }
    if (menuRect.bottom > viewportHeight - margin) {
      const spaceAbove = rootRect.top - margin
      const spaceBelow = viewportHeight - rootRect.bottom - margin
      if (spaceAbove > spaceBelow) {
        shouldOpenUpward = true
      }
    }

    menuEl.style.left = `${Math.round(nextLeft)}px`
    menuEl.style.right = 'auto'
    if (shouldOpenUpward) {
      menuEl.classList.add('is-open-upward')
      menuEl.style.top = 'auto'
      menuEl.style.bottom = 'calc(100% + 4px)'
    }
  }

  const closeMenu = () => {
    isOpen = false
    if (!root) return
    root.classList.remove('is-open')
    if (menuEl) menuEl.hidden = true
  }

  const openMenu = () => {
    isOpen = true
    if (!root) return
    root.classList.add('is-open')
    if (menuEl) {
      menuEl.hidden = false
      requestAnimationFrame(positionMenuWithinViewport)
    }
  }

  const toggleMenu = () => {
    if (isOpen) closeMenu()
    else openMenu()
  }

  const ensure = () => {
    // Reuse even when the parent container is still detached from DOM
    // (common during composition before final insert), otherwise we duplicate
    // the draft button and leave one instance uninitialized/empty.
    if (root && (root.isConnected || container.contains(root))) return root
    root = document.createElement('div')
    root.className = `go-planner-targets-draft ${variant === 'icon-button' ? 'is-icon-button' : 'is-chip'}`
    root.setAttribute('data-planner-targets-draft', '1')
    root.innerHTML = `
      <button type="button" class="go-planner-targets-draft-chip" data-planner-targets-draft-toggle>${variant === 'icon-button' ? '<span class="go-planner-targets-draft-icon-wrap"><img alt="" data-planner-targets-draft-icon></span>' : 'Rascunho'}</button>
      <div class="go-planner-targets-draft-menu" data-planner-targets-draft-menu hidden></div>
    `
    chipEl = root.querySelector('[data-planner-targets-draft-toggle]')
    menuEl = root.querySelector('[data-planner-targets-draft-menu]')
    chipEl?.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (root.hidden) return
      toggleMenu()
    })
    menuEl?.addEventListener('click', (event) => {
      const button = event.target?.closest?.('[data-draft-action]')
      if (!button) return
      event.preventDefault()
      event.stopPropagation()
      const action = String(button.getAttribute('data-draft-action') || '').trim()
      if (!action) return
      const result = onAction?.(action, {
        event,
        root,
        menuEl,
        actionButton: button
      })
      if (result === false) return
      closeMenu()
    })
    document.addEventListener('click', onDocumentClick, true)
    container.insertAdjacentElement('beforeend', root)
    return root
  }

  const onDocumentClick = (event) => {
    if (!root?.isConnected) return
    if (event.target?.closest?.('[data-planner-targets-draft]')) return
    closeMenu()
  }

  const refresh = ({
    visible = false,
    label = 'Rascunho',
    title = '',
    goTitle = '',
    brandTooltip = false,
    warning = false,
    pending = false,
    iconUri = '',
    iconFallbackUri = '',
    iconMode = '',
    iconAlt = 'Rascunho',
    actions = []
  } = {}) => {
    ensure()
    if (!root) return
    root.hidden = !visible
    if (!visible) {
      closeMenu()
      return
    }
    if (chipEl) {
      if (variant === 'icon-button') {
        chipEl.classList.add('go-btn-inline', 'go-btn-inline-draft')
        const iconImg = chipEl.querySelector('[data-planner-targets-draft-icon]')
        const modeKind = String(iconMode || '')
        chipEl.classList.toggle('is-mode-list', modeKind === 'list')
        chipEl.classList.toggle('is-mode-schedule', modeKind === 'schedule')
        chipEl.classList.toggle('is-mode-send', modeKind !== 'schedule' && modeKind !== 'list')
        if (iconImg) {
          const primarySrc = normalizeSafeIconUrl(iconUri)
          const fallbackSrc = normalizeSafeIconUrl(iconFallbackUri)
          iconImg.onerror = () => {
            if (!fallbackSrc) return
            if (iconImg.getAttribute('src') === fallbackSrc) return
            iconImg.setAttribute('src', fallbackSrc)
          }
          if (primarySrc) {
            iconImg.setAttribute('src', primarySrc)
          } else if (fallbackSrc) {
            iconImg.setAttribute('src', fallbackSrc)
          } else {
            iconImg.removeAttribute('src')
          }
          iconImg.setAttribute('alt', String(iconAlt || 'Rascunho'))
        }
        chipEl.setAttribute('aria-label', String(label || iconAlt || 'Rascunho'))
      } else {
        chipEl.textContent = String(label || 'Rascunho')
      }
      chipEl.classList.toggle('is-warning', Boolean(warning))
      chipEl.classList.toggle('is-pending', Boolean(pending))
      if (title) chipEl.setAttribute('data-title', String(title))
      else chipEl.removeAttribute('data-title')
      if (goTitle) chipEl.setAttribute('data-go-title', String(goTitle))
      else chipEl.removeAttribute('data-go-title')
      if (brandTooltip) chipEl.setAttribute('data-go-brand-tooltip', '1')
      else chipEl.removeAttribute('data-go-brand-tooltip')
    }
    if (menuEl) {
      const list = Array.isArray(actions) ? actions : []
      menuEl.innerHTML = list.map((item) => {
        if (String(item?.kind || '') === 'input') {
          const inputKey = String(item?.inputKey || '').trim()
          if (!inputKey) return ''
          const value = String(item?.value ?? '')
          const placeholder = String(item?.placeholder || '').trim()
          const title = String(item?.title || '').trim()
          return `
            <div class="go-planner-targets-draft-menu-input-row">
              <input
                type="text"
                class="go-planner-targets-draft-menu-input"
                data-draft-input="${escapeHtml(inputKey)}"
                value="${escapeHtml(value)}"
                ${placeholder ? `placeholder="${escapeHtml(placeholder)}"` : ''}
                ${title ? `data-title="${escapeHtml(title)}"` : ''}
                maxlength="80"
                autocomplete="off"
                spellcheck="false"
              >
            </div>
          `
        }
        const id = String(item?.id || '').trim()
        const itemLabel = String(item?.label || id).trim()
        if (!id) return ''
        const iconUri = normalizeSafeIconUrl(item?.iconUri)
        const titleAttr = String(item?.title || '').trim()
        const secondaryId = String(item?.secondaryId || '').trim()
        const secondaryLabel = String(item?.secondaryLabel || 'Excluir').trim()
        const secondaryTitle = String(item?.secondaryTitle || '').trim()
        const rowClass = item?.danger ? ' is-danger' : (item?.primary ? ' is-primary' : '')
        const mainButtonHtml = `
          <button type="button" class="go-planner-targets-draft-menu-btn${rowClass}" data-draft-action="${escapeHtml(id)}"${titleAttr ? ` data-title="${escapeHtml(titleAttr)}"` : ''}>
            ${iconUri ? `<span class="go-planner-targets-draft-menu-icon"><img alt="" src="${escapeHtml(iconUri)}"></span>` : ''}
            <span class="go-planner-targets-draft-menu-label">${escapeHtml(itemLabel)}</span>
          </button>
        `
        if (!secondaryId) return mainButtonHtml
        const secondaryClass = item?.secondaryDanger ? ' is-danger' : (item?.secondaryPrimary ? ' is-primary' : '')
        return `
          <div class="go-planner-targets-draft-menu-row">
            ${mainButtonHtml}
            <button type="button" class="go-planner-targets-draft-menu-btn is-secondary${secondaryClass}" data-draft-action="${escapeHtml(secondaryId)}"${secondaryTitle ? ` data-title="${escapeHtml(secondaryTitle)}"` : ''}>
              <span class="go-planner-targets-draft-menu-label">${escapeHtml(secondaryLabel)}</span>
            </button>
          </div>
        `
      }).join('')
      if (!menuEl.childElementCount) closeMenu()
    }
  }

  const destroy = () => {
    document.removeEventListener('click', onDocumentClick, true)
    root?.remove()
    root = null
    chipEl = null
    menuEl = null
    isOpen = false
  }

  ensure()

  return {
    root: () => root,
    refresh,
    closeMenu,
    openMenu,
    destroy
  }
}
