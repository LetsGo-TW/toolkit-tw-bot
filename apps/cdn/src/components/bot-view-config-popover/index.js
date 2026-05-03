import './style.css'

function normalizeSection(section, index) {
  const source = section && typeof section === 'object' ? section : {}
  const fallbackId = `section-${index + 1}`
  const id = String(source.id || fallbackId).trim() || fallbackId
  const label = String(source.label || source.title || id).trim() || id

  return {
    id,
    label,
    groupId: String(source.groupId || source.group || '').trim(),
    statusLabel: String(source.statusLabel || source.status || '').trim(),
    statusTone: String(source.statusTone || source.statusKind || '').trim().toLowerCase(),
    defaultOpen: Boolean(source.defaultOpen),
    mount: typeof source.mount === 'function' ? source.mount : null,
  }
}

function normalizeGroup(group, index) {
  const source = group && typeof group === 'object' ? group : {}
  const fallbackId = `group-${index + 1}`
  const id = String(source.id || fallbackId).trim() || fallbackId
  const label = String(source.label || source.title || id).trim() || id

  return {
    id,
    label,
    alwaysRender: source.alwaysRender !== false,
  }
}

function resolveCleanup(value) {
  if (typeof value === 'function') return value
  if (value && typeof value.destroy === 'function') {
    return () => value.destroy()
  }
  return null
}

function applySectionBadge(badgeEl, label = '', tone = '') {
  if (!(badgeEl instanceof HTMLElement)) {
    return
  }

  const safeLabel = String(label || '').trim()
  const safeTone = String(tone || '').trim().toLowerCase()

  if (!safeLabel) {
    badgeEl.hidden = true
    badgeEl.textContent = ''
    badgeEl.className = 'go-bvcp-section-badge'
    return
  }

  badgeEl.hidden = false
  badgeEl.textContent = safeLabel
  badgeEl.className = `go-bvcp-section-badge is-${safeTone || 'neutral'}`
}

export function createBotViewConfigPopover({
  btn,
  title = '',
  sections = [],
  groups = [],
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
  const normalizedGroups = Array.isArray(groups)
    ? groups.map(normalizeGroup).filter(Boolean)
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
  const groupHosts = new Map()
  const ungroupedHost = sectionsHost instanceof HTMLElement
    ? document.createElement('div')
    : null
  let isOpen = false

  const mountSection = (sectionState) => {
    if (!sectionState || sectionState.mounted || !(sectionState.body instanceof HTMLElement)) return
    sectionState.mounted = true
    const sectionApi = {
      setStatus(label = '', tone = '') {
        applySectionBadge(sectionState.badge, label, tone)
      },
      close() {
        close()
      },
    }
    sectionState.cleanup = resolveCleanup(sectionState.mount?.(sectionState.body, sectionApi))
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

  if (sectionsHost instanceof HTMLElement) {
    if (ungroupedHost instanceof HTMLElement) {
      ungroupedHost.className = 'go-bvcp-ungrouped'
      sectionsHost.append(ungroupedHost)
    }

    normalizedGroups.forEach((group) => {
      if (!group.alwaysRender && !normalizedSections.some((section) => section.groupId === group.id)) {
        return
      }

      const groupEl = document.createElement('section')
      groupEl.className = 'go-bvcp-group'
      groupEl.setAttribute('data-bvcp-group', group.id)
      groupEl.innerHTML = `
        <div class="go-bvcp-group-title">${group.label}</div>
        <div class="go-bvcp-group-body" data-bvcp-group-body></div>
      `

      const body = groupEl.querySelector('[data-bvcp-group-body]')
      sectionsHost.append(groupEl)
      groupHosts.set(group.id, body instanceof HTMLElement ? body : groupEl)
    })
  }

  normalizedSections.forEach((section, index) => {
    if (!(sectionsHost instanceof HTMLElement)) return

    const parentHost = (
      section.groupId
      && groupHosts.get(section.groupId) instanceof HTMLElement
    )
      ? groupHosts.get(section.groupId)
      : (ungroupedHost instanceof HTMLElement ? ungroupedHost : sectionsHost)

    if (!useAccordion) {
      const panel = document.createElement('section')
      panel.className = 'go-bvcp-panel'
      panel.innerHTML = `
        ${section.label ? `
          <div class="go-bvcp-panel-title">
            <span class="go-bvcp-panel-title-text">${section.label}</span>
            <span
              class="go-bvcp-section-badge is-${section.statusTone || 'neutral'}"
              data-bvcp-section-badge
              ${section.statusLabel ? '' : 'hidden'}
            >${section.statusLabel || ''}</span>
          </div>
        ` : ''}
        <div class="go-bvcp-panel-body" data-bvcp-section-body></div>
      `

      const body = panel.querySelector('[data-bvcp-section-body]')
      const badge = panel.querySelector('[data-bvcp-section-badge]')
      parentHost.append(panel)
      sectionStates.push({
        ...section,
        body,
        badge,
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
        <span class="go-bvcp-accordion-label-wrap">
          <span class="go-bvcp-accordion-label">${section.label}</span>
          <span
            class="go-bvcp-section-badge is-${section.statusTone || 'neutral'}"
            data-bvcp-section-badge
            ${section.statusLabel ? '' : 'hidden'}
          >${section.statusLabel || ''}</span>
        </span>
        <span class="go-bvcp-accordion-caret">▾</span>
      </button>
      <div class="go-bvcp-accordion-body" data-bvcp-accordion-body hidden></div>
    `

    const trigger = item.querySelector('[data-bvcp-accordion-trigger]')
    const body = item.querySelector('[data-bvcp-accordion-body]')
    const badge = item.querySelector('[data-bvcp-section-badge]')
    parentHost.append(item)

    const sectionState = {
      ...section,
      body,
      badge,
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

  if (ungroupedHost instanceof HTMLElement && ungroupedHost.childElementCount === 0) {
    ungroupedHost.remove()
  }

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
