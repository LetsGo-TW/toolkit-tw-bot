function parseCoordText(value = '') {
  const match = String(value || '').match(/(\d{1,3})\|(\d{1,3})/)
  if (!match) return null
  const x = Number(match[1])
  const y = Number(match[2])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

function parseCoordInputValue(value = '') {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{1,3})\|(\d{1,3})$/)
  if (!match) return null
  const x = Number(match[1])
  const y = Number(match[2])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

function parseIdFromHref(href = '') {
  try {
    const url = new URL(String(href || ''), window.location.origin)
    const raw = url.searchParams.get('id') || url.searchParams.get('target')
    const id = Number(raw)
    return Number.isFinite(id) ? id : null
  } catch (_) {
    return null
  }
}

function normalizeVillageCandidate(village = null) {
  if (!village || typeof village !== 'object') return null

  const id = Number(village.id ?? village.village_id ?? village.target ?? null)
  const x = Number(village.x ?? village.pos_x ?? village.coord_x ?? null)
  const y = Number(village.y ?? village.pos_y ?? village.coord_y ?? null)

  if (Number.isFinite(x) && Number.isFinite(y)) {
    return {
      id: Number.isFinite(id) ? id : null,
      x,
      y
    }
  }

  const coordText = parseCoordText(village.name || village.label || village.text || village.display_name || '')
  if (!coordText) return null

  return {
    id: Number.isFinite(id) ? id : null,
    x: coordText.x,
    y: coordText.y
  }
}

function sameTarget(a = null, b = null) {
  if (!a && !b) return true
  if (!a || !b) return false
  return Number(a?.id ?? NaN) === Number(b?.id ?? NaN)
    && Number(a?.x ?? NaN) === Number(b?.x ?? NaN)
    && Number(a?.y ?? NaN) === Number(b?.y ?? NaN)
}

function cloneTarget(value = null) {
  if (!value) return null
  const id = Number(value.id)
  const x = Number(value.x)
  const y = Number(value.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return {
    id: Number.isFinite(id) ? id : null,
    x,
    y
  }
}

function readPlaceTargetDom() {
  const root = document.querySelector('#place_target')
  if (!root) return { root: null, item: null, input: null, target: null }

  const item = root.querySelector('.village-item')
  const input = root.querySelector('input')
  if (!item) return { root, item: null, input, target: null }

  const anchor =
    item.querySelector('.village_anchor a[href]') ||
    item.querySelector('.village_anchor') ||
    item.querySelector('a[href*="screen=info_village"]')

  const anchorHolder = anchor?.closest?.('[data-id]')
  const holderId = Number(anchorHolder?.getAttribute?.('data-id'))
  const anchorId = parseIdFromHref(anchor?.getAttribute?.('href') || '')
  const urlTargetId = Number(new URL(window.location.href, window.location.origin).searchParams.get('target'))
  const id = [holderId, anchorId, urlTargetId].find((n) => Number.isFinite(n))

  const coord = parseCoordText(item.textContent || root.textContent || '')
  const target = coord ? {
    id: Number.isFinite(id) ? id : null,
    x: coord.x,
    y: coord.y
  } : null

  return { root, item, input, target }
}

function parseTargetSelectionResponse(jqXHR) {
  if (!jqXHR) return []
  let json = jqXHR.responseJSON || null
  if (!json && typeof jqXHR.responseText === 'string' && jqXHR.responseText.trim()) {
    try { json = JSON.parse(jqXHR.responseText) } catch (_) {}
  }
  const villages = json?.response?.villages || json?.villages || []
  return Array.isArray(villages)
    ? villages.map(normalizeVillageCandidate).filter(Boolean)
    : []
}

function isTargetSelectionCoordRequest(urlText = '') {
  if (!urlText) return false
  try {
    const url = new URL(String(urlText), window.location.origin)
    return String(url.searchParams.get('ajax') || '').trim() === 'target_selection'
      && String(url.searchParams.get('type') || '').trim() === 'coord'
  } catch (_) {
    return String(urlText).includes('ajax=target_selection') && String(urlText).includes('type=coord')
  }
}

function getTargetSelectionInput(urlText = '') {
  try {
    const url = new URL(String(urlText), window.location.origin)
    return String(url.searchParams.get('input') || '').trim()
  } catch (_) {
    const match = String(urlText || '').match(/[?&]input=([^&]+)/)
    if (!match) return ''
    try { return decodeURIComponent(match[1]).trim() } catch (_) { return String(match[1]).trim() }
  }
}

export function createPlacePlannerTargetTracker({
  onChange = null
} = {}) {
  let selectedTarget = null
  let searchCandidate = null
  let activeTarget = null
  let inputValue = ''
  let destroyed = false

  const subscribers = new Set()
  const byCoord = new Map()
  const byId = new Map()

  let mo = null
  let inputEl = null
  let placeRootEl = null
  let onInput = null
  let jq = null
  let jqHandler = null

  const notify = () => {
    const payload = {
      activeTarget: cloneTarget(activeTarget),
      selectedTarget: cloneTarget(selectedTarget),
      searchCandidate: cloneTarget(searchCandidate),
      inputValue: String(inputValue || '')
    }
    if (typeof onChange === 'function') {
      try { onChange(payload) } catch (_) {}
    }
    subscribers.forEach((fn) => {
      try { fn(payload) } catch (_) {}
    })
  }

  const setState = ({ nextSelected = selectedTarget, nextCandidate = searchCandidate, nextInput = inputValue } = {}) => {
    const candidateCoord = parseCoordInputValue(nextInput)
    const nextActive = nextSelected || (candidateCoord ? nextCandidate : null) || null

    const changed =
      !sameTarget(selectedTarget, nextSelected) ||
      !sameTarget(searchCandidate, nextCandidate) ||
      String(inputValue || '') !== String(nextInput || '') ||
      !sameTarget(activeTarget, nextActive)

    selectedTarget = cloneTarget(nextSelected)
    searchCandidate = cloneTarget(nextCandidate)
    inputValue = String(nextInput || '')
    activeTarget = cloneTarget(nextActive)

    if (changed) notify()
  }

  const resolveCandidateFromInput = (rawInput = '') => {
    const coord = parseCoordInputValue(rawInput)
    if (!coord) return null
    const key = `${coord.x}|${coord.y}`
    return cloneTarget(byCoord.get(key) || null)
  }

  const refreshFromDom = () => {
    if (destroyed) return
    const { root, input, target } = readPlaceTargetDom()
    placeRootEl = root || placeRootEl

    if (input && input !== inputEl) {
      if (inputEl && onInput) inputEl.removeEventListener('input', onInput, true)
      inputEl = input
      onInput = () => {
        const nextValue = String(inputEl?.value || '')
        setState({
          nextInput: nextValue,
          nextCandidate: resolveCandidateFromInput(nextValue)
        })
      }
      inputEl.addEventListener('input', onInput, true)
    }

    const nextInput = String(input?.value || inputValue || '')
    let nextTarget = cloneTarget(target)
    if (nextTarget && !Number.isFinite(Number(nextTarget.id))) {
      const byCoordHit = resolveCandidateFromInput(`${nextTarget.x}|${nextTarget.y}`)
      if (byCoordHit) nextTarget = { ...nextTarget, id: byCoordHit.id ?? null }
    }

    setState({
      nextSelected: nextTarget,
      nextCandidate: resolveCandidateFromInput(nextInput),
      nextInput
    })
  }

  const attachObserver = () => {
    const { root } = readPlaceTargetDom()
    placeRootEl = root || placeRootEl
    if (!placeRootEl || mo) return

    mo = new MutationObserver(() => {
      refreshFromDom()
    })
    mo.observe(placeRootEl, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    })
  }

  const attachJqAjaxListener = () => {
    jq = window.jQuery || window.$ || null
    if (!jq || !jq(document)?.on) return

    jqHandler = (_event, jqXHR, settings = {}) => {
      if (destroyed) return
      const urlText = String(settings?.url || jqXHR?.responseURL || '')
      if (!isTargetSelectionCoordRequest(urlText)) return

      const rawInput = getTargetSelectionInput(urlText)
      const villages = parseTargetSelectionResponse(jqXHR)
      villages.forEach((v) => {
        byCoord.set(`${v.x}|${v.y}`, cloneTarget(v))
        if (Number.isFinite(Number(v.id))) byId.set(String(Number(v.id)), cloneTarget(v))
      })

      const inputCoord = parseCoordInputValue(rawInput)
      let nextCandidate = searchCandidate
      if (inputCoord) {
        nextCandidate = villages.find((v) => v.x === inputCoord.x && v.y === inputCoord.y) || null
        if (!nextCandidate && String(rawInput) === String(inputEl?.value || rawInput)) {
          nextCandidate = null
        }
      }

      setState({
        nextInput: String(inputEl?.value || rawInput || ''),
        nextCandidate: nextCandidate ?? resolveCandidateFromInput(String(inputEl?.value || rawInput || ''))
      })
    }

    jq(document).on('ajaxComplete.goPlacePlannerTargetTracker', jqHandler)
  }

  const init = () => {
    refreshFromDom()
    attachObserver()
    attachJqAjaxListener()
    return api
  }

  const destroy = () => {
    destroyed = true
    if (mo) {
      try { mo.disconnect() } catch (_) {}
      mo = null
    }
    if (inputEl && onInput) {
      try { inputEl.removeEventListener('input', onInput, true) } catch (_) {}
    }
    inputEl = null
    onInput = null
    if (jq && jqHandler) {
      try { jq(document).off('ajaxComplete.goPlacePlannerTargetTracker', jqHandler) } catch (_) {}
    }
    jq = null
    jqHandler = null
    subscribers.clear()
  }

  const api = {
    init,
    destroy,
    refresh: refreshFromDom,
    getActiveTarget: () => cloneTarget(activeTarget),
    getSelectedTarget: () => cloneTarget(selectedTarget),
    getSearchCandidate: () => cloneTarget(searchCandidate),
    hasTarget: () => Boolean(activeTarget && Number.isFinite(Number(activeTarget.x)) && Number.isFinite(Number(activeTarget.y))),
    subscribe(fn) {
      if (typeof fn !== 'function') return () => {}
      subscribers.add(fn)
      return () => subscribers.delete(fn)
    },
    getCachedById(id) {
      const key = String(Number(id))
      return cloneTarget(byId.get(key) || null)
    },
    getCachedByCoord(x, y) {
      return cloneTarget(byCoord.get(`${Number(x)}|${Number(y)}`) || null)
    }
  }

  return init()
}

export default createPlacePlannerTargetTracker

