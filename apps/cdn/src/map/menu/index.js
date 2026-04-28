import '../../components/go-buttons/tw.css'
import '../../components/go-buttons/planner-action-buttons.css'
import Tooltip from '@toolkit-tw-bot/document/tooltip'
import { ProtectingBot } from '@toolkit-tw-bot/document'
import { printMessage } from '../../components/printMessage'
import { withGroupFix } from '../../groups'
import { 
  createBtnSearch, 
  ICON_CALENDAR, 
  ICON_CENTER, 
  ICON_CROSSED_SWORDS_MAP, 
  ICON_GLOBE, 
  ICON_SEARCH 
} from '../../components/go-buttons'
import { extensionId } from '@toolkit-tw-bot/release'

const GO = {
  BTN_SIZE: 23,
  DEBUG: false,

  // offsets a partir do centro do menu (cx, cy)
  POS: {
    schedule: { dx: -34, dy: -54 }, // ajuste como quiser
    list:     { dx:  32, dy: -54 }, // ajuste como quiser
    map:      { dx:  32, dy:  52 }, // seu quadrado vermelho
    center:   { dx: -32, dy:  52 }, // NOVO: centralizar no mapa (todas)
  },
};

const log = (...a) => GO.DEBUG && console.log('[GO-MP]', ...a);
function qs(sel, root) { return (root || document).querySelector(sel); }
let unbindMapTooltip = null
let mapCollectorLauncherActive = false
let mapCollectorLauncherHashListenerBound = false
let mapCollectorLauncherBooted = false
let mapCollectorLauncherStateListenerBound = false
let mapCollectorLauncherEscRestoreBound = false
const MAP_COLLECTOR_LAUNCHER_ID = 'go-map-collector-launcher'
const MAP_COLLECTOR_EXTERNAL_TOP_WRAP_ID = 'go-map-collector-launcher-external-wrap'
const MAP_COLLECTOR_EXTERNAL_TOP_BTN_ID = 'go-map-collector-launcher-external'
const MAP_COLLECTOR_EXTERNAL_TABLE_WRAP_ID = 'go-map-collector-launcher-table-wrap'
const MAP_COLLECTOR_EXTERNAL_TABLE_BTN_ID = 'go-map-collector-launcher-table'
const DEFAULT_BOT_ICON_URL = `chrome-extension://${extensionId}/icons/ico.green.128.png`;
let plannerOneToManyModulePromise = null
let selectorCoordsSearchModulePromise = null

async function loadPlannerOneToMany() {
  if (!plannerOneToManyModulePromise) {
    plannerOneToManyModulePromise = import('../../planner').then((module) => module?.plannerOneToMany)
  }
  const plannerOneToMany = await plannerOneToManyModulePromise
  if (typeof plannerOneToMany !== 'function') {
    throw new Error('[GO][Planner] plannerOneToMany not available')
  }
  return plannerOneToMany
}

async function loadSelectorCoordsSearch() {
  if (!selectorCoordsSearchModulePromise) {
    selectorCoordsSearchModulePromise = import('../selectorCoordsSearch.js')
      .then((module) => module?.selectorCoordsSearch)
      .catch((error) => {
        selectorCoordsSearchModulePromise = null
        throw error
      })
  }
  const selectorCoordsSearch = await selectorCoordsSearchModulePromise
  if (typeof selectorCoordsSearch !== 'function') {
    selectorCoordsSearchModulePromise = null
    throw new Error('[GO][Collector] selectorCoordsSearch not available')
  }
  return selectorCoordsSearch
}

function getBotTooltipIconUrl() {
  const candidates = [
    window.ICON_48_URL,
    DEFAULT_BOT_ICON_URL
  ]
  return candidates
    .map((value) => String(value || '').trim())
    .find((url) => (
      /^https?:\/\//i.test(url)
      || /^chrome-extension:\/\//i.test(url)
      || /^moz-extension:\/\//i.test(url)
      || /^data:image\//i.test(url)
    )) || ''
}

function renderTooltipIconText(iconUrl, text) {
  const safeText = String(text || '').trim()
  if (!safeText) return null
  if (!iconUrl) return safeText
  return `
    <div style="display:flex;align-items:center;gap:6px;">
      <span style="
        width:16px;
        height:16px;
        border-radius:999px;
        display:inline-block;
        flex:0 0 auto;
        background-image:url('${iconUrl}');
        background-position:center;
        background-repeat:no-repeat;
        background-size:contain;
      "></span>
      <span>${safeText}</span>
    </div>
  `
}

function shouldRenderBotIconInMapTooltip(el) {
  if (!el) return false
  if (el.id === MAP_COLLECTOR_LAUNCHER_ID) return true
  if (el.id === MAP_COLLECTOR_EXTERNAL_TOP_BTN_ID) return true
  if (el.id === MAP_COLLECTOR_EXTERNAL_TABLE_BTN_ID) return true
  if (el.closest?.('#map-ctx-buttons')) return true

  if (el.closest?.('#go-map-collector-view')) {
    return el.getAttribute?.('data-go-brand-tooltip') === '1'
  }

  return false
}

function ensureMapTooltipOnce() {
  if (unbindMapTooltip) return
  const tooltip = new Tooltip()
  unbindMapTooltip = tooltip.bind(
    document.body,
    `#map-ctx-buttons .go-mp-btn, #${MAP_COLLECTOR_LAUNCHER_ID}, #${MAP_COLLECTOR_EXTERNAL_TOP_BTN_ID}, #${MAP_COLLECTOR_EXTERNAL_TABLE_BTN_ID}, #go-map-collector-view [data-go-title]`,
    (el) => {
      const value = String(
        el?.getAttribute?.('data-go-title') ||
        el?.getAttribute?.('data-title') ||
        el?.getAttribute?.('title') ||
        ''
      ).trim()
      if (!value) return null
      if (!shouldRenderBotIconInMapTooltip(el)) return value
      return renderTooltipIconText(getBotTooltipIconUrl(), value)
    }
  )
}

function injectMapCollectorLauncherCssOnce() {
  if (document.getElementById('go-map-collector-launcher-style')) return
  const style = document.createElement('style')
  style.id = 'go-map-collector-launcher-style'
  style.textContent = `
    #go-map-collector-launcher{
      position:absolute;
      display:none;
      width:26px;
      height:26px;
      border-radius:999px;
      border:1px solid rgba(255,255,255,.85);
      background: rgba(0,0,0,.55) no-repeat center center;
      background-size:18px 18px;
      box-shadow: 0 1px 2px rgba(0,0,0,.35);
      cursor:pointer;
      z-index: 1000;
      transform: translate(-50%, -50%);
      pointer-events:auto;
      transition: transform .10s ease, filter .10s ease, background-color .10s ease;
    }
    #go-map-collector-launcher:hover{
      transform: translate(-50%, -50%) scale(1.05);
      filter: brightness(1.12);
      background-color: rgba(0,0,0,.62);
    }
    #go-map-collector-launcher.is-active{
      background-color: rgba(30, 64, 175, .78);
      border-color: rgba(191, 219, 254, .95);
    }
  `
  document.head.appendChild(style)
}

function getMapCanvasElement() {
  return (
    document.getElementById('map') ||
    document.querySelector('#map_container') ||
    document.querySelector('#content_value')
  )
}

function isElementVisible(el) {
  if (!el) return false
  const st = window.getComputedStyle(el)
  if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function isMapContextVisible() {
  try {
    return !!window.TWMap?.context?._visible
  } catch (_) {}
  return false
}

function isExecutionRunningVisible() {
  return !!document.querySelector('.go-ef-overlay.is-active')
}

function getCenterTileLocalPixelFromHash() {
  const center = getCenteredCoordsFromHash()
  if (!center) return null

  const TWMap = window.TWMap
  const map = TWMap?.map
  const size = TWMap?.size
  const tileSize = TWMap?.tileSize
  const pos = map?.pos
  const coordByPixel = map?.coordByPixel
  if (
    !Array.isArray(size) ||
    !Array.isArray(tileSize) ||
    typeof coordByPixel !== 'function' ||
    !pos ||
    typeof pos !== 'object'
  ) {
    return null
  }

  const cols = Number(size[0] || 0)
  const rows = Number(size[1] || 0)
  const tileW = Number(tileSize[0] || 0)
  const tileH = Number(tileSize[1] || 0)
  const posXRaw = pos[0]
  const posYRaw = pos[1]
  const posX = Number(posXRaw)
  const posY = Number(posYRaw)
  if (!cols || !rows || !tileW || !tileH) return null
  if (!Number.isFinite(posX) || !Number.isFinite(posY)) return null

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const worldX = posX + (tileW * col)
      const worldY = posY + (tileH * row)
      let coord = null
      try {
        coord = coordByPixel(worldX, worldY)
      } catch (_) {
        return null
      }
      const x = Array.isArray(coord) ? Number(coord[0]) : NaN
      const y = Array.isArray(coord) ? Number(coord[1]) : NaN
      if (x === center.x && y === center.y) {
        return { left: col * tileW, top: row * tileH, tileW, tileH, x, y }
      }
    }
  }

  return null
}

function getOrCreateMapCollectorLauncher() {
  let btn = document.getElementById(MAP_COLLECTOR_LAUNCHER_ID)
  if (btn) return btn
  btn = document.createElement('a')
  btn.id = MAP_COLLECTOR_LAUNCHER_ID
  btn.href = '#'
  btn.setAttribute('data-go-title', 'Coletor Master')
  btn.style.backgroundImage = `url("${ICON_SEARCH}")`
  btn.addEventListener('pointerdown', stopAll, true)
  btn.addEventListener('mousedown', stopAll, true)
  btn.addEventListener('touchstart', stopAll, true)
  btn.addEventListener('click', openMapCollectorFromLauncher, true)
  const mapWrap = document.querySelector('#map_wrap')
  ;(mapWrap || document.body).appendChild(btn)
  return btn
}

async function openMapCollectorFromLauncher(event) {
  stopAll(event)
  try {
    if (window.TWMap?.context?._visible && typeof window.TWMap.context.hide === 'function') {
      window.TWMap.context.hide()
    }
  } catch (_) {}

  try {
    const selectorCoordsSearch = await loadSelectorCoordsSearch()
    selectorCoordsSearch({
      hash: String(location.hash || ''),
      href: location.href,
    })
  } catch (error) {
    console.error('[GO][Collector] failed to open selector', error)
    printMessage.error('Erro ao abrir coletor no mapa.')
    return false
  }
  syncMapCollectorLaunchersState()
  return false
}

function isMapCollectorPopupOpen() {
  return Boolean(document.querySelector('#go-map-collector-view.is-open'))
}

function syncMapCollectorLaunchersState() {
  const isOpen = isMapCollectorPopupOpen()
  const mapLauncher = document.getElementById(MAP_COLLECTOR_LAUNCHER_ID)
  if (mapLauncher) {
    mapLauncher.style.display = isOpen ? 'none' : 'block'
  }
  const externalButtonIds = [MAP_COLLECTOR_EXTERNAL_TOP_BTN_ID, MAP_COLLECTOR_EXTERNAL_TABLE_BTN_ID]
  externalButtonIds.forEach((id) => {
    const btn = document.getElementById(id)
    if (!btn) return
    btn.disabled = isOpen
    btn.setAttribute('aria-disabled', isOpen ? 'true' : 'false')
  })
}

function bindMapCollectorLauncherStateListenersOnce() {
  if (mapCollectorLauncherStateListenerBound) return
  mapCollectorLauncherStateListenerBound = true
  const syncState = () => syncMapCollectorLaunchersState()
  const syncPlannerClose = () => {
    ensureMapCollectorLauncher()
    syncMapCollectorLaunchersState()
    requestAnimationFrame(() => {
      ensureMapCollectorLauncher()
      syncMapCollectorLaunchersState()
    })
    setTimeout(() => {
      ensureMapCollectorLauncher()
      syncMapCollectorLaunchersState()
    }, 0)
  }
  document.addEventListener('go:collector-base:open', syncState, true)
  document.addEventListener('go:collector-base:close', syncState, true)
  document.addEventListener('go:planner:close', syncPlannerClose, true)
}

function bindMapCollectorLauncherEscRestoreOnce() {
  if (mapCollectorLauncherEscRestoreBound) return
  mapCollectorLauncherEscRestoreBound = true
  document.addEventListener('keydown', (event) => {
    const isEsc = event?.key === 'Escape' || event?.key === 'Esc' || event?.keyCode === 27
    if (!isEsc) return
    setTimeout(() => {
      const plannerOpen = Boolean(document.querySelector('#go-popup-map-planner'))
      const collectorOpen = Boolean(document.querySelector('#go-map-collector-view.is-open'))
      if (plannerOpen || collectorOpen) return
      ensureMapCollectorLauncher()
      syncMapCollectorLaunchersState()
    }, 0)
  }, true)
}

function getOrCreateMapCollectorExternalLauncher({ wrapId, buttonId, anchorSelector, margin = '0 0 6px 0' } = {}) {
  const anchor = document.querySelector(anchorSelector)
  if (!anchor?.parentElement) return null

  let wrap = document.getElementById(wrapId)
  if (!wrap) {
    wrap = document.createElement('div')
    wrap.id = wrapId
    wrap.className = 'go-planner-action-buttons go-collector-launcher-buttons'
    wrap.style.position = 'static'
    wrap.style.top = 'auto'
    wrap.style.right = 'auto'
    wrap.style.width = '100%'
    wrap.style.justifyContent = 'flex-start'
    wrap.style.margin = margin

    const btn = createBtnSearch(wrap, {
      size: 24,
      className: 'go-btn-inline go-btn-inline-search',
      title: 'Abrir coletor',
      onClick: openMapCollectorFromLauncher
    })
    btn.id = buttonId
    btn.setAttribute('aria-label', 'Abrir coletor do mapa')
    btn.setAttribute('data-go-title', 'Coletor Master')
    btn.setAttribute('data-go-brand-tooltip', '1')
    btn.removeAttribute('title')
  }

  if (wrap.parentElement !== anchor.parentElement || wrap.nextElementSibling !== anchor) {
    anchor.parentElement.insertBefore(wrap, anchor)
  }

  return wrap
}

function ensureMapCollectorLauncher() {
  injectMapCollectorLauncherCssOnce()
  ensureMapTooltipOnce()
  bindMapCollectorLauncherStateListenersOnce()
  bindMapCollectorLauncherEscRestoreOnce()
  getOrCreateMapCollectorExternalLauncher({
    wrapId: MAP_COLLECTOR_EXTERNAL_TOP_WRAP_ID,
    buttonId: MAP_COLLECTOR_EXTERNAL_TOP_BTN_ID,
    anchorSelector: '#map_config',
    margin: '0 0 6px 0'
  })
  getOrCreateMapCollectorExternalLauncher({
    wrapId: MAP_COLLECTOR_EXTERNAL_TABLE_WRAP_ID,
    buttonId: MAP_COLLECTOR_EXTERNAL_TABLE_BTN_ID,
    anchorSelector: '#content_value > table',
    margin: '0 0 6px 0'
  })

  const btn = getOrCreateMapCollectorLauncher()
  const mapWrap = document.querySelector('#map_wrap')
  if (mapWrap && btn.parentElement !== mapWrap) mapWrap.appendChild(btn)
  const selectorOpen = Boolean(document.querySelector('#go-map-collector-view.is-open'))
  syncMapCollectorLaunchersState()
  if (selectorOpen) {
    btn.style.display = 'none'
    return
  }
  btn.style.left = 'auto'
  btn.style.right = '-8px'
  btn.style.top = '50%'
  btn.style.display = 'block'
}

function hideMapCollectorLauncher() {
  const btn = document.getElementById('go-map-collector-launcher')
  if (btn) btn.style.display = 'none'
}

function injectCssOnce() {
  if (document.getElementById('go-mp-style')) return;
  const style = document.createElement('style');
  style.id = 'go-mp-style';
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

    /* Ícone do globo um pouco maior (só o desenho, não o botão) */
    #map-ctx-buttons a#mp_go_map.go-mp-btn{
      background-size: 23px 23px !important;
    }
    /* Swords um pouco maior para manter legibilidade no mapa */
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
  `;
  document.head.appendChild(style);
}

function parseParam(href, key) {
  if (!href) return null;
  const re = new RegExp('[?&]' + key + '=(\\d+)');
  const m = String(href).match(re);
  return m ? Number(m[1]) : null;
}

function getVillageIdFromMenuLinks(ctxButtons) {
  const mpInfo = qs('#mp_info', ctxButtons);
  if (mpInfo && mpInfo.href) {
    const id = parseParam(mpInfo.href, 'id');
    if (Number.isFinite(id)) return id;
  }
  return null;
}

function getCoordsFromCurFocus(twctx) {
  const f = twctx && Number.isFinite(twctx._curFocus) ? twctx._curFocus : null;
  if (!f || f <= 0) return null;
  const x = Math.floor(f / 1000);
  const y = f % 1000;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function getCtxDataFlat(ctxButtons, twctx) {
  const id = getVillageIdFromMenuLinks(ctxButtons);
  const c = getCoordsFromCurFocus(twctx);
  return { id, x: c ? c.x : null, y: c ? c.y : null };
}

function isOwnVillageCtx(ctxButtons) {
  // Vila própria: mp_recruit existe e está visível (regra principal)
  const recruit = qs('#mp_recruit', ctxButtons);
  if (recruit) {
    const st = window.getComputedStyle(recruit);
    const visible =
      st.display !== 'none' &&
      st.visibility !== 'hidden' &&
      st.opacity !== '0';
    if (visible) return true;
  }

  // Fallback: se o TW não estiver mostrando recruit por algum motivo,
  // ainda pode ser vila própria se tiver mp_overview visível
  const overview = qs('#mp_overview', ctxButtons);
  if (overview) {
    const st = window.getComputedStyle(overview);
    const visible =
      st.display !== 'none' &&
      st.visibility !== 'hidden' &&
      st.opacity !== '0';
    if (visible) return true;
  }

  return false;
}

function getCurrentVillageIdFromUrl() {
  try {
    const u = new URL(location.href);
    const v = Number(u.searchParams.get('village'));
    return Number.isFinite(v) ? v : null;
  } catch (_) {
    return null;
  }
}

function getCenteredCoordsFromHash() {
  // exemplos: "#343;269" ou "#343;269;1" (varia)
  const h = String(location.hash || '').replace('#', '').trim();
  const m = h.match(/^(\d{1,3});(\d{1,3})/);
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function getCurrentVillageId() {
  try {
    const gd = window.game_data || {};
    const id = Number(gd.village && gd.village.id ? gd.village.id : gd.village_id);
    if (Number.isFinite(id)) return id;
  } catch (_) {}
  // fallback: URL (como você comentou)
  return getCurrentVillageIdFromUrl();
}

function getActiveOrderArray(ctxButtons, twctx) {
  const isOwn = isOwnVillageCtx(ctxButtons);
  if (!twctx) return null;
  return isOwn ? twctx._ownOrder : twctx._otherOrder;
}

function computeCenter(ctxButtons, twctx) {
  const mpInfo = qs('#mp_info', ctxButtons);
  if (!mpInfo) return null;

  const left = parseFloat(mpInfo.style.left || 'NaN');
  const top = parseFloat(mpInfo.style.top || 'NaN');
  if (!isFinite(left) || !isFinite(top)) return null;

  const order = getActiveOrderArray(ctxButtons, twctx);
  const circle = twctx && twctx._circlePos;
  if (!order || !circle || !Array.isArray(order) || !Array.isArray(circle)) return null;

  const idx = order.indexOf('mp_info');
  if (idx < 0 || !circle[idx]) return null;

  const off = circle[idx];
  const dx = Number(off[0] || 0);
  const dy = Number(off[1] || 0);

  return { cx: left - dx, cy: top - dy };
}

function stopAll(e) {
  e.preventDefault();
  e.stopPropagation();
  if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
  return false;
}

function makeBtn({ id, title, iconUri, onClick }) {
  const a = document.createElement('a');
  a.className = 'mp go-mp-btn';
  a.id = id;
  a.href = '#';

  a.title = title;
  a.setAttribute('data-title', title);
  a.setAttribute('data-go-title', title);
  a.removeAttribute('title');
  a.style.backgroundImage = `url("${iconUri}")`;

  a.addEventListener('pointerdown', stopAll, true);
  a.addEventListener('mousedown', stopAll, true);
  a.addEventListener('touchstart', stopAll, true);

  a.addEventListener('click', function (e) {
    stopAll(e);
    try { onClick(); } catch (err) { console.error('[GO-MP] click error', err); }
    return false;
  }, true);

  return a;
}

function removeButtons(ctxButtons) {
  const ids = ['mp_go_schedule', 'mp_go_list', 'mp_go_map', 'mp_go_center'];

  for (const id of ids) {
    const el = qs('#' + id, ctxButtons);
    if (el) el.remove();
  }
  if (ctxButtons.__go_prevZ !== undefined) {
    ctxButtons.style.zIndex = ctxButtons.__go_prevZ;
    delete ctxButtons.__go_prevZ;
  }
}

function ensureButtons(reason) {
  const TWMap = window.TWMap;
  const twctx = TWMap && TWMap.context;
  const ctxButtons = document.getElementById('map-ctx-buttons');
  if (!twctx || !ctxButtons) return;

  // se o menu não está visível, remove nossos botões e sai
  if (!twctx._visible) {
    removeButtons(ctxButtons);
    return;
  }

  // sobe o container só enquanto visível
  if (ctxButtons.__go_prevZ === undefined) ctxButtons.__go_prevZ = ctxButtons.style.zIndex || '';
  ctxButtons.style.zIndex = '999999';

  const center = computeCenter(ctxButtons, twctx);
  if (!center) {
    log('abort: sem center ainda', reason);
    return;
  }

  injectCssOnce();

  // =========================================================
  // 1) Pega ou cria botões "sempre visíveis" (cal / lupa)
  // =========================================================
  let btnCal = qs('#mp_go_schedule', ctxButtons);
  let btnSearch = qs('#mp_go_list', ctxButtons);
  let btnMap = qs('#mp_go_map', ctxButtons);
  let btnCenter = qs('#mp_go_center', ctxButtons);

  if (!btnCal) {
    btnCal = makeBtn({
      id: 'mp_go_schedule',
      title: 'Agendar comandos',
      iconUri: ICON_CALENDAR,
      onClick: async function () {
        const data = {
          ...getCtxDataFlat(ctxButtons, twctx),
          dispatchMode: 'schedule',
          mode: 'schedule',
        };
        if (ProtectingBot['bot-protect-all-in-game'].active()) {
          throw ProtectingBot.error()
        }
        const plannerOneToMany = await loadPlannerOneToMany()
        await plannerOneToMany(data);
      }
    });
    ctxButtons.appendChild(btnCal);
  }

  if (!btnSearch) {
    btnSearch = makeBtn({
      id: 'mp_go_list',
      title: 'Enviar comandos',
      iconUri: ICON_CROSSED_SWORDS_MAP,
      onClick: async function () {
        const data = {
          ...getCtxDataFlat(ctxButtons, twctx),
          dispatchMode: 'send',
          mode: 'send',
        };
        if (ProtectingBot['bot-protect-all-in-game'].active()) {
          throw ProtectingBot.error()
        }
        const plannerOneToMany = await loadPlannerOneToMany()
        await plannerOneToMany(data);
      }
    });
    ctxButtons.appendChild(btnSearch);
  }

  // =========================================================
  // 2) Botão "Abrir mapa desta vila" (globo) — só vila própria
  //    e só se não for a vila atual
  // =========================================================
  const focusedId = getVillageIdFromMenuLinks(ctxButtons);
  const currentId = getCurrentVillageId();
  const canShowMapBtn =
    isOwnVillageCtx(ctxButtons) &&
    focusedId &&
    currentId &&
    (focusedId !== currentId);

  if (!canShowMapBtn) {
    if (btnMap) btnMap.remove();
    btnMap = null;
  } else if (!btnMap) {
    btnMap = makeBtn({
      id: 'mp_go_map',
      title: 'Abrir mapa desta vila',
      iconUri: ICON_GLOBE,
      onClick: function () {
        const data = getCtxDataFlat(ctxButtons, twctx);
        if (!data.id) return;
        if (ProtectingBot['bot-protect-all-in-game'].active()) {
          throw ProtectingBot.error()
        }
        // abre o MAPA desta vila (troca a vila ativa)
        location.href = withGroupFix(`${location.origin}/game.php?village=${data.id}&screen=map`);
      }
    });
    ctxButtons.appendChild(btnMap);
  }

  // =========================================================
  // 3) Botão "Centralizar no mapa" (mira/estrela) — todas vilas
  //    exceto quando já estiver centralizado na coords atual (#x;y)
  //    Mantém o ID da vila atual (village=... da tela)
  // =========================================================
  const dataNow = getCtxDataFlat(ctxButtons, twctx);     // {id, x, y} da vila clicada
  const curCenter = getCenteredCoordsFromHash();        // {x, y} do hash atual
  const curVillageId = getCurrentVillageId();           // vila ativa na tela

  const isAlreadyCentered =
    !!curCenter &&
    Number.isFinite(dataNow.x) &&
    Number.isFinite(dataNow.y) &&
    dataNow.x === curCenter.x &&
    dataNow.y === curCenter.y;

  const canShowCenterBtn =
    !!curVillageId &&
    Number.isFinite(dataNow.x) &&
    Number.isFinite(dataNow.y) &&
    !isAlreadyCentered;

  if (!canShowCenterBtn) {
    if (btnCenter) btnCenter.remove();
    btnCenter = null;
  } else if (!btnCenter) {
    btnCenter = makeBtn({
      id: 'mp_go_center',
      title: 'Centralizar no mapa',
      iconUri: ICON_CENTER,
      onClick: function () {
        const d = getCtxDataFlat(ctxButtons, twctx);
        const vid = getCurrentVillageId();

        if (!vid || !Number.isFinite(d.x) || !Number.isFinite(d.y)) return;
        if (ProtectingBot['bot-protect-all-in-game'].active()) {
          throw ProtectingBot.error()
        }

        const url =
          `${location.origin}/game.php?village=${vid}` +
          `&screen=map&x=${d.x}&y=${d.y}&beacon`;

        location.href = withGroupFix(url);
      }
    });
    ctxButtons.appendChild(btnCenter);
  }

  // =========================================================
  // 4) Posicionamento independente (cada botão com dx/dy próprio)
  // =========================================================
  function place(btn, pos) {
    if (!btn || !pos) return;
    btn.style.left = (center.cx + pos.dx - (GO.BTN_SIZE / 2)) + 'px';
    btn.style.top  = (center.cy + pos.dy - (GO.BTN_SIZE / 2)) + 'px';
  }

  place(btnCal, GO.POS.schedule);
  place(btnSearch, GO.POS.list);
  place(btnMap, GO.POS.map);
  place(btnCenter, GO.POS.center);

  log('ok: updated', { reason, cx: center.cx, cy: center.cy });
}

function patchContextWhenReady() {
  const TWMap = window.TWMap;
  if (!TWMap || !TWMap.context) return false;

  const twctx = TWMap.context;
  if (twctx.__go_patched) return true;
  twctx.__go_patched = true;

  injectCssOnce();
  ensureMapTooltipOnce();

  if (typeof twctx.spawn === 'function') {
    const origSpawn = twctx.spawn;
    twctx.spawn = function () {
      const r = origSpawn.apply(this, arguments);
      requestAnimationFrame(() => {
        ensureButtons('spawn');
      });
      return r;
    };
  }

  if (typeof twctx.ajaxDone === 'function') {
    const origAjaxDone = twctx.ajaxDone;
    twctx.ajaxDone = function () {
      const r = origAjaxDone.apply(this, arguments);
      requestAnimationFrame(() => {
        ensureButtons('ajaxDone');
      });
      return r;
    };
  }

  if (typeof twctx.hide === 'function') {
    const origHide = twctx.hide;
    twctx.hide = function () {
      try {
        const ctxButtons = document.getElementById('map-ctx-buttons');
        if (ctxButtons) removeButtons(ctxButtons);
      } catch (_) {}
      return origHide.apply(this, arguments);
    };
  }

  const ctxButtons = document.getElementById('map-ctx-buttons');
  if (ctxButtons && !ctxButtons.__go_observed) {
    ctxButtons.__go_observed = true;
    try {
      const mo = new MutationObserver(() => {
        if (window.TWMap && window.TWMap.context && window.TWMap.context._visible) {
          ensureButtons('mo');
        }
      });
      mo.observe(ctxButtons, { childList: true, subtree: false, attributes: true, attributeFilter: ['style'] });
    } catch (_) {}
  }

  log('context patched');
  return true;
}

export function bootMapMenuRunning() {
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    const ok = patchContextWhenReady();
    if (ok && !mapCollectorLauncherBooted) {
      mapCollectorLauncherBooted = true
      ensureMapCollectorLauncher()
    }
    if (ok || tries > 200) clearInterval(t);
    if (ProtectingBot['bot-protect-all-in-game'].active()) {
      clearInterval(t)
      throw ProtectingBot.error()
    }
  }, 150);

  if (!mapCollectorLauncherHashListenerBound) {
    mapCollectorLauncherHashListenerBound = true
    window.addEventListener('hashchange', () => {
      try {
        ensureMapCollectorLauncher()
      } catch (_) {}
    }, { passive: true })
  }
}

let unbindVillageCtxTooltip = null
let villageCtxAnchorTrackingBound = false
let lastVillageCtxAnchorCenter = null
let lastVillageCtxAnchorData = null

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
  wrap.style.zIndex = '12010'
  wrap.style.pointerEvents = 'none'
  document.body.appendChild(wrap)
  return wrap
}

function getVisibleVillageCtxLinks() {
  const links = Array.from(document.querySelectorAll('a.village_ctx[id^="ctx_"]'))
  return links.filter((el) => {
    if (el.id === 'ctx_go_send' || el.id === 'ctx_go_schedule') return false
    const st = window.getComputedStyle(el)
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false
    const left = parseFloat(el.style.left || 'NaN')
    const top = parseFloat(el.style.top || 'NaN')
    return Number.isFinite(left) && Number.isFinite(top)
  })
}

function computeVillageCtxCenter(links) {
  if (!Array.isArray(links) || links.length === 0) return null
  const sum = links.reduce((acc, el) => {
    const left = parseFloat(el.style.left || '0')
    const top = parseFloat(el.style.top || '0')
    acc.x += left + 12
    acc.y += top + 12
    return acc
  }, { x: 0, y: 0 })
  return { cx: sum.x / links.length, cy: sum.y / links.length }
}

function bindVillageCtxAnchorTrackingOnce() {
  if (villageCtxAnchorTrackingBound) return
  villageCtxAnchorTrackingBound = true
  document.addEventListener('click', (event) => {
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
    lastVillageCtxAnchorCenter = {
      cx: rect.left + (rect.width / 2) + window.scrollX,
      cy: rect.top + (rect.height / 2) + window.scrollY,
      at: Date.now()
    }
    lastVillageCtxAnchorData = {
      villageId,
      playerId,
      currentVillageId: Number.isFinite(currentVillageHref) ? currentVillageHref : getCurrentVillageIdFromUrl(),
      at: Date.now()
    }
  }, true)
}

function getCtxTargetVillageId() {
  if (lastVillageCtxAnchorData?.villageId && Date.now() - lastVillageCtxAnchorData.at < 6000) {
    return Number(lastVillageCtxAnchorData.villageId)
  }
  const infoLink = document.querySelector('#ctx_info.village_ctx')
  const href = infoLink?.href || ''
  const id = parseParam(href, 'id')
  if (Number.isFinite(id)) return id
  const any = Array.from(document.querySelectorAll('a.village_ctx[id^="ctx_"]')).find((el) => parseParam(el.href, 'id'))
  return Number(parseParam(any?.href || '', 'id')) || null
}

function getCurrentVillageIdFromCtxLinks() {
  if (lastVillageCtxAnchorData?.currentVillageId && Date.now() - lastVillageCtxAnchorData.at < 6000) {
    return Number(lastVillageCtxAnchorData.currentVillageId)
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

    // 1) mais confiável: href de mapa com x/y explícitos
    const mapLink = Array.from(doc.querySelectorAll('a[href*="screen=map"][href*="x="][href*="y="]'))
      .find((a) => {
        const hx = parseParam(a.href, 'x')
        const hy = parseParam(a.href, 'y')
        return Number.isFinite(hx) && Number.isFinite(hy)
      })
    if (mapLink) {
      const x = Number(parseParam(mapLink.href, 'x'))
      const y = Number(parseParam(mapLink.href, 'y'))
      if (Number.isFinite(x) && Number.isFinite(y)) return { x, y }
    }

    // 2) fallback restrito no título da aldeia
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
  const mapCtx = document.getElementById('map-ctx-buttons')
  if (mapCtx) return
  const visibleCtxLinks = getVisibleVillageCtxLinks()
  const wrap = getVillageCtxContainer()
  if (!visibleCtxLinks.length) {
    wrap.replaceChildren()
    return
  }
  const anchorCenter = lastVillageCtxAnchorCenter
  const isAnchorFresh = anchorCenter && (Date.now() - anchorCenter.at < 6000)
  const center = isAnchorFresh
    ? { cx: anchorCenter.cx, cy: anchorCenter.cy }
    : computeVillageCtxCenter(visibleCtxLinks)
  if (!center) return

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
          mode: 'schedule',
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
          mode: 'send',
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
  const contextMenu = document.querySelector('a.ctx')
  if (!contextMenu) return
  bindVillageCtxAnchorTrackingOnce()
  injectVillageCtxCssOnce()
  ensureVillageCtxTooltipOnce()
  let tries = 0
  const t = setInterval(() => {
    tries++
    ensureVillageCtxButtons()
    if (tries > 2000) clearInterval(t)
    if (ProtectingBot['bot-protect-all-in-game'].active()) {
      clearInterval(t)
      throw ProtectingBot.error()
    }
  }, 150)
}
