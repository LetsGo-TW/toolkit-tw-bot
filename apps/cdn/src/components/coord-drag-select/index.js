import './style.css'

const TOKEN_CLASS = 'go-coord-drag-token'
const TOKEN_SELECTED_CLASS = 'go-coord-drag-token-selected'
const BOX_CLASS = 'go-coord-drag-box'
const CURSOR_BADGE_CLASS = 'go-coord-drag-cursor-badge'
const BODY_NO_SELECT_CLASS = 'go-coord-drag-no-select'

function isFiniteNumber(value) {
  return Number.isFinite(Number(value))
}

function normalizeCoord(valueX, valueY) {
  if (!isFiniteNumber(valueX) || !isFiniteNumber(valueY)) return null
  return `${Math.trunc(Number(valueX))}|${Math.trunc(Number(valueY))}`
}

function parseCoordString(value) {
  const text = String(value || '')
  const match = text.match(/\b(\d{1,3})\|(\d{1,3})\b/)
  if (!match) return null
  return normalizeCoord(match[1], match[2])
}

function extractCoordKeysFromText(text) {
  const source = String(text || '')
  const regex = /\b(\d{1,3})\|(\d{1,3})\b/g
  const result = []
  const seen = new Set()
  let match = null
  while ((match = regex.exec(source))) {
    const coord = normalizeCoord(match[1], match[2])
    if (!coord || seen.has(coord)) continue
    seen.add(coord)
    result.push(coord)
  }
  return result
}

function intersectsRect(a, b) {
  return !(
    a.right < b.left ||
    a.left > b.right ||
    a.bottom < b.top ||
    a.top > b.bottom
  )
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max))
}

function canTokenizeTextNode(node) {
  const text = node?.nodeValue || ''
  if (!/\b\d{1,3}\|\d{1,3}\b/.test(text)) return false

  const parent = node.parentElement
  if (!parent) return false
  if (parent.closest(`.${TOKEN_CLASS}`)) return false
  if (parent.closest('script, style, textarea, select, option')) return false
  if (parent.closest('[contenteditable="true"]')) return false
  if (/^(SCRIPT|STYLE|TEXTAREA|INPUT|SELECT|OPTION)$/i.test(parent.tagName || '')) return false

  return true
}

function tokenizeCoordsInRoot(root) {
  if (!root || !root.isConnected) return { inserted: 0, totalTokens: 0 }

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        return canTokenizeTextNode(node)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT
      }
    }
  )

  const textNodes = []
  let current = null
  while ((current = walker.nextNode())) textNodes.push(current)

  let inserted = 0
  for (const node of textNodes) {
    const text = node.nodeValue || ''
    const regex = /\b(\d{1,3})\|(\d{1,3})\b/g
    let match = null
    let lastIndex = 0
    let changed = false
    const frag = document.createDocumentFragment()

    while ((match = regex.exec(text))) {
      const full = match[0]
      const coord = normalizeCoord(match[1], match[2])
      if (!coord) continue

      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)))
      }

      const token = document.createElement('span')
      token.className = TOKEN_CLASS
      token.dataset.goCoord = coord
      token.textContent = full
      frag.appendChild(token)

      inserted += 1
      changed = true
      lastIndex = match.index + full.length
    }

    if (!changed) continue
    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)))
    }
    node.parentNode?.replaceChild(frag, node)
  }

  const totalTokens = root.querySelectorAll(`.${TOKEN_CLASS}[data-go-coord]`).length
  return { inserted, totalTokens }
}

export function createCoordDragSelect({
  root = null,
  excludeSelector = '.go-collector-base',
  onCountChange = null,
  onSelectionChange = null,
  onCommit = null
} = {}) {
  let currentRoot = root || document.querySelector('#content_value') || document.body
  let isActive = false
  let isDestroyed = false
  let dragSession = null

  let boxEl = null
  let cursorBadgeEl = null

  let tokenEntries = []
  let repTokenByCoord = new Map()
  const selectedCoords = new Set()

  const state = {
    currentPreviewCount: 0
  }

  function ensureRoot() {
    if (currentRoot?.isConnected) return currentRoot
    currentRoot = document.querySelector('#content_value') || document.body
    return currentRoot
  }

  function ensureBox() {
    if (boxEl?.isConnected) return boxEl
    boxEl = document.createElement('div')
    boxEl.className = BOX_CLASS
    boxEl.hidden = true
    document.body.appendChild(boxEl)
    return boxEl
  }

  function ensureCursorBadge() {
    if (cursorBadgeEl?.isConnected) return cursorBadgeEl
    cursorBadgeEl = document.createElement('div')
    cursorBadgeEl.className = CURSOR_BADGE_CLASS
    cursorBadgeEl.hidden = true
    document.body.appendChild(cursorBadgeEl)
    return cursorBadgeEl
  }

  function hideDragUi() {
    if (boxEl) boxEl.hidden = true
    if (cursorBadgeEl) cursorBadgeEl.hidden = true
  }

  function updateCursorBadge(clientX, clientY, count) {
    const el = ensureCursorBadge()
    el.textContent = String(Math.max(0, Number(count) || 0))
    el.hidden = false

    const rect = el.getBoundingClientRect()
    const nextLeft = clamp(clientX + 12, 8, Math.max(8, window.innerWidth - rect.width - 8))
    const nextTop = clamp(clientY + 12, 8, Math.max(8, window.innerHeight - rect.height - 8))

    el.style.left = `${Math.round(nextLeft)}px`
    el.style.top = `${Math.round(nextTop)}px`
  }

  function emitCountChange(count, meta = {}) {
    state.currentPreviewCount = Math.max(0, Number(count) || 0)
    if (typeof onCountChange === 'function') {
      try {
        onCountChange(state.currentPreviewCount, meta)
      } catch (_) {}
    }
  }

  function emitSelectionChange() {
    if (typeof onSelectionChange !== 'function') return
    try {
      onSelectionChange(Array.from(selectedCoords))
    } catch (_) {}
  }

  function rebuildTokenCache() {
    const rootEl = ensureRoot()
    tokenEntries = []
    repTokenByCoord = new Map()
    if (!rootEl) return

    const tokens = Array.from(rootEl.querySelectorAll(`.${TOKEN_CLASS}[data-go-coord]`))
    for (const el of tokens) {
      const coord = parseCoordString(el.dataset.goCoord)
      if (!coord) continue
      const entry = { el, coord }
      tokenEntries.push(entry)
      if (!repTokenByCoord.has(coord)) repTokenByCoord.set(coord, el)
    }
  }

  function syncHighlights() {
    for (const entry of tokenEntries) {
      entry.el.classList.remove(TOKEN_SELECTED_CLASS)
    }
    for (const coord of selectedCoords) {
      repTokenByCoord.get(coord)?.classList?.add?.(TOKEN_SELECTED_CLASS)
    }
  }

  function retokenize() {
    const rootEl = ensureRoot()
    const result = tokenizeCoordsInRoot(rootEl)
    rebuildTokenCache()
    syncHighlights()
    return result
  }

  function getSelectionRect(clientX, clientY) {
    if (!dragSession) return null
    const left = Math.min(dragSession.startX, clientX)
    const top = Math.min(dragSession.startY, clientY)
    const right = Math.max(dragSession.startX, clientX)
    const bottom = Math.max(dragSession.startY, clientY)
    return { left, top, right, bottom, width: right - left, height: bottom - top }
  }

  function updateDragBox(rect) {
    const el = ensureBox()
    el.hidden = false
    el.style.left = `${Math.round(rect.left)}px`
    el.style.top = `${Math.round(rect.top)}px`
    el.style.width = `${Math.round(rect.width)}px`
    el.style.height = `${Math.round(rect.height)}px`
  }

  function getCoordsIntersectingRect(rect) {
    const coords = []
    const seen = new Set()
    const dragRects = dragSession?.tokenRects || []
    for (const item of dragRects) {
      if (!intersectsRect(rect, item.rect)) continue
      if (seen.has(item.coord)) continue
      seen.add(item.coord)
      coords.push(item.coord)
    }
    return coords
  }

  function refreshCommittedCount(meta = {}) {
    emitCountChange(selectedCoords.size, meta)
  }

  function beginDrag(event) {
    dragSession = {
      startX: event.clientX,
      startY: event.clientY,
      tokenRects: tokenEntries
        .map(({ el, coord }) => ({ coord, rect: el.getBoundingClientRect() }))
        .filter(({ rect }) => rect && rect.width > 0 && rect.height > 0)
    }

    document.body.classList.add(BODY_NO_SELECT_CLASS)
    const rect = getSelectionRect(event.clientX, event.clientY)
    if (rect) updateDragBox(rect)
    updateCursorBadge(event.clientX, event.clientY, selectedCoords.size)
    emitCountChange(selectedCoords.size, { phase: 'drag', preview: true })
  }

  function handlePointerMove(event) {
    if (!isActive || !dragSession) return
    const rect = getSelectionRect(event.clientX, event.clientY)
    if (!rect) return

    updateDragBox(rect)

    const inArea = getCoordsIntersectingRect(rect)
    const previewCount = selectedCoords.size + inArea.filter((coord) => !selectedCoords.has(coord)).length

    updateCursorBadge(event.clientX, event.clientY, previewCount)
    emitCountChange(previewCount, {
      phase: 'drag',
      preview: true,
      inAreaCount: inArea.length,
      selectedCount: selectedCoords.size
    })

    event.preventDefault?.()
  }

  function finishDrag(event) {
    if (!dragSession) return
    const rect = getSelectionRect(event.clientX, event.clientY)
    const inArea = rect ? getCoordsIntersectingRect(rect) : []
    const beforeCount = selectedCoords.size

    for (const coord of inArea) selectedCoords.add(coord)
    syncHighlights()

    const committedCoords = Array.from(selectedCoords)
    refreshCommittedCount({ phase: 'commit' })
    emitSelectionChange()

    if (typeof onCommit === 'function') {
      try {
        onCommit(committedCoords, {
          addedCount: Math.max(0, selectedCoords.size - beforeCount),
          areaCount: inArea.length
        })
      } catch (_) {}
    }

    dragSession = null
    document.body.classList.remove(BODY_NO_SELECT_CLASS)
    hideDragUi()
    event?.preventDefault?.()
  }

  function cancelDrag() {
    dragSession = null
    document.body.classList.remove(BODY_NO_SELECT_CLASS)
    hideDragUi()
    refreshCommittedCount({ phase: 'cancel' })
  }

  function shouldIgnorePointerDown(event) {
    if (!isActive || isDestroyed) return true
    if (event.button !== 0) return true
    const target = event.target
    const rootEl = ensureRoot()
    if (!target || !rootEl || !rootEl.contains(target)) return true
    if (excludeSelector && target.closest?.(excludeSelector)) return true
    return false
  }

  function onMouseDown(event) {
    if (shouldIgnorePointerDown(event)) return
    beginDrag(event)
    event.preventDefault?.()
    event.stopPropagation?.()
  }

  function onMouseMove(event) {
    handlePointerMove(event)
  }

  function onMouseUp(event) {
    if (!dragSession) return
    finishDrag(event)
  }

  function bindDocumentEvents() {
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('mousemove', onMouseMove, true)
    document.addEventListener('mouseup', onMouseUp, true)
  }

  function unbindDocumentEvents() {
    document.removeEventListener('mousedown', onMouseDown, true)
    document.removeEventListener('mousemove', onMouseMove, true)
    document.removeEventListener('mouseup', onMouseUp, true)
  }

  function start() {
    if (isDestroyed) return controller
    isActive = true
    retokenize()
    refreshCommittedCount({ phase: 'start' })
    return controller
  }

  function stop() {
    if (isDestroyed) return controller
    isActive = false
    cancelDrag()
    return controller
  }

  function clear() {
    selectedCoords.clear()
    syncHighlights()
    refreshCommittedCount({ phase: 'clear' })
    emitSelectionChange()
    return { count: 0, coords: [] }
  }

  function addCoords(coords = [], meta = {}) {
    const list = Array.isArray(coords) ? coords : []
    const beforeCount = selectedCoords.size
    let addedCount = 0

    for (const rawCoord of list) {
      const coord = parseCoordString(rawCoord)
      if (!coord) continue
      if (selectedCoords.has(coord)) continue
      selectedCoords.add(coord)
      addedCount += 1
    }

    syncHighlights()
    refreshCommittedCount({ phase: 'add', ...meta })
    emitSelectionChange()

    const committedCoords = Array.from(selectedCoords)
    if (typeof onCommit === 'function') {
      try {
        onCommit(committedCoords, {
          addedCount,
          source: meta?.source || 'manual'
        })
      } catch (_) {}
    }

    return {
      count: selectedCoords.size,
      addedCount,
      duplicatedCount: Math.max(0, list.length - addedCount),
      beforeCount,
      coords: committedCoords
    }
  }

  function addCoordsFromText(text = '', meta = {}) {
    const coordKeys = extractCoordKeysFromText(text)
    const result = addCoords(coordKeys, { ...meta, source: meta?.source || 'text' })
    return {
      ...result,
      parsedCount: coordKeys.length,
      textLength: String(text || '').length
    }
  }

  async function pasteFromClipboard() {
    let clipboardText = ''
    let usedFallbackPrompt = false
    let clipboardReadOk = false

    try {
      clipboardText = await navigator?.clipboard?.readText?.()
      clipboardReadOk = true
    } catch (_) {
      clipboardReadOk = false
    }

    if (!clipboardReadOk) {
      const manualText = window.prompt?.('Cole aqui o texto com coordenadas (ex.: WhatsApp):', '') ?? ''
      clipboardText = String(manualText || '')
      usedFallbackPrompt = true
    }

    const result = addCoordsFromText(clipboardText, {
      source: usedFallbackPrompt ? 'manual-paste' : 'clipboard'
    })

    return {
      ...result,
      clipboardReadOk,
      usedFallbackPrompt
    }
  }

  function destroy() {
    if (isDestroyed) return null
    stop()
    isDestroyed = true
    unbindDocumentEvents()
    boxEl?.remove?.()
    cursorBadgeEl?.remove?.()
    return null
  }

  function setRoot(nextRoot) {
    currentRoot = nextRoot || document.querySelector('#content_value') || document.body
    if (isActive) retokenize()
    refreshCommittedCount({ phase: 'set-root' })
    return controller
  }

  bindDocumentEvents()

  const controller = {
    start,
    stop,
    clear,
    addCoords,
    addCoordsFromText,
    pasteFromClipboard,
    destroy,
    retokenize,
    setRoot,
    isActive: () => isActive,
    getSelectedCoords: () => Array.from(selectedCoords),
    getSelectedCount: () => selectedCoords.size
  }

  return controller
}

export default createCoordDragSelect
