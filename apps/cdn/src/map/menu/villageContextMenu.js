import '../../components/go-buttons/tw.css'
import Tooltip from '@toolkit-tw-bot/document/tooltip'
import { ProtectingBot } from '@toolkit-tw-bot/document'
import { withGroupFix } from '../../groups'
import {
  ICON_CALENDAR,
  ICON_CROSSED_SWORDS_MAP,
  ICON_GLOBE
} from '../../components/go-buttons'
import {
  getBotTooltipIconUrl,
  loadPlannerOneToMany,
  parseParam,
  renderTooltipIconText,
  stopAll
} from './shared.js'

let unbindVillageCtxTooltip = null
let villageCtxAnchorTrackingBound = false
let villageCtxBooted = false
let lastVillageCtxAnchorData = null
let lastVillageCtxAnchorPoint = null
let lastVillageCtxTriggerEl = null
let lastVillageCtxSessionId = 0
let lockedVillageCtxLayout = null
let syncingVillageCtxLayout = null
let villageCtxTimerId = null

const VILLAGE_CTX_LOCK_STABLE_COUNT = 2
const VILLAGE_CTX_LOCK_DELTA_PX = 2

function getFreshVillageCtxAnchorData() {
  if (!lastVillageCtxAnchorData) return null
  return Date.now() - lastVillageCtxAnchorData.at < 6000
    ? lastVillageCtxAnchorData
    : null
}

function ensureVillageCtxTooltipOnce() {
  if (unbindVillageCtxTooltip) return
  const tooltip = new Tooltip()
  const shouldRenderBotIconInVillageCtxTooltip = (el) => {
    if (!el) return false
    if (el.id === 'ctx_go_send' || el.id === 'ctx_go_schedule') return true
    return el.getAttribute?.('data-go-brand-tooltip') === '1'
  }
  unbindVillageCtxTooltip = tooltip.bind(document.body, '#go-village-ctx-buttons [data-go-title]', (el) => {
    const value = String(el?.getAttribute?.('data-go-title') || '').trim()
    if (!value) return null
    if (!shouldRenderBotIconInVillageCtxTooltip(el)) return value
    return renderTooltipIconText(getBotTooltipIconUrl(), value)
  })
}

function injectVillageCtxCssOnce() {
  if (document.getElementById('go-vctx-style')) return
  const style = document.createElement('style')
  style.id = 'go-vctx-style'
  style.textContent = `
    #go-village-ctx-buttons a.go-vctx-btn{
      position:absolute !important;
      display:block !important;
      opacity:1 !important;
      width:24px !important;
      height:24px !important;
      border-radius:6px !important;
      border:1px solid rgba(255,255,255,.85) !important;
      background-color: rgba(0,0,0,.55) !important;
      background-repeat:no-repeat !important;
      background-position:center !important;
      background-size: 18px 18px !important;
      cursor:pointer !important;
      pointer-events:auto !important;
      z-index:12010 !important;
      user-select:none !important;
      -webkit-user-select:none !important;
      transition: transform .10s ease, filter .10s ease, background-color .10s ease;
    }
    #go-village-ctx-buttons a#ctx_go_send.go-vctx-btn{
      background-size:24px 24px !important;
    }
    #go-village-ctx-buttons a.go-vctx-btn:hover{
      transform: translateY(-1px) scale(1.06);
      filter: brightness(1.15);
      background-color: rgba(0,0,0,.62) !important;
    }
  `
  document.head.appendChild(style)
}

function getVillageCtxContainer() {
  let wrap = document.getElementById('go-village-ctx-buttons')
  if (wrap) return wrap
  wrap = document.createElement('div')
  wrap.id = 'go-village-ctx-buttons'
  wrap.style.position = 'absolute'
  wrap.style.left = '0'
  wrap.style.top = '0'
  wrap.style.width = '0'
  wrap.style.height = '0'
  wrap.style.zIndex = '12010'
  wrap.style.pointerEvents = 'none'
  document.body.appendChild(wrap)
  return wrap
}

function getVisibleVillageCtxLinks() {
  const links = Array.from(document.querySelectorAll('a.village_ctx[id^="ctx_"]')).filter((el) => {
    if (el.id === 'ctx_go_send' || el.id === 'ctx_go_schedule') return false
    const st = window.getComputedStyle(el)
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  })

  if (!links.length) return links

  const anchorData = getFreshVillageCtxAnchorData()
  if (anchorData) {
    const targetVillageId = Number(anchorData.villageId)
    const currentVillageId = Number(anchorData.currentVillageId)
    const contextualLinks = links.filter((el) => {
      const href = el.getAttribute('href') || ''
      const linkTargetId = parseParam(href, 'id') ?? parseParam(href, 'target')
      const linkCurrentVillageId = parseParam(href, 'village')
      const targetMatches = Number.isFinite(targetVillageId) ? linkTargetId === targetVillageId : true
      const currentMatches = Number.isFinite(currentVillageId) ? linkCurrentVillageId === currentVillageId : true
      return targetMatches && currentMatches
    })

    if (contextualLinks.length) {
      return contextualLinks
    }
  }

  const anchorPoint = lastVillageCtxAnchorPoint
  const isFreshAnchor = anchorPoint && (Date.now() - anchorPoint.at < 6000)
  if (!isFreshAnchor) return links

  const distanceFromAnchor = (el) => {
    const rect = el.getBoundingClientRect()
    const cx = rect.left + (rect.width / 2)
    const cy = rect.top + (rect.height / 2)
    return Math.hypot(cx - anchorPoint.cx, cy - anchorPoint.cy)
  }

  const sorted = links
    .map((el) => ({ el, distance: distanceFromAnchor(el) }))
    .sort((left, right) => left.distance - right.distance)

  const nearest = sorted[0]
  if (!nearest) return links

  const maxDistanceFromAnchor = 96
  const clusterRadius = 72
  const cluster = sorted
    .filter((item) => (
      item.distance <= maxDistanceFromAnchor
      || Math.abs(item.distance - nearest.distance) <= clusterRadius
    ))
    .map((item) => item.el)

  return cluster.length ? cluster : [nearest.el]
}

function getPreferredVillageCtxAnchorLink(links) {
  if (!Array.isArray(links) || !links.length) return null

  const anchorData = getFreshVillageCtxAnchorData()
  if (anchorData) {
    const targetVillageId = Number(anchorData.villageId)
    const currentVillageId = Number(anchorData.currentVillageId)
    const infoLink = links.find((el) => {
      if (el.id !== 'ctx_info') return false
      const href = el.getAttribute('href') || ''
      const linkTargetId = parseParam(href, 'id') ?? parseParam(href, 'target')
      const linkCurrentVillageId = parseParam(href, 'village')
      const targetMatches = Number.isFinite(targetVillageId) ? linkTargetId === targetVillageId : true
      const currentMatches = Number.isFinite(currentVillageId) ? linkCurrentVillageId === currentVillageId : true
      return targetMatches && currentMatches
    })

    if (infoLink) return infoLink
  }

  if (lastVillageCtxTriggerEl?.isConnected) {
    const triggerRect = lastVillageCtxTriggerEl.getBoundingClientRect()
    const triggerCx = triggerRect.left + (triggerRect.width / 2)
    const triggerCy = triggerRect.top + (triggerRect.height / 2)

    return links
      .map((el) => {
        const rect = el.getBoundingClientRect()
        const cx = rect.left + (rect.width / 2)
        const cy = rect.top + (rect.height / 2)
        return {
          distance: Math.hypot(cx - triggerCx, cy - triggerCy),
          el
        }
      })
      .sort((left, right) => left.distance - right.distance)[0]?.el || null
  }

  return links.find((el) => el.id === 'ctx_info') || null
}

function computeVillageCtxCenter(links) {
  if (!Array.isArray(links) || !links.length) return null
  const preferredLink = getPreferredVillageCtxAnchorLink(links)
  if (preferredLink) {
    const rect = preferredLink.getBoundingClientRect()
    return {
      cx: rect.left + (rect.width / 2) + window.scrollX,
      cy: rect.top + (rect.height / 2) + window.scrollY
    }
  }

  const sum = links.reduce((acc, el) => {
    const rect = el.getBoundingClientRect()
    acc.x += rect.left + (rect.width / 2) + window.scrollX
    acc.y += rect.top + (rect.height / 2) + window.scrollY
    return acc
  }, { x: 0, y: 0 })
  return { cx: sum.x / links.length, cy: sum.y / links.length }
}

function onVillageCtxAnchorTrackingClick(event) {
  const target = event.target
  if (!target) return
  const trigger = target.closest?.('a.ctx, .village_anchor > .ctx')
  if (!trigger) return
  const anchorWrap = trigger.closest?.('.village_anchor.contexted, .village_anchor')
  const linkInfo = anchorWrap?.querySelector?.('a[href*="screen=info_village"]')
  const villageIdData = Number(anchorWrap?.dataset?.id)
  const playerIdData = Number(anchorWrap?.dataset?.player)
  const villageIdHref = parseParam(linkInfo?.href || '', 'id')
  const currentVillageHref = parseParam(linkInfo?.href || location.href, 'village')
  const villageId = Number.isFinite(villageIdData) ? villageIdData : (Number.isFinite(villageIdHref) ? villageIdHref : null)
  const playerId = Number.isFinite(playerIdData) ? playerIdData : null
  const rect = trigger.getBoundingClientRect()
  lastVillageCtxSessionId += 1
  lockedVillageCtxLayout = null
  syncingVillageCtxLayout = null
  lastVillageCtxTriggerEl = trigger

  lastVillageCtxAnchorData = {
    villageId,
    playerId,
    currentVillageId: Number.isFinite(currentVillageHref) ? currentVillageHref : getCurrentVillageIdFromUrl(),
    at: Date.now()
  }

  lastVillageCtxAnchorPoint = {
    cx: rect.left + (rect.width / 2),
    cy: rect.top + (rect.height / 2),
    at: Date.now()
  }
}

function bindVillageCtxAnchorTrackingOnce() {
  if (villageCtxAnchorTrackingBound) return
  villageCtxAnchorTrackingBound = true
  document.addEventListener('click', onVillageCtxAnchorTrackingClick, true)
}

function getCurrentVillageIdFromUrl() {
  try {
    const url = new URL(location.href)
    const villageId = Number(url.searchParams.get('village'))
    return Number.isFinite(villageId) ? villageId : null
  } catch (_) {
    return null
  }
}

function getCtxTargetVillageId() {
  const anchorData = getFreshVillageCtxAnchorData()
  if (anchorData?.villageId) {
    return Number(anchorData.villageId)
  }
  const infoLink = document.querySelector('#ctx_info.village_ctx')
  const href = infoLink?.href || ''
  const id = parseParam(href, 'id')
  if (Number.isFinite(id)) return id
  const any = Array.from(document.querySelectorAll('a.village_ctx[id^="ctx_"]')).find((el) => parseParam(el.href, 'id'))
  return Number(parseParam(any?.href || '', 'id')) || null
}

function getCurrentVillageIdFromCtxLinks() {
  const anchorData = getFreshVillageCtxAnchorData()
  if (anchorData?.currentVillageId) {
    return Number(anchorData.currentVillageId)
  }
  const infoLink = document.querySelector('#ctx_info.village_ctx')
  const href = infoLink?.href || location.href
  const village = parseParam(href, 'village')
  if (Number.isFinite(village)) return village
  return getCurrentVillageIdFromUrl()
}

async function resolveCoordsFromInfoVillage(targetVillageId, currentVillageId) {
  if (!Number.isFinite(targetVillageId) || !Number.isFinite(currentVillageId)) return null
  const url = withGroupFix(`${location.origin}/game.php?village=${currentVillageId}&screen=info_village&id=${targetVillageId}`)

  try {
    const response = await fetch(url, { credentials: 'include', cache: 'no-store' })
    if (!response.ok) return null
    const html = await response.text()
    const doc = new DOMParser().parseFromString(html, 'text/html')

    const mapLink = Array.from(doc.querySelectorAll('a[href*="screen=map"][href*="x="][href*="y="]'))
      .find((a) => {
        const x = parseParam(a.href, 'x')
        const y = parseParam(a.href, 'y')
        return Number.isFinite(x) && Number.isFinite(y)
      })

    if (mapLink) {
      const x = Number(parseParam(mapLink.href, 'x'))
      const y = Number(parseParam(mapLink.href, 'y'))
      if (Number.isFinite(x) && Number.isFinite(y)) return { x, y }
    }

    const titleText = doc.querySelector('#content_value h2')?.textContent || ''
    const titleMatch = titleText.match(/\((\d{1,3})\|(\d{1,3})\)\s*K\d{1,2}\b/)
    if (!titleMatch) return null
    const x = Number(titleMatch[1])
    const y = Number(titleMatch[2])
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x, y }
  } catch (_) {
    return null
  }
}

function makeVillageCtxBtn({ id, title, iconUri, onClick, brandTooltip = false }) {
  const a = document.createElement('a')
  a.className = 'go-vctx-btn'
  a.id = id
  a.href = '#'
  a.style.pointerEvents = 'auto'
  a.setAttribute('data-go-title', title)
  if (brandTooltip) a.setAttribute('data-go-brand-tooltip', '1')
  else a.removeAttribute('data-go-brand-tooltip')
  a.style.backgroundImage = `url("${iconUri}")`
  a.addEventListener('click', (event) => {
    stopAll(event)
    onClick?.()
  }, true)
  a.addEventListener('mousedown', stopAll, true)
  a.addEventListener('pointerdown', stopAll, true)
  a.addEventListener('touchstart', stopAll, true)
  return a
}

function placeVillageCtxBtn(btn, left, top) {
  if (!btn) return
  btn.style.left = `${left}px`
  btn.style.top = `${top}px`
}

function ensureVillageCtxButtons() {
  const wrap = getVillageCtxContainer()
  const mapCtx = document.getElementById('map-ctx-buttons')
  if (mapCtx) {
    wrap.replaceChildren()
    lockedVillageCtxLayout = null
    syncingVillageCtxLayout = null
    return
  }

  const visibleCtxLinks = getVisibleVillageCtxLinks()
  if (!visibleCtxLinks.length) {
    wrap.replaceChildren()
    lockedVillageCtxLayout = null
    syncingVillageCtxLayout = null
    return
  }

  const layoutSessionId = lastVillageCtxSessionId
  const measuredCenter = computeVillageCtxCenter(visibleCtxLinks)
  const center = (
    lockedVillageCtxLayout && lockedVillageCtxLayout.sessionId === layoutSessionId
      ? lockedVillageCtxLayout.center
      : measuredCenter
  )
  if (!center) return

  if (!lockedVillageCtxLayout || lockedVillageCtxLayout.sessionId !== layoutSessionId) {
    if (!syncingVillageCtxLayout || syncingVillageCtxLayout.sessionId !== layoutSessionId) {
      syncingVillageCtxLayout = {
        center: measuredCenter,
        sessionId: layoutSessionId,
        stableCount: 0
      }
    } else if (measuredCenter) {
      const dx = Math.abs(measuredCenter.cx - syncingVillageCtxLayout.center.cx)
      const dy = Math.abs(measuredCenter.cy - syncingVillageCtxLayout.center.cy)
      const isStable = dx <= VILLAGE_CTX_LOCK_DELTA_PX && dy <= VILLAGE_CTX_LOCK_DELTA_PX

      syncingVillageCtxLayout = {
        center: measuredCenter,
        sessionId: layoutSessionId,
        stableCount: isStable ? syncingVillageCtxLayout.stableCount + 1 : 0
      }

      if (syncingVillageCtxLayout.stableCount >= VILLAGE_CTX_LOCK_STABLE_COUNT) {
        lockedVillageCtxLayout = {
          center: measuredCenter,
          sessionId: layoutSessionId
        }
      }
    }
  }

  let btnSchedule = wrap.querySelector('#ctx_go_schedule')
  let btnSend = wrap.querySelector('#ctx_go_send')
  let btnOpenMap = wrap.querySelector('#ctx_go_open_map')

  if (!btnSchedule) {
    btnSchedule = makeVillageCtxBtn({
      id: 'ctx_go_schedule',
      title: 'Agendar comandos',
      iconUri: ICON_CALENDAR,
      brandTooltip: true,
      onClick: async() => {
        const id = getCtxTargetVillageId()
        const village = getCurrentVillageIdFromCtxLinks()
        if (!id || !village) return
        if (ProtectingBot['bot-protect-all-in-game'].active()) throw ProtectingBot.error()
        const coords = await resolveCoordsFromInfoVillage(id, village)
        if (!coords) return
        const plannerOneToMany = await loadPlannerOneToMany()
        await plannerOneToMany({
          id,
          playerId: lastVillageCtxAnchorData?.playerId || null,
          x: coords.x,
          y: coords.y,
          dispatchMode: 'schedule',
          mode: 'schedule'
        })
      }
    })
    wrap.appendChild(btnSchedule)
  }

  if (!btnSend) {
    btnSend = makeVillageCtxBtn({
      id: 'ctx_go_send',
      title: 'Enviar comandos',
      iconUri: ICON_CROSSED_SWORDS_MAP,
      brandTooltip: true,
      onClick: async() => {
        const id = getCtxTargetVillageId()
        const village = getCurrentVillageIdFromCtxLinks()
        if (!id || !village) return
        if (ProtectingBot['bot-protect-all-in-game'].active()) throw ProtectingBot.error()
        const coords = await resolveCoordsFromInfoVillage(id, village)
        if (!coords) return
        const plannerOneToMany = await loadPlannerOneToMany()
        await plannerOneToMany({
          id,
          playerId: lastVillageCtxAnchorData?.playerId || null,
          x: coords.x,
          y: coords.y,
          dispatchMode: 'send',
          mode: 'send'
        })
      }
    })
    wrap.appendChild(btnSend)
  }

  const targetVillageId = Number(getCtxTargetVillageId())
  const targetPlayerId = Number(lastVillageCtxAnchorData?.playerId)
  const currentVillageId = Number(window?.game_data?.village?.id || window?.game_data?.village_id || getCurrentVillageIdFromCtxLinks())
  const currentPlayerId = Number(window?.game_data?.player?.id || window?.game_data?.player_id)
  const canShowOpenMapBtn =
    Number.isFinite(targetVillageId) &&
    Number.isFinite(targetPlayerId) &&
    Number.isFinite(currentVillageId) &&
    Number.isFinite(currentPlayerId) &&
    targetPlayerId === currentPlayerId &&
    targetVillageId !== currentVillageId

  if (!canShowOpenMapBtn) {
    if (btnOpenMap) btnOpenMap.remove()
    btnOpenMap = null
  } else if (!btnOpenMap) {
    btnOpenMap = makeVillageCtxBtn({
      id: 'ctx_go_open_map',
      title: 'Abrir mapa desta vila',
      iconUri: ICON_GLOBE,
      brandTooltip: true,
      onClick: () => {
        if (ProtectingBot['bot-protect-all-in-game'].active()) throw ProtectingBot.error()
        const targetId = Number(getCtxTargetVillageId())
        if (!Number.isFinite(targetId)) return
        location.href = withGroupFix(`${location.origin}/game.php?village=${targetId}&screen=map`)
      }
    })
    wrap.appendChild(btnOpenMap)
  }

  placeVillageCtxBtn(
    btnSchedule,
    Math.round(center.cx - 34 - 12),
    Math.round(center.cy - 54 - 12)
  )
  placeVillageCtxBtn(
    btnSend,
    Math.round(center.cx + 32 - 12),
    Math.round(center.cy - 54 - 12)
  )
  placeVillageCtxBtn(btnOpenMap, Math.round(center.cx - 14), Math.round(center.cy - 74 - 12))
}

export function bootCtxMenuRunning() {
  if (villageCtxBooted) return
  villageCtxBooted = true
  bindVillageCtxAnchorTrackingOnce()
  injectVillageCtxCssOnce()
  ensureVillageCtxTooltipOnce()
  let tries = 0
  villageCtxTimerId = setInterval(() => {
    tries++
    ensureVillageCtxButtons()
    if (tries > 2000) {
      clearInterval(villageCtxTimerId)
      villageCtxTimerId = null
    }
    if (ProtectingBot['bot-protect-all-in-game'].active()) {
      clearInterval(villageCtxTimerId)
      villageCtxTimerId = null
    }
  }, 150)
}

export function destroyCtxMenuRunning() {
  if (villageCtxTimerId != null) {
    clearInterval(villageCtxTimerId)
    villageCtxTimerId = null
  }

  if (villageCtxAnchorTrackingBound) {
    villageCtxAnchorTrackingBound = false
    document.removeEventListener('click', onVillageCtxAnchorTrackingClick, true)
  }

  unbindVillageCtxTooltip?.()
  unbindVillageCtxTooltip = null

  document.getElementById('go-village-ctx-buttons')?.remove?.()

  villageCtxBooted = false
  lastVillageCtxAnchorData = null
  lastVillageCtxAnchorPoint = null
  lastVillageCtxTriggerEl = null
  lockedVillageCtxLayout = null
  syncingVillageCtxLayout = null
}
