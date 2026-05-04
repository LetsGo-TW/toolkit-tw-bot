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
    /**
     * `detail`
     *   Opens the second dropdown and mounts the script UI there.
     *
     * `row-action`
     *   Clicking the row acts directly (ex.: toggle TW page config).
     *
     * `button-action`
     *   Keeps an action button inside the primary menu row (ex.: "Ir").
     */
    renderMode: String(source.renderMode || 'detail').trim().toLowerCase(),
    mount: typeof source.mount === 'function' ? source.mount : null,
    onAction: typeof source.onAction === 'function' ? source.onAction : null,
    actionLabel: String(source.actionLabel || '').trim(),
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

  /**
   * Primary dropdown:
   * - only a stable menu/index
   * - does not expand with script content
   */
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

  /**
   * Secondary dropdown:
   * - appears only for `renderMode === "detail"`
   * - mounts the selected script view
   * - keeps the first menu stable and unchanged in size
   */
  const detail = document.createElement('div')
  detail.hidden = true
  detail.className = 'go-bot-view-config-popover go-bot-view-config-popover-detail'
  detail.setAttribute('role', 'dialog')
  detail.setAttribute('aria-modal', 'false')
  detail.innerHTML = `
    <div class="go-bvcp-shell">
      <div class="go-bvcp-detail-header">
        <div class="go-bvcp-detail-title-wrap">
          <span class="go-bvcp-detail-title" data-bvcp-detail-title></span>
          <span class="go-bvcp-section-badge" data-bvcp-detail-badge hidden></span>
        </div>
      </div>
      <div class="go-bvcp-detail-body" data-bvcp-detail-body></div>
    </div>
  `

  document.body.append(menu, detail)

  const sectionsHost = menu.querySelector('[data-bvcp-sections]')
  const detailTitle = detail.querySelector('[data-bvcp-detail-title]')
  const detailBadge = detail.querySelector('[data-bvcp-detail-badge]')
  const detailBody = detail.querySelector('[data-bvcp-detail-body]')
  const sectionStates = []
  const groupHosts = new Map()
  const ungroupedHost = sectionsHost instanceof HTMLElement
    ? document.createElement('div')
    : null

  let isOpen = false
  let isDetailOpen = false
  let activeDetailSectionId = ''
  let activeDetailCleanup = null

  const findSectionState = (sectionId = '') => (
    sectionStates.find((sectionState) => sectionState.id === sectionId) || null
  )

  const closeDetail = () => {
    isDetailOpen = false
    activeDetailSectionId = ''
    detail.hidden = true
    try {
      activeDetailCleanup?.()
    } catch (_) {}
    activeDetailCleanup = null
    if (detailTitle instanceof HTMLElement) detailTitle.textContent = ''
    applySectionBadge(detailBadge, '', '')
    if (detailBody instanceof HTMLElement) {
      detailBody.innerHTML = ''
    }
    sectionStates.forEach((sectionState) => {
      sectionState.item?.classList?.remove?.('is-selected')
    })
  }

  /**
   * Mounts only one detail section at a time.
   *
   * This keeps the second dropdown simple and deterministic:
   * selecting another menu item destroys the previous mounted view
   * and mounts the next one in the same detail host.
   */
  const openDetail = (sectionState) => {
    if (!sectionState || !(detailBody instanceof HTMLElement)) return

    if (isDetailOpen && activeDetailSectionId === sectionState.id) {
      closeDetail()
      return
    }

    closeDetail()
    isDetailOpen = true
    activeDetailSectionId = sectionState.id
    detail.hidden = false

    sectionStates.forEach((state) => {
      state.item?.classList?.toggle?.('is-selected', state.id === sectionState.id)
    })

    if (detailTitle instanceof HTMLElement) {
      detailTitle.textContent = sectionState.label
    }
    applySectionBadge(detailBadge, sectionState.statusLabel, sectionState.statusTone)

    const sectionApi = {
      setStatus(label = '', tone = '') {
        sectionState.statusLabel = String(label || '').trim()
        sectionState.statusTone = String(tone || '').trim().toLowerCase()
        applySectionBadge(sectionState.badge, sectionState.statusLabel, sectionState.statusTone)
        if (activeDetailSectionId === sectionState.id) {
          applySectionBadge(detailBadge, sectionState.statusLabel, sectionState.statusTone)
        }
      },
      close() {
        close()
      },
    }

    activeDetailCleanup = resolveCleanup(sectionState.mount?.(detailBody, sectionApi))
    positionPanels(sectionState)
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

  normalizedSections.forEach((section) => {
    if (!(sectionsHost instanceof HTMLElement)) return

    const parentHost = (
      section.groupId
      && groupHosts.get(section.groupId) instanceof HTMLElement
    )
      ? groupHosts.get(section.groupId)
      : (ungroupedHost instanceof HTMLElement ? ungroupedHost : sectionsHost)

    const item = document.createElement('section')
    item.className = 'go-bvcp-menu-item'
    item.innerHTML = `
      <div class="go-bvcp-menu-row">
        <button
          type="button"
          class="go-bvcp-menu-row-main"
          data-bvcp-menu-main="${section.id}"
          ${section.renderMode === 'button-action' ? 'disabled' : ''}
        >
          <span class="go-bvcp-menu-row-label-wrap">
            <span class="go-bvcp-menu-row-label">${section.label}</span>
            <span
              class="go-bvcp-section-badge is-${section.statusTone || 'neutral'}"
              data-bvcp-section-badge
              ${section.statusLabel ? '' : 'hidden'}
            >${section.statusLabel || ''}</span>
          </span>
          <span
            class="go-bvcp-menu-row-caret"
            data-bvcp-menu-caret
            ${section.renderMode === 'detail' ? '' : 'hidden'}
          >▸</span>
        </button>
        <button
          type="button"
          class="go-bvcp-menu-row-action"
          data-bvcp-menu-action="${section.id}"
          ${section.renderMode === 'button-action' ? '' : 'hidden'}
        >${section.actionLabel || 'Ir'}</button>
      </div>
    `

    const mainButton = item.querySelector('[data-bvcp-menu-main]')
    const actionButton = item.querySelector('[data-bvcp-menu-action]')
    const badge = item.querySelector('[data-bvcp-section-badge]')

    const sectionState = {
      ...section,
      item,
      mainButton,
      actionButton,
      badge,
    }

    /**
     * The main menu row now behaves according to section type:
     * - detail      => opens the second dropdown
     * - row-action  => executes immediately on click
     * - button-action => the row itself does nothing; only the small button acts
     */
    mainButton?.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()

      if (sectionState.renderMode === 'detail') {
        openDetail(sectionState)
        return
      }

      if (sectionState.renderMode === 'row-action') {
        sectionState.onAction?.()
        close()
      }
    }, true)

    actionButton?.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      sectionState.onAction?.()
      close()
    }, true)

    parentHost.append(item)
    sectionStates.push(sectionState)
  })

  if (ungroupedHost instanceof HTMLElement && ungroupedHost.childElementCount === 0) {
    ungroupedHost.remove()
  }

  function positionPanels(activeSectionState = null) {
    const padding = 8
    const viewportWidth = window.visualViewport?.width || window.innerWidth
    const viewportHeight = window.visualViewport?.height || window.innerHeight

    const wasMenuHidden = menu.hidden
    const wasDetailHidden = detail.hidden

    if (wasMenuHidden) {
      menu.hidden = false
      menu.style.visibility = 'hidden'
    }

    if (!detail.hidden) {
      detail.style.visibility = 'hidden'
    }

    const btnRect = btn.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()

    let menuLeft = Math.round(btnRect.right + offset)
    if (menuLeft + menuRect.width > viewportWidth - padding) {
      menuLeft = Math.round(btnRect.left - offset - menuRect.width)
    }
    menuLeft = Math.max(padding, Math.min(menuLeft, viewportWidth - menuRect.width - padding))

    let menuTop = Math.round(btnRect.top)
    if (menuTop + menuRect.height > viewportHeight - padding) {
      menuTop = Math.round(viewportHeight - menuRect.height - padding)
    }
    menuTop = Math.max(padding, menuTop)

    menu.style.left = `${menuLeft}px`
    menu.style.top = `${menuTop}px`

    if (!detail.hidden) {
      const detailRect = detail.getBoundingClientRect()
      const anchorRect = activeSectionState?.item instanceof HTMLElement
        ? activeSectionState.item.getBoundingClientRect()
        : menu.getBoundingClientRect()

      let detailLeft = Math.round(menuRect.right + 8)
      if (detailLeft + detailRect.width > viewportWidth - padding) {
        detailLeft = Math.round(menuRect.left - 8 - detailRect.width)
      }
      detailLeft = Math.max(padding, Math.min(detailLeft, viewportWidth - detailRect.width - padding))

      let detailTop = Math.round(anchorRect.top)
      if (detailTop + detailRect.height > viewportHeight - padding) {
        detailTop = Math.round(viewportHeight - detailRect.height - padding)
      }
      detailTop = Math.max(padding, detailTop)

      detail.style.left = `${detailLeft}px`
      detail.style.top = `${detailTop}px`
      detail.style.visibility = ''
    }

    if (wasMenuHidden) {
      menu.hidden = true
      menu.style.visibility = ''
    }

    if (wasDetailHidden) {
      detail.hidden = true
    }
  }

  const onViewportChange = () => {
    if (!isOpen) return
    positionPanels(findSectionState(activeDetailSectionId))
  }

  const shouldIgnoreOutsideClose = (event) => {
    const targetNode = event.target
    if (!(targetNode instanceof Node)) return false
    if (btn.contains(targetNode)) return true
    if (menu.contains(targetNode)) return true
    if (detail.contains(targetNode)) return true
    return false
  }

  const onDocumentPointerDown = (event) => {
    if (shouldIgnoreOutsideClose(event)) return
    close()
  }

  const onDocumentFocusIn = (event) => {
    if (shouldIgnoreOutsideClose(event)) return
    close()
  }

  const open = () => {
    if (isOpen) return
    isOpen = true
    menu.hidden = false
    btn.setAttribute('aria-expanded', 'true')
    positionPanels()
    window.addEventListener('resize', onViewportChange, true)
    window.addEventListener('scroll', onViewportChange, true)
    document.addEventListener('pointerdown', onDocumentPointerDown, true)
    document.addEventListener('focusin', onDocumentFocusIn, true)
    if (typeof onOpen === 'function') onOpen(menu)
  }

  const close = () => {
    if (!isOpen) return
    isOpen = false
    closeDetail()
    menu.hidden = true
    btn.setAttribute('aria-expanded', 'false')
    window.removeEventListener('resize', onViewportChange, true)
    window.removeEventListener('scroll', onViewportChange, true)
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
    document.removeEventListener('focusin', onDocumentFocusIn, true)
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
    menu.remove()
    detail.remove()
  }

  return {
    close,
    destroy,
    open,
    toggle,
  }
}

export default createBotViewConfigPopover
