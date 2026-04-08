import './index.css'

export function createDropdown({
  btn,
  menu,
  matchSelector = '[data-dd-item]',
  onSelect,
  onOpen,
  onClose,
  closeOnOutside = true,
  toggleOnButtonClick = true,
} = {}) {
  if (!btn || !menu) return null

  function onClickBtn(e) {
    e.preventDefault()
    e.stopPropagation()
    toggle()
  }

  function onClickMenu(e) {
    const item = e.target.closest(matchSelector)
    if (!item) return
    onSelect?.(item, e)
  }

  function onClickOut(e) {
    if (menu.hidden) return
    if (!e.isTrusted) return
    const t = e.target
    if (menu.contains(t) || btn.contains(t)) return
    close()
  }

  let originalParent = null
  let originalNext = null
  let isPortaled = false

  function adjustToViewport() {
    const rect = menu.getBoundingClientRect()
    const padding = 6
    const viewportWidth = window.visualViewport?.width || window.innerWidth
    const viewportHeight = window.visualViewport?.height || window.innerHeight
    const overflowRight = rect.right > viewportWidth - padding
    const overflowBottom = rect.bottom > viewportHeight - padding
    const dx = overflowRight ? rect.right - (viewportWidth - padding) : 0
    const dy = overflowBottom ? rect.bottom - (viewportHeight - padding) : 0
    const transforms = []
    if (dx) transforms.push(`translateX(${-dx}px)`)
    if (dy) transforms.push(`translateY(${-dy}px)`)
    menu.style.transform = transforms.length ? transforms.join(' ') : ''
  }

  function findClippingParent(rect) {
    let parent = menu.parentElement
    while (parent && parent !== document.body) {
      const style = getComputedStyle(parent)
      const overflowX = style.overflowX
      const overflowY = style.overflowY
      const clipsX = overflowX && overflowX !== 'visible'
      const clipsY = overflowY && overflowY !== 'visible'
      if (clipsX || clipsY) {
        const prect = parent.getBoundingClientRect()
        const clipped =
          (clipsX && rect.right > prect.right) ||
          (clipsX && rect.left < prect.left) ||
          (clipsY && rect.bottom > prect.bottom) ||
          (clipsY && rect.top < prect.top)
        if (clipped) return parent
      }
      parent = parent.parentElement
    }
    return null
  }

  function portalToBody(rect) {
    if (isPortaled) return
    originalParent = menu.parentElement
    originalNext = menu.nextSibling
    document.body.appendChild(menu)
    menu.style.position = 'fixed'
    menu.style.top = `${rect.top}px`
    menu.style.left = `${rect.left}px`
    menu.style.zIndex = '9999999'
    isPortaled = true
  }

  function restorePortal() {
    if (!isPortaled) return
    menu.style.position = ''
    menu.style.top = ''
    menu.style.left = ''
    menu.style.zIndex = ''
    if (originalParent) originalParent.insertBefore(menu, originalNext)
    originalParent = null
    originalNext = null
    isPortaled = false
  }

  function open() {
    onOpen?.(menu)
    menu.hidden = false
    menu.addEventListener('click', onClickMenu, true)
    if (closeOnOutside) document.addEventListener('click', onClickOut, true)
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect()
      const clippingParent = findClippingParent(rect)
      if (clippingParent) {
        portalToBody(rect)
      }
      adjustToViewport()
    })
  }

  function close() {
    menu.hidden = true
    menu.removeEventListener('click', onClickMenu, true)
    document.removeEventListener('click', onClickOut, true)
    menu.style.transform = ''
    restorePortal()
    onClose?.(menu)
  }

  function toggle() {
    menu.hidden ? open() : close()
  }

  if (toggleOnButtonClick) {
    btn.addEventListener('click', onClickBtn, true)
  }

  const destroy = () => {
    close()
    if (toggleOnButtonClick) {
      btn.removeEventListener('click', onClickBtn, true)
    }
  }

  return { open, close, toggle, destroy }
}

function sanitizeActionColor(color) {
  const allowed = new Set(['neutral', 'primary', 'success', 'warn', 'danger'])
  return allowed.has(color) ? color : 'neutral'
}

export function createActionDropdown({
  btn,
  menu = null,
  title = '',
  message = '',
  actions = [],
  onSelect,
  onOpen,
  onClose,
  closeOnOutside = true,
  toggleOnButtonClick = true,
} = {}) {
  if (!btn) return null

  let currentTitle = String(title || '')
  let currentMessage = String(message || '')
  let currentActions = Array.isArray(actions) ? actions : []
  const ownsMenu = !menu
  const nextMenu = menu || document.createElement('div')

  nextMenu.hidden = true
  nextMenu.classList.add('go-dd', 'go-dd-action')
  if (ownsMenu) {
    const host = btn.parentElement || document.body
    host.appendChild(nextMenu)
  }

  const render = () => {
    nextMenu.innerHTML = ''

    if (currentTitle) {
      const titleEl = document.createElement('div')
      titleEl.className = 'go-dd-action-title'
      titleEl.textContent = currentTitle
      nextMenu.appendChild(titleEl)
    }

    if (currentMessage) {
      const messageEl = document.createElement('div')
      messageEl.className = 'go-dd-action-message'
      messageEl.textContent = currentMessage
      nextMenu.appendChild(messageEl)
    }

    const actionsEl = document.createElement('div')
    actionsEl.className = 'go-dd-action-list'
    const list = Array.isArray(currentActions) ? currentActions : []

    if (!list.length) {
      const emptyEl = document.createElement('span')
      emptyEl.className = 'go-dd-no-content'
      emptyEl.textContent = 'Sem ações disponíveis.'
      actionsEl.appendChild(emptyEl)
    } else {
      list.forEach((item, index) => {
        const action = item && typeof item === 'object' ? item : { value: item }
        const button = document.createElement('button')
        button.type = 'button'
        button.className = `go-dd-action-btn is-${sanitizeActionColor(action.color)}`
        button.dataset.ddActionIndex = String(index)
        const value = action.value != null ? String(action.value) : String(index)
        button.dataset.ddActionValue = value
        button.textContent = action.label != null ? String(action.label) : value
        actionsEl.appendChild(button)
      })
    }

    nextMenu.appendChild(actionsEl)
  }

  const dropdown = createDropdown({
    btn,
    menu: nextMenu,
    matchSelector: '[data-dd-action-index]',
    closeOnOutside,
    toggleOnButtonClick,
    onOpen: (menuEl) => onOpen?.(menuEl),
    onClose: (menuEl) => onClose?.(menuEl),
    onSelect: (item, event) => {
      const index = Number(item?.dataset?.ddActionIndex)
      if (!Number.isInteger(index) || index < 0 || index >= currentActions.length) return
      const action = currentActions[index] || {}
      const value = action.value != null ? action.value : item?.dataset?.ddActionValue

      onSelect?.({ value, action, item, event, close: dropdown?.close, open: dropdown?.open, render })
      if (typeof action.action === 'function') {
        action.action({ value, action, item, event, close: dropdown?.close, open: dropdown?.open, render })
      }
      if (action.closeOnSelect !== false) {
        dropdown?.close()
      }
    },
  })

  const setTitle = (nextTitle = '') => {
    currentTitle = String(nextTitle || '')
    render()
  }
  const setMessage = (nextMessage = '') => {
    currentMessage = String(nextMessage || '')
    render()
  }
  const setActions = (nextActions = []) => {
    currentActions = Array.isArray(nextActions) ? nextActions : []
    render()
  }

  const destroy = () => {
    dropdown?.destroy?.()
    if (ownsMenu) nextMenu.remove()
  }

  render()

  return {
    ...dropdown,
    menu: nextMenu,
    render,
    setTitle,
    setMessage,
    setActions,
    destroy
  }
}
