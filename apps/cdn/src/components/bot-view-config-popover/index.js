import './style.css'

function normalizeSection(section, index) {
  const source = section && typeof section === 'object' ? section : {}
  const fallbackId = `section-${index + 1}`
  const id = String(source.id || fallbackId).trim() || fallbackId
  const label = String(source.label || source.title || id).trim() || id

  return {
    id,
    label,
    defaultOpen: Boolean(source.defaultOpen),
    mount: typeof source.mount === 'function' ? source.mount : null,
  }
}

function resolveCleanup(value) {
  if (typeof value === 'function') return value
  if (value && typeof value.destroy === 'function') {
    return () => value.destroy()
  }
  return null
}

export function createBotViewConfigPopover({
  btn,
  title = '',
  sections = [],
  accordion = null,
  singleOpen = true,
  offset = 10,
  onOpen = null,
  onClose = null,
} = {}) {
  if (!(btn instanceof HTMLElement)) return null

  const normalizedTitle = String(title || '').trim()
  const normalizedSections = Array.isArray(sections)
    ? sections.map(normalizeSection).filter(Boolean)
    : []

  const useAccordion = accordion == null
    ? normalizedSections.length > 1
    : Boolean(accordion)

  const menu = document.createElement('div')
  menu.hidden = true
  menu.className = 'go-bot-view-config-popover'
  menu.setAttribute('role', 'dialog')
  menu.setAttribute('aria-modal', 'false')
  menu.innerHTML = `
    <div class="go-bvcp-shell">
      ${normalizedTitle ? `<div class="go-bvcp-title">${normalizedTitle}</div>` : ''}
      <div class="go-bvcp-sections" data-bvcp-sections></div>
    </div>
  `
  document.body.append(menu)

  const sectionsHost = menu.querySelector('[data-bvcp-sections]')
  const sectionStates = []
  let isOpen = false

  const mountSection = (sectionState) => {
    if (!sectionState || sectionState.mounted || !(sectionState.body instanceof HTMLElement)) return
    sectionState.mounted = true
    sectionState.cleanup = resolveCleanup(sectionState.mount?.(sectionState.body))
  }

  const syncAccordionState = () => {
    sectionStates.forEach((sectionState) => {
      if (!(sectionState.item instanceof HTMLElement) || !(sectionState.body instanceof HTMLElement)) return
      sectionState.item.classList.toggle('is-open', Boolean(sectionState.open))
      sectionState.body.hidden = !sectionState.open
      sectionState.trigger?.setAttribute('aria-expanded', sectionState.open ? 'true' : 'false')
      if (sectionState.open) mountSection(sectionState)
    })
  }

  const openSection = (sectionId) => {
    let nextFound = false
    sectionStates.forEach((sectionState) => {
      const isTarget = sectionState.id === sectionId
      if (isTarget) nextFound = true
      sectionState.open = isTarget ? !sectionState.open : (singleOpen ? false : sectionState.open)
      if (!isTarget && !singleOpen) return
    })
    if (!nextFound) return
    syncAccordionState()
  }

  const ensureDefaultOpenSections = () => {
    if (!useAccordion) {
      sectionStates.forEach((sectionState) => mountSection(sectionState))
      return
    }

    const alreadyOpen = sectionStates.some((sectionState) => sectionState.open)
    if (alreadyOpen) {
      syncAccordionState()
      return
    }

    const firstDefaultOpen = sectionStates.find((sectionState) => sectionState.defaultOpen)
    if (!firstDefaultOpen) {
      syncAccordionState()
      return
    }

    if (singleOpen) {
      sectionStates.forEach((sectionState) => {
        sectionState.open = sectionState.id === firstDefaultOpen.id
      })
    } else {
      firstDefaultOpen.open = true
    }

    syncAccordionState()
  }

  normalizedSections.forEach((section, index) => {
    if (!(sectionsHost instanceof HTMLElement)) return

    if (!useAccordion) {
      const panel = document.createElement('section')
      panel.className = 'go-bvcp-panel'
      panel.innerHTML = `
        ${section.label ? `<div class="go-bvcp-panel-title">${section.label}</div>` : ''}
        <div class="go-bvcp-panel-body" data-bvcp-section-body></div>
      `

      const body = panel.querySelector('[data-bvcp-section-body]')
      sectionsHost.append(panel)
      sectionStates.push({
        ...section,
        body,
        panel,
        item: panel,
        trigger: null,
        cleanup: null,
        mounted: false,
        open: true,
      })
      return
    }

    const item = document.createElement('section')
    item.className = 'go-bvcp-accordion-item'
    item.innerHTML = `
      <button
        type="button"
        class="go-bvcp-accordion-trigger"
        data-bvcp-accordion-trigger="${section.id}"
        aria-expanded="false"
      >
        <span class="go-bvcp-accordion-label">${section.label}</span>
        <span class="go-bvcp-accordion-caret">▾</span>
      </button>
      <div class="go-bvcp-accordion-body" data-bvcp-accordion-body hidden></div>
    `

    const trigger = item.querySelector('[data-bvcp-accordion-trigger]')
    const body = item.querySelector('[data-bvcp-accordion-body]')
    sectionsHost.append(item)

    const sectionState = {
      ...section,
      body,
      item,
      trigger,
      panel: null,
      cleanup: null,
      mounted: false,
      open: Boolean(section.defaultOpen && (singleOpen ? index === 0 || !sectionStates.some((state) => state.open) : true)),
    }

    trigger?.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      openSection(section.id)
    }, true)

    sectionStates.push(sectionState)
  })

  const positionMenu = () => {
    const padding = 8
    const viewportWidth = window.visualViewport?.width || window.innerWidth
    const viewportHeight = window.visualViewport?.height || window.innerHeight
    const wasHidden = menu.hidden

    if (wasHidden) {
      menu.hidden = false
      menu.style.visibility = 'hidden'
    }

    const rect = btn.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()

    let left = Math.round(rect.right + offset)
    if (left + menuRect.width > viewportWidth - padding) {
      left = Math.round(rect.left - offset - menuRect.width)
    }
    left = Math.max(padding, Math.min(left, viewportWidth - menuRect.width - padding))

    let top = Math.round(rect.top)
    if (top + menuRect.height > viewportHeight - padding) {
      top = Math.round(viewportHeight - menuRect.height - padding)
    }
    top = Math.max(padding, top)

    menu.style.left = `${left}px`
    menu.style.top = `${top}px`

    if (wasHidden) {
      menu.hidden = true
      menu.style.visibility = ''
    }
  }

  const onViewportChange = () => {
    if (!isOpen) return
    positionMenu()
  }

  const open = () => {
    if (isOpen) return
    isOpen = true
    ensureDefaultOpenSections()
    menu.hidden = false
    positionMenu()
    btn.setAttribute('aria-expanded', 'true')
    window.addEventListener('resize', onViewportChange, true)
    window.addEventListener('scroll', onViewportChange, true)
    if (typeof onOpen === 'function') onOpen(menu)
  }

  const close = () => {
    if (!isOpen) return
    isOpen = false
    menu.hidden = true
    btn.setAttribute('aria-expanded', 'false')
    window.removeEventListener('resize', onViewportChange, true)
    window.removeEventListener('scroll', onViewportChange, true)
    if (typeof onClose === 'function') onClose(menu)
  }

  const toggle = () => {
    if (isOpen) {
      close()
      return
    }
    open()
  }

  const onButtonClick = (event) => {
    event.preventDefault()
    event.stopPropagation()
    toggle()
  }

  btn.addEventListener('click', onButtonClick, true)

  const destroy = () => {
    close()
    btn.removeEventListener('click', onButtonClick, true)
    sectionStates.forEach((sectionState) => {
      try {
        sectionState.cleanup?.()
      } catch (_) {}
      sectionState.cleanup = null
    })
    menu.remove()
  }

  return {
    root: () => menu,
    open,
    close,
    toggle,
    destroy,
  }
}

export default createBotViewConfigPopover
