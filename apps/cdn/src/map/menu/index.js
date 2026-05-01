import '../../components/go-buttons/tw.css'
import Tooltip from '@toolkit-tw-bot/document/tooltip'
import { ProtectingBot } from '@toolkit-tw-bot/document'
import { withGroupFix } from '../../groups'
import {
  ICON_CALENDAR,
  ICON_CENTER,
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

const GO = {
  BTN_SIZE: 23,
  DEBUG: false,
  POS: {
    schedule: { dx: -34, dy: -54 },
    list: { dx: 32, dy: -54 },
    map: { dx: 32, dy: 52 },
    center: { dx: -32, dy: 52 }
  }
}

const log = (...args) => GO.DEBUG && console.log('[GO-MP]', ...args)

function qs(sel, root) {
  return (root || document).querySelector(sel)
}

let unbindMapCtxTooltip = null

function ensureMapCtxTooltipOnce() {
  if (unbindMapCtxTooltip) return
  const tooltip = new Tooltip()
  unbindMapCtxTooltip = tooltip.bind(document.body, '#map-ctx-buttons .go-mp-btn', (el) => {
    const value = String(
      el?.getAttribute?.('data-go-title') ||
      el?.getAttribute?.('data-title') ||
      el?.getAttribute?.('title') ||
      ''
    ).trim()
    if (!value) return null
    return renderTooltipIconText(getBotTooltipIconUrl(), value)
  })
}

function injectCssOnce() {
  if (document.getElementById('go-mp-style')) return
  const style = document.createElement('style')
  style.id = 'go-mp-style'
  style.textContent = `
    #map-ctx-buttons a.go-mp-btn{
      position:absolute !important;
      display:block !important;
      opacity:1 !important;
      width:${GO.BTN_SIZE}px !important;
      height:${GO.BTN_SIZE}px !important;
      line-height:${GO.BTN_SIZE}px !important;
      border-radius:6px !important;
      border:1px solid rgba(255,255,255,.85) !important;
      background-color: rgba(0,0,0,.55) !important;
      background-repeat:no-repeat !important;
      background-position:center !important;
      background-size: 18px 18px !important;
      cursor:pointer !important;
      pointer-events: auto !important;
      z-index: 999999 !important;
      user-select:none !important;
      -webkit-user-select:none !important;
      transition: transform .10s ease, filter .10s ease, background-color .10s ease;
    }
    #map-ctx-buttons a#mp_go_map.go-mp-btn{
      background-size: 23px 23px !important;
    }
    #map-ctx-buttons a#mp_go_list.go-mp-btn{
      background-size: ${GO.BTN_SIZE}px ${GO.BTN_SIZE}px !important;
    }
    #map-ctx-buttons a.go-mp-btn:hover{
      transform: translateY(-1px) scale(1.06);
      filter: brightness(1.15);
      background-color: rgba(0,0,0,.62) !important;
    }
    #map-ctx-buttons a.go-mp-btn:active{
      transform: scale(0.98);
      filter: brightness(1.05);
    }
  `
  document.head.appendChild(style)
}

function getVillageIdFromMenuLinks(ctxButtons) {
  const mpInfo = qs('#mp_info', ctxButtons)
  if (mpInfo && mpInfo.href) {
    const id = parseParam(mpInfo.href, 'id')
    if (Number.isFinite(id)) return id
  }
  return null
}

function getCoordsFromCurFocus(twctx) {
  const focus = twctx && Number.isFinite(twctx._curFocus) ? twctx._curFocus : null
  if (!focus || focus <= 0) return null
  const x = Math.floor(focus / 1000)
  const y = focus % 1000
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

function getCtxDataFlat(ctxButtons, twctx) {
  const id = getVillageIdFromMenuLinks(ctxButtons)
  const coords = getCoordsFromCurFocus(twctx)
  return { id, x: coords ? coords.x : null, y: coords ? coords.y : null }
}

function isOwnVillageCtx(ctxButtons) {
  const recruit = qs('#mp_recruit', ctxButtons)
  if (recruit) {
    const st = window.getComputedStyle(recruit)
    const visible =
      st.display !== 'none' &&
      st.visibility !== 'hidden' &&
      st.opacity !== '0'
    if (visible) return true
  }

  const overview = qs('#mp_overview', ctxButtons)
  if (overview) {
    const st = window.getComputedStyle(overview)
    const visible =
      st.display !== 'none' &&
      st.visibility !== 'hidden' &&
      st.opacity !== '0'
    if (visible) return true
  }

  return false
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

function getCenteredCoordsFromHash() {
  const hash = String(location.hash || '').replace('#', '').trim()
  const match = hash.match(/^(\d{1,3});(\d{1,3})/)
  if (!match) return null
  const x = Number(match[1])
  const y = Number(match[2])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

function getCurrentVillageId() {
  try {
    const gd = window.game_data || {}
    const id = Number(gd.village && gd.village.id ? gd.village.id : gd.village_id)
    if (Number.isFinite(id)) return id
  } catch (_) {}
  return getCurrentVillageIdFromUrl()
}

function getActiveOrderArray(ctxButtons, twctx) {
  if (!twctx) return null
  return isOwnVillageCtx(ctxButtons) ? twctx._ownOrder : twctx._otherOrder
}

function computeCenter(ctxButtons, twctx) {
  const mpInfo = qs('#mp_info', ctxButtons)
  if (!mpInfo) return null

  const left = parseFloat(mpInfo.style.left || 'NaN')
  const top = parseFloat(mpInfo.style.top || 'NaN')
  if (!isFinite(left) || !isFinite(top)) return null

  const order = getActiveOrderArray(ctxButtons, twctx)
  const circle = twctx && twctx._circlePos
  if (!order || !circle || !Array.isArray(order) || !Array.isArray(circle)) return null

  const idx = order.indexOf('mp_info')
  if (idx < 0 || !circle[idx]) return null

  const off = circle[idx]
  const dx = Number(off[0] || 0)
  const dy = Number(off[1] || 0)

  return { cx: left - dx, cy: top - dy }
}

function makeBtn({ id, title, iconUri, onClick }) {
  const a = document.createElement('a')
  a.className = 'mp go-mp-btn'
  a.id = id
  a.href = '#'
  a.title = title
  a.setAttribute('data-title', title)
  a.setAttribute('data-go-title', title)
  a.removeAttribute('title')
  a.style.backgroundImage = `url("${iconUri}")`

  a.addEventListener('pointerdown', stopAll, true)
  a.addEventListener('mousedown', stopAll, true)
  a.addEventListener('touchstart', stopAll, true)
  a.addEventListener('click', (event) => {
    stopAll(event)
    try {
      onClick()
    } catch (error) {
      console.error('[GO-MP] click error', error)
    }
    return false
  }, true)

  return a
}

function removeButtons(ctxButtons) {
  const ids = ['mp_go_schedule', 'mp_go_list', 'mp_go_map', 'mp_go_center']

  for (const id of ids) {
    const el = qs(`#${id}`, ctxButtons)
    if (el) el.remove()
  }

  if (ctxButtons.__go_prevZ !== undefined) {
    ctxButtons.style.zIndex = ctxButtons.__go_prevZ
    delete ctxButtons.__go_prevZ
  }
}

function ensureButtons(reason) {
  const twctx = window.TWMap?.context
  const ctxButtons = document.getElementById('map-ctx-buttons')
  if (!twctx || !ctxButtons) return

  if (!twctx._visible) {
    removeButtons(ctxButtons)
    return
  }

  if (ctxButtons.__go_prevZ === undefined) ctxButtons.__go_prevZ = ctxButtons.style.zIndex || ''
  ctxButtons.style.zIndex = '999999'

  const center = computeCenter(ctxButtons, twctx)
  if (!center) {
    log('abort: sem center ainda', reason)
    return
  }

  injectCssOnce()

  let btnCal = qs('#mp_go_schedule', ctxButtons)
  let btnSearch = qs('#mp_go_list', ctxButtons)
  let btnMap = qs('#mp_go_map', ctxButtons)
  let btnCenter = qs('#mp_go_center', ctxButtons)

  if (!btnCal) {
    btnCal = makeBtn({
      id: 'mp_go_schedule',
      title: 'Agendar comandos',
      iconUri: ICON_CALENDAR,
      onClick: async() => {
        const data = {
          ...getCtxDataFlat(ctxButtons, twctx),
          dispatchMode: 'schedule',
          mode: 'schedule'
        }
        if (ProtectingBot['bot-protect-all-in-game'].active()) {
          throw ProtectingBot.error()
        }
        const plannerOneToMany = await loadPlannerOneToMany()
        await plannerOneToMany(data)
      }
    })
    ctxButtons.appendChild(btnCal)
  }

  if (!btnSearch) {
    btnSearch = makeBtn({
      id: 'mp_go_list',
      title: 'Enviar comandos',
      iconUri: ICON_CROSSED_SWORDS_MAP,
      onClick: async() => {
        const data = {
          ...getCtxDataFlat(ctxButtons, twctx),
          dispatchMode: 'send',
          mode: 'send'
        }
        if (ProtectingBot['bot-protect-all-in-game'].active()) {
          throw ProtectingBot.error()
        }
        const plannerOneToMany = await loadPlannerOneToMany()
        await plannerOneToMany(data)
      }
    })
    ctxButtons.appendChild(btnSearch)
  }

  const focusedId = getVillageIdFromMenuLinks(ctxButtons)
  const currentId = getCurrentVillageId()
  const canShowMapBtn =
    isOwnVillageCtx(ctxButtons) &&
    focusedId &&
    currentId &&
    focusedId !== currentId

  if (!canShowMapBtn) {
    if (btnMap) btnMap.remove()
    btnMap = null
  } else if (!btnMap) {
    btnMap = makeBtn({
      id: 'mp_go_map',
      title: 'Abrir mapa desta vila',
      iconUri: ICON_GLOBE,
      onClick: () => {
        const data = getCtxDataFlat(ctxButtons, twctx)
        if (!data.id) return
        if (ProtectingBot['bot-protect-all-in-game'].active()) {
          throw ProtectingBot.error()
        }
        location.href = withGroupFix(`${location.origin}/game.php?village=${data.id}&screen=map`)
      }
    })
    ctxButtons.appendChild(btnMap)
  }

  const dataNow = getCtxDataFlat(ctxButtons, twctx)
  const curCenter = getCenteredCoordsFromHash()
  const curVillageId = getCurrentVillageId()
  const isAlreadyCentered =
    !!curCenter &&
    Number.isFinite(dataNow.x) &&
    Number.isFinite(dataNow.y) &&
    dataNow.x === curCenter.x &&
    dataNow.y === curCenter.y

  const canShowCenterBtn =
    !!curVillageId &&
    Number.isFinite(dataNow.x) &&
    Number.isFinite(dataNow.y) &&
    !isAlreadyCentered

  if (!canShowCenterBtn) {
    if (btnCenter) btnCenter.remove()
    btnCenter = null
  } else if (!btnCenter) {
    btnCenter = makeBtn({
      id: 'mp_go_center',
      title: 'Centralizar no mapa',
      iconUri: ICON_CENTER,
      onClick: () => {
        const data = getCtxDataFlat(ctxButtons, twctx)
        const villageId = getCurrentVillageId()
        if (!villageId || !Number.isFinite(data.x) || !Number.isFinite(data.y)) return
        if (ProtectingBot['bot-protect-all-in-game'].active()) {
          throw ProtectingBot.error()
        }

        const url =
          `${location.origin}/game.php?village=${villageId}` +
          `&screen=map&x=${data.x}&y=${data.y}&beacon`

        location.href = withGroupFix(url)
      }
    })
    ctxButtons.appendChild(btnCenter)
  }

  function place(btn, pos) {
    if (!btn || !pos) return
    btn.style.left = `${center.cx + pos.dx - (GO.BTN_SIZE / 2)}px`
    btn.style.top = `${center.cy + pos.dy - (GO.BTN_SIZE / 2)}px`
  }

  place(btnCal, GO.POS.schedule)
  place(btnSearch, GO.POS.list)
  place(btnMap, GO.POS.map)
  place(btnCenter, GO.POS.center)

  log('ok: updated', { reason, cx: center.cx, cy: center.cy })
}

function patchContextWhenReady() {
  const twctx = window.TWMap?.context
  if (!twctx) return false
  if (twctx.__go_patched) return true
  twctx.__go_patched = true

  injectCssOnce()
  ensureMapCtxTooltipOnce()

  if (typeof twctx.spawn === 'function') {
    const origSpawn = twctx.spawn
    twctx.spawn = function () {
      const result = origSpawn.apply(this, arguments)
      requestAnimationFrame(() => {
        ensureButtons('spawn')
      })
      return result
    }
  }

  if (typeof twctx.ajaxDone === 'function') {
    const origAjaxDone = twctx.ajaxDone
    twctx.ajaxDone = function () {
      const result = origAjaxDone.apply(this, arguments)
      requestAnimationFrame(() => {
        ensureButtons('ajaxDone')
      })
      return result
    }
  }

  if (typeof twctx.hide === 'function') {
    const origHide = twctx.hide
    twctx.hide = function () {
      try {
        const ctxButtons = document.getElementById('map-ctx-buttons')
        if (ctxButtons) removeButtons(ctxButtons)
      } catch (_) {}
      return origHide.apply(this, arguments)
    }
  }

  const ctxButtons = document.getElementById('map-ctx-buttons')
  if (ctxButtons && !ctxButtons.__go_observed) {
    ctxButtons.__go_observed = true
    try {
      const mo = new MutationObserver(() => {
        if (window.TWMap?.context?._visible) {
          ensureButtons('mo')
        }
      })
      mo.observe(ctxButtons, { childList: true, subtree: false, attributes: true, attributeFilter: ['style'] })
    } catch (_) {}
  }

  log('context patched')
  return true
}

export function bootMapMenuRunning() {
  let tries = 0
  const timer = setInterval(() => {
    tries++
    const ok = patchContextWhenReady()
    if (ok || tries > 200) clearInterval(timer)
    if (ProtectingBot['bot-protect-all-in-game'].active()) {
      clearInterval(timer)
      throw ProtectingBot.error()
    }
  }, 150)
}
