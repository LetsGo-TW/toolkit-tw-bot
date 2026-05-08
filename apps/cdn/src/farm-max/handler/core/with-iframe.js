// ./core/with-iframe.js
import { source, target, running } from "..";
import { getASPages } from "../../common/get-pages";
import { transformUnitsFarm } from "../../common/transform-units-farm-array";
import { storageConfigFarm, storageFarmIframe } from "../../config";
import { dataConfig } from "../../config/data";
import {
  apiFarmClose, apiFarmTerminate, calcFarmsPerModels, skipReportPlunderListHtml,
  whenThereAreNoReports, whenThereAreNoTroops, whenThereIsAnError
} from "./api-farm";
import { addTargetToSession, ensureFarmSession } from "./farm-session";
import { interceptTWPost } from "./intercept-tw-post";
import { getPlunderList } from "./plunder-list";
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'

const ICON_URL = "https://dsbr.innogamescdn.com/asset/af1188db/graphic/icons/farm_assistent.webp";

function isFarmAjax(url = "", params = {}, payload = {}) {
  const urlStr = String(url || "");
  const fromAmFarm = /[?&]screen=am_farm\b/.test(urlStr);
  const maybeFarmAction = params?.ajaxaction === "farm" || typeof payload?.success === "string";
  return fromAmFarm && maybeFarmAction;
}

async function withIframe(url, cb, data, opts = {}) {
  const {
    visible = false,
    timeout = 30000,
    sandbox = "allow-same-origin allow-scripts allow-forms",
    width = 480,
    height = 220,
    top = 100,
    left = 20,
    blockClicks = true,
    autoCompact = false,
    maxRows = 5,
    storageKey = "farm_iframe",
    ICON_48_URL = `chrome-extension://${RELEASE_EXTENSION_ID}/icons/ico.green.128.png`
  } = opts;

  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });

  document.getElementById("twbot-ifr-popup")?.remove();
  document.getElementById("twbot-ifr-mini")?.remove();

  // ===== preferências salvas (pos/minimize) =====
  const allPrefs = (await storageFarmIframe.get()) || {};
  const saved = allPrefs[storageKey] || {};
  const initLeft = Number.isFinite(saved.left) ? saved.left : left;
  const initTop  = Number.isFinite(saved.top)  ? saved.top  : top;
  let minimizedInit = !!saved.minimized;
  const savePrefs = async (p) => {
    allPrefs[storageKey] = { left: initLeft, top: initTop, minimized: minimizedInit, ...p };
    await storageFarmIframe.set(allPrefs);
  };

  const abs = new URL(url, location.href);
  if (abs.origin !== location.origin) throw new Error("Iframe precisa ser MESMA ORIGEM");

  // ===== estrutura do popup =====
  const wrap = document.createElement("div");
  wrap.id = "twbot-ifr-popup";
  Object.assign(wrap.style, {
    position: "fixed",
    top: `${initTop}px`,
    left: `${initLeft}px`,
    width: `${width}px`,
    height: `${height}px`,
    background: "#fff",
    border: "1px solid #888",
    boxShadow: "0 6px 24px rgba(0,0,0,.25)",
    borderRadius: "10px",
    overflow: "hidden",
    zIndex: 2147483000,
    opacity: 0.9,
    display: "none",
  });

  // header
  const HEADER_H = 45;
  const header = document.createElement("div");
  Object.assign(header.style, {
    height: `${HEADER_H}px`,
    background: "linear-gradient(#f2e7c9, #e0d3ad)",
    borderBottom: "1px solid #b4a273",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "0 8px",
    cursor: "move",
    userSelect: "none",
    flexWrap: "nowrap",
  });

  // ícone com fallback
  const icon = document.createElement("img");
  Object.assign(icon.style, { width: "20px", height: "20px" });
  const primaryIcon = ICON_48_URL || ICON_URL;
  icon.src = primaryIcon;
  icon.onerror = () => {
    icon.onerror = null;
    const fallback = new URL(ICON_URL, location.href).href;
    if (icon.src !== fallback) icon.src = fallback;
  };

  const title = document.createElement("div");
  Object.assign(title.style, {
    font: "600 12px/1.2 system-ui, sans-serif",
    flex: "1 1 auto",
    minWidth: "0",
    overflow: "hidden",
  });

  title.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;min-width:0;">
      <div style="display:flex;gap:.5rem;align-items:center;flex:0 0 auto;">
        <label style="cursor:pointer;font-weight:700;" title="Ativa ou desativa o auto-farm (encerra a execução atual)." for="go-as-active">AS</label>
        <input type="checkbox" name="active" id="go-as-active" class="toggle">
        <label style="margin:auto" title="Ativa ou desativa o auto-farm" for="go-as-active"></label>
      </div>

      <div id="go-as-village"
           style="flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:6px;">
        <a id="go-as-village-name"
           data-title="Visualização geral da aldeia."
           href="#"
           style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;"></a>
        <span id="go-as-village-coords" style="flex:0 0 auto;white-space:nowrap;opacity:.85;"></span>
      </div>

      <div style="display:flex;align-items:center;gap:10px;flex:0 0 auto;">
        <span>
          <span id="go-as-village-count" title="vila/total de vilas">[${data.vCount || 1}/${data.vTotal || 1}]</span>
          <span class="icon header village"></span>
        </span>
        <span id="go-as-page"  title="Página atual/total de páginas.">[1]📋</span>
        <span id="go-as-count" title="Farms enviados.">[0]✔️</span>
        <div style="display:flex;width:56px;gap:6px">
          <span id="go-as-pending"
                style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;visibility:hidden;">
            <img src="https://dsbr.innogamescdn.com/asset/afa3a1fb/graphic/loading2.gif" alt="loading" width="14" height="14">
          </span>
          <span id="go-as-button"></span>
        </div>
      </div>
    </div>
  `;

  const btnMin = document.createElement("button");
  btnMin.title = "Minimizar (não para a execução).";
  btnMin.textContent = "—";
  stylizeBtn(btnMin);

  const btnClose = document.createElement("button");
  btnClose.title = "Fechar (encerra o farm da vila).";
  btnClose.textContent = "×";
  stylizeBtn(btnClose);

  Object.assign(btnMin.style,   { flex: "0 0 auto" });
  Object.assign(btnClose.style, { flex: "0 0 auto" });

  header.append(icon, title, btnMin, btnClose);

  // corpo + footer
  const FOOTER_H = 45;
  const body = document.createElement("div");
  Object.assign(body.style, {
    position: "relative",
    width: "100%",
    height: `calc(100% - ${HEADER_H}px - ${FOOTER_H}px)`,
  });

  const ifr = document.createElement("iframe");
  ifr.sandbox = sandbox;
  ifr.src = abs.href;
  Object.assign(ifr.style, {
    width: "100%", height: "100%", border: "0",
    background: "#fff",
    pointerEvents: blockClicks ? "none" : "auto",
  });

  const footer = document.createElement("div");
  Object.assign(footer.style, {
    height: `${FOOTER_H}px`,
    background: "linear-gradient(#efe1bf, #e1d2ab)",
    borderTop: "1px solid #b4a273",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "0 8px",
    font: "12px/1.2 system-ui, sans-serif",
    color: "#3b2f12",
    overflow: "hidden",
  });

  const logBox = document.createElement("div");
  Object.assign(logBox.style, { flex: "1", whiteSpace: "normal", overflowX: "hidden", overflowY: "hidden" });

  // loader
  const loader = document.createElement("div");
  Object.assign(loader.style, {
    position: "absolute",
    inset: "0",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,.38)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    transition: "opacity 120ms ease",
    opacity: "0",
    pointerEvents: "auto",
    zIndex: 2,
    willChange: "opacity, backdrop-filter",
  });
  const loaderImg = document.createElement("img");
  loaderImg.src = "graphic/throbber.gif";
  loaderImg.alt = "Carregando…";
  loader.appendChild(loaderImg);

  body.appendChild(ifr);
  body.appendChild(loader);
  footer.appendChild(logBox);
  wrap.append(header, body, footer);
  document.body.appendChild(wrap);

  // ===== dimensões travadas =====
  const HEADROW_H = 30;
  const ROW_H     = 30;
  const fixedIfrH  = HEADROW_H + (ROW_H * maxRows);
  const fixedWrapH = HEADER_H + fixedIfrH + FOOTER_H;
  const lockH = (el, px) => {
    el.style.setProperty("box-sizing", "border-box", "important");
    el.style.setProperty("height", `${px}px`, "important");
    el.style.setProperty("min-height", `${px}px`, "important");
    el.style.setProperty("max-height", `${px}px`, "important");
  };
  const lockW = (el, px) => {
    el.style.setProperty("width", `${px}px`, "important");
    el.style.setProperty("min-width", `${px}px`, "important");
    el.style.setProperty("max-width", `${px}px`, "important");
  };
  lockW(wrap, width);
  lockH(wrap, fixedWrapH);
  lockH(body, fixedIfrH);
  ifr.style.setProperty("height", "100%", "important");
  ifr.style.setProperty("min-height", "100%", "important");
  ifr.style.setProperty("max-height", "100%", "important");

  // ===== minimizar/restaurar =====
  function applyInitialVisibility() {
    // mostra exatamente UM dos dois
    if (minimizedInit) {
      wrap.style.display = "none";
      miniBtn.style.display = "block";
    } else if (visible) {
      wrap.style.display = "block";
      miniBtn.style.display = "none";
    } else {
      wrap.style.display = "none";
      miniBtn.style.display = "none";
    }
  }

  function applyVisibility() {
    if (minimized) {
      wrap.style.display = "none";
      miniBtn.style.display = "block";
    } else {
      wrap.style.display = "block";
      miniBtn.style.display = "none";
    }
  }

  let minimized = minimizedInit;
  const miniBtn = document.createElement("button");
  miniBtn.id = "twbot-ifr-mini";
  miniBtn.title = "Mostrar Assistente de Saque";
  Object.assign(miniBtn.style, {
    position: "fixed",
    top: `${initTop}px`,
    left: `${initLeft}px`,
    width: "44px",
    height: "44px",
    borderRadius: "10px",
    border: "1px solid #888",
    background: `#f4e4bc url("${ICON_URL}") center/26px 26px no-repeat`,
    boxShadow: "0 6px 24px rgba(0,0,0,.25)",
    zIndex: 2147483000,
    display: minimized ? "block" : "none",
    cursor: "pointer",
  });
  document.body.appendChild(miniBtn);

  const clamp = (x, min, max) => Math.max(min, Math.min(x, max));
  function showLoader() {
    ifr.style.transition = "filter 120ms ease, opacity 120ms ease";
    ifr.style.filter = "blur(4px) brightness(0.6)";
    ifr.style.opacity = "0.5";
    loader.style.display = "flex";
    requestAnimationFrame(() => { loader.style.opacity = "1"; });
  }
  function hideLoader() {
    loader.style.opacity = "0";
    ifr.style.filter = "none";
    ifr.style.opacity = "1";
    setTimeout(() => { loader.style.display = "none"; }, 140);
  }

  function minimize() {
    if (minimized) return;
    minimized = true;
    minimizedInit = true;
    const r = wrap.getBoundingClientRect();
    const x = clamp(r.left, 0, window.innerWidth  - miniBtn.offsetWidth);
    const y = clamp(r.top,  0, window.innerHeight - miniBtn.offsetHeight);
    miniBtn.style.left = `${x}px`;
    miniBtn.style.top  = `${y}px`;
    miniBtn.style.display = "block";
    wrap.style.display = "none";
    savePrefs({ left: x, top: y, minimized: true });
    applyVisibility();
  }
  function restore() {
    if (!minimized) return;
    minimized = false;
    minimizedInit = false;
    const r = miniBtn.getBoundingClientRect();
    const x = clamp(r.left, 0, window.innerWidth  - wrap.offsetWidth);
    const y = clamp(r.top,  0, window.innerHeight - wrap.offsetHeight);
    lockW(wrap, width);
    lockH(wrap, fixedWrapH);
    lockH(body, fixedIfrH);
    wrap.style.left = `${x}px`;
    wrap.style.top  = `${y}px`;
    miniBtn.style.display = "none";
    wrap.style.display = "block";
    savePrefs({ left: x, top: y, minimized: false });
    applyVisibility();
  }
  btnMin.onclick = minimize;
  miniBtn.onclick = restore;

  // refs do último doc/janela
  let lastDoc = null;
  let lastWin = null;

  // ===== Focus-guard (não usar blur())
  const prevActive = document.activeElement;
  ifr.setAttribute("tabindex", "-1");
  const preventIfrMouseFocus = (e) => e.preventDefault();
  ifr.addEventListener("mousedown", preventIfrMouseFocus);
  const restoreFocus = () => {
    const targetPrev = (prevActive instanceof HTMLElement ? prevActive : document.body);
    try { targetPrev.focus({ preventScroll: true }); } catch { /* intentionally empty */ }
  };
  const onIfrFocus = () => restoreFocus();
  ifr.addEventListener("focus", onIfrFocus, true);
  const onIfrLoadedFocusWire = () => {
    try { ifr.contentDocument?.addEventListener("focusin", onIfrFocus, true); } catch { /* intentionally empty */ }
    if (!minimizedInit) restoreFocus();
  };
  ifr.addEventListener("load", onIfrLoadedFocusWire);

  // remove listeners do doc anterior
  const detach = () => {
    try { lastDoc?.removeEventListener("twApiResponse", ifrIntercept); } catch { /* intentionally empty */ }
    try { lastDoc?.removeEventListener("twApiReqStart", onReqStart); } catch { /* intentionally empty */ }
    try { lastDoc?.removeEventListener("twApiReqEnd",   onReqEnd);   } catch { /* intentionally empty */ }
    try { lastDoc?.removeEventListener("twApiRequest",  rememberTargetFromRequest); } catch { /* intentionally empty */ }
    try { lastWin?.removeEventListener("beforeunload",  detach); } catch { /* intentionally empty */ }
  };

  function cleanup() {
    detach();
    try { ifr.removeEventListener("load", applyCompact); } catch { /* intentionally empty */ }
    try { ifr.removeEventListener("mousedown", preventIfrMouseFocus); } catch { /* intentionally empty */ }
    try { ifr.removeEventListener("focus", onIfrFocus, true); } catch { /* intentionally empty */ }
    try { ifr.contentDocument?.removeEventListener("focusin", onIfrFocus, true); } catch { /* intentionally empty */ }
    try { ifr.removeEventListener("load", onIfrLoadedFocusWire); } catch { /* intentionally empty */ }
    try { ifr.src = "about:blank"; } catch { /* intentionally empty */ }
    requestAnimationFrame(() => { wrap.remove(); miniBtn.remove(); });
    try { resolveDone?.(); } catch { /* intentionally empty */ }
    try { delete window.__twbot_iframe_mounting; } catch { /* intentionally empty */ }
  }

  // ===== carregar =====
  showLoader();
  const onceLoad = () => new Promise(r => ifr.addEventListener("load", r, { once: true }));
  const withTimeout = (p, ms, label="timeout") =>
    Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(label)), ms))]);
  await withTimeout(onceLoad(), timeout, "timeout ao carregar iframe");
  if (!autoCompact) requestAnimationFrame(() => requestAnimationFrame(hideLoader));
  requestAnimationFrame(applyInitialVisibility);

  const navTimeout = Number.isFinite(opts?.navTimeout) ? opts.navTimeout : 30000;

  async function navigate(url2, { replace = false, timeout = navTimeout } = {}) {
    try { detach?.(); } catch { /* intentionally empty */ }

    showLoader();
    const load = withTimeout(onceLoad(), timeout, "timeout ao navegar iframe");
    const dst  = new URL(url2, ifr.contentWindow.location.href).href;

    try {
      replace ? ifr.contentWindow.location.replace(dst)
              : ifr.contentWindow.location.assign(dst);
      await load;
      applyVisibility(); // mantém só um visível após cada navegação
    } catch (err) {
      try { hideLoader(); } catch { /* intentionally empty */ }
      try { api.footer.set("Tempo esgotado ao navegar. Fechando…", "err"); } catch { /* intentionally empty */ }
      try { await whenThereIsAnError(api, data); } catch { /* intentionally empty */ }
      throw err;
    }

    try {
      interceptTWPost(ifr.contentWindow, ifr.contentDocument);
      ifr.contentDocument.addEventListener("twApiResponse", ifrIntercept);
      ifr.contentDocument.addEventListener("twApiReqStart", onReqStart);
      ifr.contentDocument.addEventListener("twApiReqEnd",   onReqEnd);
      ifr.contentDocument.addEventListener("twApiRequest",  rememberTargetFromRequest);

      lastDoc = ifr.contentDocument;
      lastWin = ifr.contentWindow;
      lastWin.addEventListener("beforeunload", detach);

      touchProgress("navigate");
    } catch { /* intentionally empty */ }

    return { w: ifr.contentWindow, d: ifr.contentDocument };
  }

  // ===== helpers DOM =====
  function mapLogicalColumns(tr) {
    const cells = Array.from(tr.children).filter(x => x.matches("td,th"));
    let cursor = 0;
    return cells.map(el => {
      const span = Math.max(1, Number(el.getAttribute("colspan") || 1));
      const start = cursor; cursor += span;
      return { el, start, span };
    });
  }
  function anyIndexInRange(keepSet, start, span) {
    for (let i = 0; i < span; i++) if (keepSet.has(start + i)) return true;
    return false;
  }
  function isolatePlunderList() {
    const d = ifr.contentDocument;
    const el = d.querySelector("#plunder_list");
    if (!el) return false;

    let cur = el;
    while (cur && cur !== d.body) {
      const p = cur.parentElement;
      if (!p) break;
      for (const sib of Array.from(p.children)) if (sib !== cur) sib.style.display = "none";
      cur = p;
    }

    const docEl = d.documentElement;
    d.documentElement.style.background = "#d2c09e";
    d.body.style.background = "#d2c09e";
    d.body.style.margin = "0";
    d.body.style.overflow = "hidden";
    docEl.style.overflow = "hidden";
    d.querySelector("#inner-border")?.setAttribute("style", "padding: 0; border: none");
    d.querySelector("#content_value")?.setAttribute("style", "padding: 0");
    d.querySelector("#am_widget_Farm")?.setAttribute("style", "margin: 0; border: none; box-shadow: none");
    return true;
  }
  function presentCompactPlunder() {
    const d = ifr.contentDocument;
    d.querySelector("#ds_body").classList.remove('item_2013')
    const table = d.querySelector("#plunder_list");
    if (!table) return false;

    const dataRows = Array.from(table.querySelectorAll("tbody tr")).filter(tr => tr.querySelector("td"));
    if (!dataRows.length) return false;
    const sampleMap = mapLogicalColumns(dataRows[0]);

    const keep = new Set([1, 2]);

    const cellVillage = sampleMap.find(c =>
      /\d+\|\d+/.test(c.el.textContent || "") ||
      c.el.querySelector('a[href*="screen=report"], a[href*="screen=info_village"]')
    );
    if (cellVillage) keep.add(cellVillage.start);

    const cellA = sampleMap.find(c => c.el.querySelector("a.farm_icon_a"));
    const cellB = sampleMap.find(c => c.el.querySelector("a.farm_icon_b"));
    let cellC = sampleMap.find(c => c.el.querySelector("a.farm_icon_c"));
    if (!cellC && cellB) {
      const idxBChild = sampleMap.indexOf(cellB);
      if (idxBChild >= 0 && sampleMap[idxBChild + 1]) cellC = sampleMap[idxBChild + 1];
    }
    if (cellA) keep.add(cellA.start);
    if (cellB) keep.add(cellB.start);
    if (cellC) keep.add(cellC.start);

    const abcStarts = [cellA?.start, cellB?.start, cellC?.start].filter(n => Number.isFinite(n));
    if (abcStarts.length) {
      const abcMin = Math.min(...abcStarts);
      if (abcMin - 1 >= 0) keep.add(abcMin - 1);
      if (abcMin - 2 >= 0) keep.add(abcMin - 2);
    }

    const allRows = Array.from(table.querySelectorAll("tr"));
    allRows.forEach(tr => {
      const map = mapLogicalColumns(tr);
      map.forEach(({ el, start, span }) => {
        el.style.display = anyIndexInRange(keep, start, span) ? "" : "none";
      });
    });

    if (cellVillage) {
      const ensureAttackBadge = (td) => {
        if (!td) return;
        const img = td.querySelector('img[src*="command/attack"]');
        if (!img) { td.querySelector(".twbot-attack-count")?.remove(); return; }
        const raw = img.getAttribute("data-title") || img.getAttribute("title") || img.dataset?.title || "";
        const m = raw.match(/(\d+)/); const n = m ? parseInt(m[1], 10) : 0;
        if (!n) { td.querySelector(".twbot-attack-count")?.remove(); return; }
        const cur = td.querySelector(".twbot-attack-count");
        const text = ` (${n})`;
        if (cur) { cur.textContent = text; return; }
        const span = d.createElement("span");
        span.className = "twbot-attack-count"; span.style.fontWeight = "bold"; span.textContent = text;
        td.appendChild(span);
      };
      for (const tr of dataRows) {
        const map = mapLogicalColumns(tr);
        const col = map.find(c => c.start === cellVillage.start);
        ensureAttackBadge(col?.el);
      }
    }

    const rows = Array.from(table.querySelectorAll("tbody tr")).filter(tr => tr.querySelector("td"));
    rows.forEach((tr, i) => { tr.style.display = i < maxRows ? "" : "none"; });

    return true;
  }

  function fitToContent() {} // placeholder

  const applyCompact = () => {
    isolatePlunderList();
    presentCompactPlunder();
    requestAnimationFrame(() => requestAnimationFrame(hideLoader));
  };
  if (autoCompact) {
    applyCompact();
    ifr.addEventListener("load", applyCompact);
  }

  // ===== UI helpers =====
  const uiActive   = title.querySelector("#go-as-active");
  const uiVillage  = title.querySelector("#go-as-village");
  const uiPage     = title.querySelector("#go-as-page");
  const uiCount    = title.querySelector("#go-as-count");
  const uiBtnSlot  = title.querySelector("#go-as-button");
  const uiPending  = title.querySelector("#go-as-pending");

  function setVillage(v) {
    if (!v) return;
    const nameView   = document.querySelector("#go-as-village-name");
    const coordsView = document.querySelector("#go-as-village-coords");
    const countView = document.querySelector('#go-as-village-count');
    const nameEl   = uiVillage.querySelector("#go-as-village-name");
    const coordsEl = uiVillage.querySelector("#go-as-village-coords");
    const raw = v.name || "";
    const m = raw.match(/^(.*?)\s*(\(\d+\|\d+\)\s*K\d+)/);
    if (countView) { countView.textContent = `[${data.vCount || 1}/${data.vTotal || 1}]`}
    if (m) {
      if (nameView) nameView.textContent = m[1].trim();
      if (coordsView) coordsView.textContent = ` ${m[2]}`;
      nameEl.textContent   = m[1].trim();
      coordsEl.textContent = ` ${m[2]}`;
    } else {
      if (nameView) nameView.textContent = raw;
      if (coordsView) coordsView.textContent = "";
      nameEl.textContent   = raw;
      coordsEl.textContent = "";
    }
    nameEl.href = `/game.php?village=${v.id}&screen=overview`;
    if (nameView) nameView.href = `/game.php?village=${v.id}&screen=overview`;
  }
  function setButton(b = "") {
    if (!uiBtnSlot) return;
    const viewBtnSlot = document.querySelector("#go-as-button");
    if (b) {
      if (viewBtnSlot) viewBtnSlot.setAttribute("class", `farm_icon farm_icon_${b}`);
      uiBtnSlot.setAttribute("class", `farm_icon farm_icon_${b}`);
      return;
    }
    if (viewBtnSlot) viewBtnSlot.removeAttribute("class");
    uiBtnSlot.removeAttribute("class");
  }
  function setPending(n = 0) {
    const viewPending = document.querySelector("#go-as-pending");
    if (viewPending) {
      viewPending.style.visibility = n > 0 ? "visible" : "hidden";
    }
    uiPending.style.visibility = n > 0 ? "visible" : "hidden";
  }
  function setPage(n) {
    const viewPage = document.querySelector('#go-as-page');
    if (viewPage && n) viewPage.textContent = `[${n}]📋`;
    uiPage.textContent  = `[${n}]📋`;
  }
  function setCount(n) {
    const viewCount = document.querySelector('#go-as-count');
    if (viewCount && n) viewCount.textContent = `[${n}]✔️`;
    uiCount.textContent = `[${n}]✔️`;
  }

  function stamp() {
    const d = new Date();
    const h = String(d.getHours()).padStart(2,"0");
    const m = String(d.getMinutes()).padStart(2,"0");
    const s = String(d.getSeconds()).padStart(2,"0");
    return `${h}:${m}:${s}`;
  }
  function colorFor(kind) {
    return kind === "ok"   ? "#2e7d32"
         : kind === "warn" ? "#a15d00"
         : kind === "err"  ? "#b00020"
         : "#3b2f12";
  }
  function footerPush(text, kind="info") {
    const span = document.createElement("span");
    span.textContent = `[${stamp()}] ${text}`;
    span.style.marginRight = "12px";
    span.style.color = colorFor(kind);
    logBox.appendChild(span);
    logBox.scrollLeft = logBox.scrollWidth;
  }
  function footerSet(text, kind="info") { logBox.innerHTML = ""; footerPush(text, kind); }
  function footerClear() { logBox.innerHTML = ""; }

  // ===== API exposta =====
  function cleanListeners() {
    detach();
    window.removeEventListener("message", onMessage, false);
    try { ifr.contentDocument.removeEventListener("twApiResponse", ifrIntercept); } catch { /* intentionally empty */ }
    try { lastDoc?.removeEventListener("twApiReqStart", onReqStart); } catch { /* intentionally empty */ }
    try { lastDoc?.removeEventListener("twApiReqEnd",   onReqEnd);   } catch { /* intentionally empty */ }
    try { uiActive.removeEventListener("change", onActiveChange); } catch { /* intentionally empty */ }
    try { btnClose.removeEventListener("click", callApiFarmClose); } catch { /* intentionally empty */ }
    try { ifr.removeEventListener("load", applyCompact); } catch { /* intentionally empty */ }
  }

  const api = {
    navigate, minimize, restore, close: cleanup,
    cleanListeners, cleanListners: cleanListeners,
    setBlockClicks(v){ ifr.style.pointerEvents = v ? "none" : "auto"; },
    isolatePlunderList, presentCompactPlunder, fitToContent,
    ui: {
      wrap, header, button: miniBtn, footer, close: btnClose, title,
      active: uiActive, villageEl: uiVillage, pageEl: uiPage, countEl: uiCount,
      pendingEl: uiPending, uiBtnSlot,
      setVillage, setButton, setPending, setPage, setCount,
      setActive:(v) => { uiActive.checked    = !!v; },
      applyVisibility
    },
    footer: { push: footerPush, set: footerSet, clear: footerClear, element: footer },
    loader: { show: showLoader, hide: hideLoader, element: loader },
    iframe: ifr,
  };

  api.refresh = async () => {
    const { w, d } = await navigate(ifr.contentWindow.location.href, { replace: true });
    return { w, d };
  };

  // ===== progresso/inflight =====
  function touchProgress(reason) {
    data._lastProgressAt = Date.now();
    data._pageRefreshes = 0;
    data._lastReason = reason;
  }

  function extractTargetIdFromReq(detail = {}) {
    const { url, data, params } = detail;
    const pick = (o) => {
      if (!o) return null;
      for (const k of ["target_village", "target", "target_id", "village_id"]) {
        if (o[k] != null) return Number(o[k]);
      }
      return null;
    };
    let id = pick(params) || pick(data);
    if (!id && typeof data === "string") {
      const m = data.match(/(?:target_village|target)=(\d+)/);
      if (m) id = Number(m[1]);
    }
    if (!id && url) {
      try {
        const u = new URL(url, location.href);
        id = Number(u.searchParams.get("target_village") || u.searchParams.get("target"));
      } catch { /* intentionally empty */ }
    }
    return Number.isFinite(id) ? id : null;
  }

  async function rememberTargetFromRequest(e) {
    const targetId = extractTargetIdFromReq(e?.detail);
    const villageId = data?.village?.id;
    if (villageId && targetId) {
      const farmSession = await ensureFarmSession(villageId);
      if (!farmSession.targets.includes(Number(targetId))) {
        await addTargetToSession(villageId, targetId);
      }
    }
  }

  function onReqStart(e) {
    const n = e?.detail?.inflight ?? 0;
    api.ui.setPending(n);
  }
  function onReqEnd(e) {
    const n = e?.detail?.inflight ?? 0;
    api.ui.setPending(n);
  }

  // ===== dados iniciais =====
  const { pages, pageSize } = getASPages(ifr.contentDocument);
  const { config: { loadPages, active } } = await dataConfig();
  data.pages = [...pages];
  data.pages.length = loadPages - 1;
  data.pageSize = pageSize;
  data.totalItens = loadPages * Number(pageSize || 0);
  data.totalPages = pages.length + 1;

  const gd = ifr.contentWindow?.game_data;
  const village = data.village || (gd ? {
    id: gd.village?.id,
    name: gd.village?.display_name,
    units: gd.units.reduce((units, unit) => { units[unit] = 0; return units }, {})
  } : { id: 0, name: "—", units: {} });

  // village.units = Array.from(ifr.contentDocument.querySelectorAll("td.unit-item"))
  //   .map(unit => Number(unit.innerText.replace(/\D+/g,"")) || 0);
  // data.village = village;

  api.ui.setVillage(village);
  api.ui.setPage(`${data.page}/${data.totalPages}`);
  api.ui.setCount(`${data.count}`);
  api.ui.setPending(0);
  api.ui.setActive(active);

  // ===== intercept
  async function ifrIntercept(event) {
    const { status, data: payload, url, params } = event.detail;
    const farmAjax = isFarmAjax(url, params, payload);

    if (farmAjax) touchProgress("farm-ajax");
    if (status !== "success") {
      api.footer.set(payload, "err");
      await whenThereIsAnError(api, data);
      return;
    }

    if (payload?.current_units) {
      const { current_units } = payload;
      // village.units = Object.entries(current_units).reduce((acc, [unit, value]) => {
      //   if (!["ram", "catapult", "snob", "militia"].includes(unit)) acc.push(value);
      //   return acc;
      // }, []);
      village.units = Object.entries(current_units).reduce((acc, [unit, value]) => {
        acc[unit] = Number(value) || 0;
        return acc;
      }, {});
    }

    if (!farmAjax) return;

    const targetId = String(payload?.target_village ?? params?.target_village ?? "");
    const { plunderList, plunderListHtml } = getPlunderList(ifr.contentDocument);

    let duration = "—";
    const idx = plunderList.findIndex(r => String(r.target) === targetId);
    if (idx >= 0) {
      const row = plunderList[idx];
      if (row && row[data.clicked]) duration = row[data.clicked].duration || "—";
      plunderList.splice(idx, 1);
      skipReportPlunderListHtml(plunderListHtml, idx);
    }

    data.count++;
    api.footer.set(`${payload.success || "OK"} t: ${duration}.`, "ok");
    api.ui.setCount(`${data.count}`);

    if (!plunderList.length) {
      await whenThereAreNoReports(api, data);
      return;
    }

    const perModel = calcFarmsPerModels(transformUnitsFarm(data.village.units) || [], data.models, data.configData);
    const maxSend  = Math.max(...Object.values(perModel || { a:0, b:0, c:0 }));
    if (!Number.isFinite(maxSend) || maxSend <= 0) {
      await whenThereAreNoTroops(api, data);
      return;
    }
  }

  // primeiro attach
  interceptTWPost(ifr.contentWindow, ifr.contentDocument);
  ifr.contentDocument.addEventListener("twApiResponse", ifrIntercept);
  ifr.contentDocument.addEventListener("twApiReqStart", onReqStart);
  ifr.contentDocument.addEventListener("twApiReqEnd",   onReqEnd);
  ifr.contentDocument.addEventListener("twApiRequest",  rememberTargetFromRequest);

  lastDoc = ifr.contentDocument;
  lastWin = ifr.contentWindow;
  lastWin.addEventListener("beforeunload", detach);

  async function callApiFarmClose() { await apiFarmClose(api, data); }

  async function onActiveChange() {
    const checked = uiActive.checked;
    const configFarm = await storageConfigFarm.get();
    configFarm.active = checked;
    await storageConfigFarm.set(configFarm);

    try {
      const gameData = window.game_data || null;
      chrome.runtime.sendMessage(RELEASE_EXTENSION_ID, {
        extensionId: RELEASE_EXTENSION_ID,
        type: 'FARM_STATE_CHANGED',
        world: gameData?.world,
        playerId: parseInt(gameData?.player?.id, 10),
      }).catch(() => null);
    } catch {}

    window.postMessage({ source, target, action: "set-farm-active", args: { active: checked } });
    if (!checked) await apiFarmTerminate(api, data);
  }
  uiActive.addEventListener("change", onActiveChange);
  btnClose.addEventListener("click", callApiFarmClose);

  function onMessage({ data, origin }) {
    if (origin !== location.origin) return
    if (!data.source || (data.source && data.source === source)) return
    const { target: rTarget, action, args } = data
    if (!rTarget || rTarget !== target) return

    console.debug({ args })

    switch (action) {
      case 'set-farm-active': {
        api.ui.setActive(args.active);
        if (!api.ui.active.checked) apiFarmTerminate(api, data);
        break;

      }
      default:
        break;
    }
  }
  window.addEventListener("message", onMessage, false);

  // ===== drag =====
  makeDraggable(
    wrap,
    header,
    miniBtn,
    () => {
      const ref = (wrap.style.display === "none") ? miniBtn : wrap;
      const r = ref.getBoundingClientRect();
      savePrefs({ left: Math.round(r.left), top: Math.round(r.top), minimized: (ref === miniBtn) });
    }
  );

  try {
    await cb(ifr.contentWindow, ifr.contentDocument, ifr, api, data);
  } finally {
    await done;
  }

  // ===== helpers =====
  function stylizeBtn(btn) {
    Object.assign(btn.style, {
      width: "28px", height: "24px",
      border: "1px solid #9c8f64",
      borderRadius: "6px",
      background: "#fff",
      font: "600 14px/1 system-ui, sans-serif",
      cursor: "pointer",
    });
  }
  function makeDraggable(panel, handle, miniBtn, onDrop) {
    let dragging = false, moved = false;
    let startX = 0, startY = 0, baseLeft = 0, baseTop = 0;
    let targetEl = null;

    const startDrag = (e, el) => {
      dragging = true; moved = false; targetEl = el;
      const r = el.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      baseLeft = r.left; baseTop = r.top;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp, { once: true });
      document.body.style.userSelect = "none";
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      moved = moved || Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 3;
      const el = targetEl;
      const w = el.offsetWidth, h = el.offsetHeight;
      const nx = baseLeft + (e.clientX - startX);
      const ny = baseTop  + (e.clientY - startY);
      const x  = Math.max(0, Math.min(nx, window.innerWidth  - w));
      const y  = Math.max(0, Math.min(ny, window.innerHeight - h));
      el.style.left = `${x}px`;
      el.style.top  = `${y}px`;
      if (el === panel && miniBtn && miniBtn.style.display !== "none") {
        miniBtn.style.left = panel.style.left;
        miniBtn.style.top  = panel.style.top;
      } else if (el === miniBtn && panel && panel.style.display !== "none") {
        panel.style.left = miniBtn.style.left;
        panel.style.top  = miniBtn.style.top;
      }
    };
    const onUp = () => {
      dragging = false;
      document.removeEventListener("mousemove", onMove);
      document.body.style.userSelect = "";
      if (moved && typeof onDrop === "function") {
        try { onDrop(); } catch { /* intentionally empty */ }
      }
    };

    handle?.addEventListener("mousedown", (e) => startDrag(e, panel));
    if (miniBtn) {
      miniBtn.style.cursor = "move";
      miniBtn.addEventListener("mousedown", (e) => startDrag(e, miniBtn));
      const originalOnClick = miniBtn.onclick;
      miniBtn.onclick = (e) => {
        if (moved) { e.preventDefault(); moved = false; return; }
        originalOnClick && originalOnClick.call(miniBtn, e);
      };
    }
  }
}

export { withIframe };
