import { running, source, target } from "..";
import { calculateNumberOfFarmsPerModel } from "../../common/calculate-number-of-attacks-per-model";
import { storageFarmSchedules } from "../../config";
import { dataConfig } from "../../config/data";
import { saveLastInConfig } from "../../config/save-last";
import { getModels } from "../../models/get-models";
import { runLoop } from "../../utils/runLoop";
import { sleep, sleepAbort } from "../../utils/sleep";
import { ensureFarmSession } from "./farm-session";
import { avaiableButtonsForReport, getPlunderList, setPlunderListAvaliables } from "./plunder-list";
import { transformUnitsFarm } from "../../common/transform-units-farm-array";
import { handlerBreakWall } from "../break-wall";
import { isAliveTarget, updateAliveTargets } from "../alive-targets";
import { ProtectingBot } from "@toolkit-tw-bot/document";

const PAGE_TIMEOUT_MS = 30_000;           // 30s sem progresso
const PAGE_REFRESH_RETRIES = 1;           // tenta 1x refresh da página

let controller = createController();
const BOT_PROTECT_REASON = "bot-protect";

function resetPageTransition(data) {
  if (!data || typeof data !== "object") return;
  data.__pageTransition = "";
}

function claimPageTransition(data, nextState) {
  if (!data || typeof data !== "object") return true;
  if (data.__pageTransition) {
    console.debug("[farm] duplicate transition ignored", {
      current: data.__pageTransition,
      next: nextState
    });
    return false;
  }
  data.__pageTransition = String(nextState || "pending");
  return true;
}

function setPageTransition(data, nextState) {
  if (!data || typeof data !== "object") return;
  data.__pageTransition = String(nextState || "");
}

function createController() {
  if (typeof AbortController === "function") return new AbortController();
  // shim mínimo
  const listeners = new Set();
  const signal = {
    aborted: false,
    reason: undefined,
    addEventListener(type, fn) { if (type === "abort") listeners.add(fn); },
    removeEventListener(type, fn) { if (type === "abort") listeners.delete(fn); },
    dispatchEvent() { return true; },
    onabort: null,
  };
  return {
    signal,
    abort(reason) {
      if (signal.aborted) return;
      signal.aborted = true;
      signal.reason = reason;
      try { signal.onabort?.(new Event("abort")); } catch { /* intentionally empty */ }
      for (const fn of Array.from(listeners)) { try { fn(new Event("abort")); } catch { /* intentionally empty */ } }
      listeners.clear();
    }
  };
}

function isBotProtectError(error) {
  return error?.message === "Identified bot protection";
}

function hasActiveBotProtect(api) {
  const d = api?.iframe?.contentDocument;
  const w = api?.iframe?.contentWindow;

  return ProtectingBot["bot-protect-all-in-game"].active(d, w)
    || ProtectingBot["bot-protect-all-in-game"].active();
}

function markBotProtectTermination(data) {
  if (data && typeof data === "object") {
    data.__terminateReason = BOT_PROTECT_REASON;
  }

  return BOT_PROTECT_REASON;
}

function resolveTerminateReason(api, data, {
  reason = null,
  error = null,
} = {}) {
  if (String(reason || "").trim().toLowerCase() === BOT_PROTECT_REASON) {
    return markBotProtectTermination(data);
  }

  if (String(data?.__terminateReason || "").trim().toLowerCase() === BOT_PROTECT_REASON) {
    return BOT_PROTECT_REASON;
  }

  if (isBotProtectError(error)) {
    return markBotProtectTermination(data);
  }

  if (hasActiveBotProtect(api)) {
    return markBotProtectTermination(data);
  }

  return null;
}

const cooloff = async () => { await sleep(7, 19); running.remove?.(); };

const dispatchFarmPageEvent = (ifr, api, data) => {
  const customEvent = new CustomEvent("go-to-page", { detail: { ifr, api, data } });
  document.dispatchEvent(customEvent);
};

function touch(data) { data._lastProgressAt = Date.now(); }

function syncUI(api, data) {
  if (!data.page || data.totalPages || data.count) return
  try { api.ui.setPage?.(`${data.page}/${data.totalPages}`); } catch { /* intentionally empty */ }
  try { api.ui.setCount?.(`${data.count}`); } catch { /* intentionally empty */ }
}

async function waitInflightToDrain(api, data, maxMs = 1800) {
  const started = Date.now();
  let lastN = -1;
  while ((data._inflight | 0) > 0 && Date.now() - started < maxMs) {
    // <<< NOVO: aborta se captcha surgir
    if (typeof ProtectingBot !== 'undefined') {
      const d = api?.iframe?.contentDocument, w = api?.iframe?.contentWindow;
      if (ProtectingBot['bot-protect-all-in-game'].active(d, w) || ProtectingBot['bot-protect-all-in-game'].active()) break;
    }

    const n = data._inflight | 0;
    if (n !== lastN) {
      try { api.footer.set(`Aguardando ${n} resposta(s) pendente(s)…`, 'warn'); } catch { /* intentionally empty */ }
      lastN = n;
    }
    await sleep(80, 120);
  }
}

function startPageWatchdog(w, d, ifr, api, data) {
  touch(data);
  try { clearInterval(data._wd); } catch { /* intentionally empty */ }
  data._wd = setInterval(async () => {
    if (controller.signal.aborted) { clearInterval(data._wd); return; }

    // <<< NOVO: captcha a qualquer momento
    if (
        ProtectingBot['bot-protect-all-in-game'].active(d, w) ||
        ProtectingBot['bot-protect-all-in-game'].active()
      ) {
      clearInterval(data._wd);
      try { controller.abort('captcha'); } catch { /* intentionally empty */ }
      try { api.footer.set('hCaptcha identificado! Encerrando…', 'err'); } catch { /* intentionally empty */ }
      return await whenThereIsAnError(api, data, {
        reason: BOT_PROTECT_REASON,
      });
    }

    const idle = Date.now() - (data._lastProgressAt || 0);
    if (idle >= PAGE_TIMEOUT_MS) {
      clearInterval(data._wd);
      try { controller.abort('page-timeout'); } catch { /* intentionally empty */ }
      const retries = data._pageRefreshes || 0;

      if (retries < PAGE_REFRESH_RETRIES) {
        data._pageRefreshes = retries + 1;
        api.footer.set(
          `Sem progresso há ${parseInt(PAGE_TIMEOUT_MS/1000)}s (inflight=${data._inflight|0}).` +
          (retries < PAGE_REFRESH_RETRIES ? " Atualizando a página…" : " Avançando/fechando…"),
          "warn"
        );
        const { w: w2, d: d2 } = await api.refresh();
        return await apiFarm(w2, d2, ifr, api, data);
      }

      api.footer.set(`Sem progresso após atualização. Avançando/fechando…`, 'warn');

      const aindaTemTropa = Math.max(...Object.values(calcFarmsPerModels(transformUnitsFarm(data.village?.units) || [], data.models, data.configData))) > 0;
      if (data.pages?.length && data.page < data.totalPages && aindaTemTropa && data.count < data.totalItens) {
        return await apiFarmNavigate(ifr, api, data);
      }
      return await apiFarmTerminate(api, data);
    }
  }, 1000);

  controller.signal.addEventListener('abort', () => {
    try { clearInterval(data._wd); } catch { /* intentionally empty */ }
  }, { once: true });
}

async function updateSchedules() {
  const schedules = await storageFarmSchedules.get();
  schedules.values.splice(0, 1);
  schedules.count++
  await storageFarmSchedules.set(schedules);
  window.postMessage({ source, target, action: "go-farm-schedules" });
}

// -------- navegação robusta --------
function buildNextFarmUrlFromCurrent(currentHref) {
  const u = new URL(currentHref || location.href, location.href);
  const cur = Number(u.searchParams.get("Farm_page")) || 0;
  u.searchParams.set("Farm_page", String(cur + 1));
  return u.href;
}

async function apiFarmNavigate(ifr, api, data, { claimed = false } = {}) {
  if (!claimed && !claimPageTransition(data, "navigate")) return;
  setPageTransition(data, "navigate");
  try { controller.abort("Navigate."); } catch { /* intentionally empty */ }
  let nextUrl = Array.isArray(data.pages) && data.pages.length ? data.pages.shift() : null;
  if (!nextUrl) nextUrl = buildNextFarmUrlFromCurrent(ifr?.contentWindow?.location?.href || data.url || location.href);

  if (!data._visited) data._visited = new Set();
  if (data._visited.has(nextUrl)) {
    console.warn("[navigate] O Total de páginas configurado foi atingido.", nextUrl);
    api.footer.set?.(`O Total de páginas configurado foi atingido.`, 'warn');
    await sleep(1000, 1111);
        await apiFarmClose(api, data, { claimed: true });
    return;
  }
  data._visited.add(nextUrl);

  data.url = nextUrl;
  data.page = (data.page || 0) + 1;

  // <<< novo: deixa claro na UI
  try {
    api.ui.setPage?.(`${data.page}/${data.totalPages}`);
    api.footer.set?.(`Navegando para pg.${data.page}/${data.totalPages}…`, 'warn');
  } catch { /* intentionally empty */ }

  dispatchFarmPageEvent(ifr, api, data);
}

// listener único e estável
const goToPage = async (event) => {
  const { ifr, api, data } = event.detail || {};
  if (!api || !ifr || !data?.url) { await apiFarmTerminate(api, data); return; }

  const u = new URL(data.url, location.href);
  if (u.origin !== location.origin) { await apiFarmTerminate(api, data); return; }

  let w, d;
  try {
    ({ w, d } = await api.navigate(u.href));
  } catch (err) {
    console.warn("[go-to-page] navegação falhou/timeout. Fluxo já encerrado.", err);
    await apiFarmTerminate(api, data)
    return;
  }

  try {
    await apiFarm(w, d, ifr, api, data);
  } catch (error) {
    if (isBotProtectError(error)) {
      return await whenThereIsAnError(api, data, {
        error,
      });
    }
    throw error;
  }
};

async function apiFarmClose(api, data, { claimed = false } = {}) {
  if (!claimed && !claimPageTransition(data, "close")) return;
  setPageTransition(data, "close");
  try { controller.abort("Closed."); } catch { /* intentionally empty */ }
  await updateSchedules();
  await apiFarmTerminate(api, data);
}

// -------- terminate central (idempotente) --------
async function apiFarmTerminate(api, data, options = {}) {
  if (data && data.__terminated) return;
  if (data) data.__terminated = true;

  const shouldRedirectToBotProtect = resolveTerminateReason(api, data, options) === BOT_PROTECT_REASON;

  try { clearInterval(data._wd); } catch { /* intentionally empty */ }

  // 1) drena ajax pendente p/ refletir contadores na UI
  await waitInflightToDrain(api, data, 1800);
  syncUI(api, data);

  const schedules = await storageFarmSchedules.get();
  console.debug("IN TERMINATE", schedules);

  // 2) só agora limpamos os listeners
  try { (api?.cleanListeners || api?.cleanListners)?.(); } catch { /* intentionally empty */ }
  try { document.removeEventListener("go-to-page", goToPage); } catch { /* intentionally empty */ }

  if (!schedules.values.length) { try { await saveLastInConfig(source, "GO-FARM"); } catch { /* intentionally empty */ } }

  try { if (data && typeof data === "object") Object.keys(data).forEach(k => { data[k] = null; }); } catch { /* intentionally empty */ }

  await cooloff();
  try { api?.close?.(); } catch { /* intentionally empty */ }

  if (shouldRedirectToBotProtect) {
    try {
      ProtectingBot.redirect();
    } catch (error) {
      console.error("[farm][bot-protect][redirect]", error);
    }
  }
}

// -------- condições de parada --------
async function whenThereAreNoReports(api, data, { claimed = false } = {}) {
  if (!claimed && !claimPageTransition(data, "no-reports")) return;
  setPageTransition(data, "no-reports");
  await sleep(1000, 1111);

  if (data.pages.length) {
    if (!Math.max(...Object.values(calcFarmsPerModels(transformUnitsFarm(data.village?.units) || [], data.models, data.configData)))) {
      await whenThereAreNoTroops(api, data, { claimed: true })
      return
    }
    setPageTransition(data, "navigate");
    try { controller.abort("End reports."); } catch { /* intentionally empty */ }
    api.footer.set(`Fim dos relatórios! Indo para a pg.${data.page + 1}...`, "warn");
    await sleep(1000, 1111);
    await apiFarmNavigate(api.iframe, api, data, { claimed: true });
    return;
  }

  setPageTransition(data, "terminate");
  try { controller.abort("End reports and pages."); } catch { /* intentionally empty */ }
  api.footer.set(`Fim dos relatórios e páginas! Fechando...`, "warn");
  await updateSchedules();
  await sleep(1000, 1111);
  syncUI(api, data)
  await apiFarmTerminate(api, data);
}

async function whenThereAreNoTroops(api, data, { claimed = false } = {}) {
  if (!claimed && !claimPageTransition(data, "no-troops")) return;
  setPageTransition(data, "terminate");
  try { controller.abort("End units."); } catch { /* intentionally empty */ }
  api.footer.set(`Fim das Tropas! Fechando...`, "warn");
  await updateSchedules();
  await sleep(1000, 1111);
  syncUI(api, data)
  await apiFarmTerminate(api, data);
}

async function whenThereIsAnError(api, data, {
  claimed = false,
  reason = null,
  error = null,
} = {}) {
  if (!claimed && !claimPageTransition(data, "error")) return;
  setPageTransition(data, "terminate");
  const terminateReason = resolveTerminateReason(api, data, {
    reason,
    error,
  });
  try { controller.abort(terminateReason === BOT_PROTECT_REASON ? "captcha" : "Error."); } catch { /* intentionally empty */ }
  await sleep(1200, 1211);
  await apiFarmTerminate(api, data, {
    reason: terminateReason,
    error,
  });
}

async function requestApiFarmStop(api, data, { reason = "Stopped by controller." } = {}) {
  if (!api || !data || data.__terminated) return;
  if (!claimPageTransition(data, "external-stop")) return;

  setPageTransition(data, "terminate");

  try { controller.abort(reason); } catch { /* intentionally empty */ }
  try { api.footer.set(`Execucao interrompida.`, "warn"); } catch { /* intentionally empty */ }

  await apiFarmTerminate(api, data, { reason });
}

// -------- utilidades de tabela --------
function skipReportPlunderListHtml(plunderListHtml, index) {
  plunderListHtml.splice(index, 1)[0].remove();
  if (plunderListHtml.length) {
    // Procura especificamente a próxima linha oculta pela rolagem (display: none),
    // ignorando as linhas que acabamos de clicar e ocultamos com a classe 'go-hidden'
    const el = plunderListHtml.find(el => el.style.display === "none" && !el.classList.contains("go-hidden"));
    if (el) el.removeAttribute("style");
  }
}

function calcFarmsPerModels(units = [], models = [], configData) {
  const [C, A, B] = calculateNumberOfFarmsPerModel(units, models, configData);
  return { a: parseInt(A) || 0, b: parseInt(B) || 0, c: parseInt(C) || 0 };
}

// -------- rotina principal por página --------
const apiFarm = async (
  w = window, d = document, ifr = null, api = null,
  data = {
    village: null,
    page: 1,
    pages: [],
    pageSize: 0,
    totalItens: 0,
    totalPages: 0,
    count: 0,
    url: ""
  }
) => {
  controller = createController();
  resetPageTransition(data);

  api.setBlockClicks(true);

  const configData = await dataConfig();
  data.configData = configData;
  const ATTAKS_PER_SECOND = Number(configData.config.attacksPerSecond || 4);
  const RANGE = ATTAKS_PER_SECOND === 5 ? [6, 21] : [1, 50];
  const msValue = Math.round(1000 / ATTAKS_PER_SECOND);
  const randomInterval = { min: msValue + RANGE[0], max: msValue + RANGE[1] };

  // manter UI de página aqui
  try { api.ui.setVillage?.(data.village); } catch { /* intentionally empty */ }
  try { api.ui.setPage?.(`${data.page}/${data.totalPages}`); } catch { /* intentionally empty */ }

  // api-farm.js (correto)
  ifr.addEventListener("load", () => {
    // respeita o estado atual (minimizado ou não)
    try { api.ui.applyVisibility?.(); } catch { /* intentionally empty */ }
    try { api.isolatePlunderList(); api.presentCompactPlunder(); } catch { /* intentionally empty */ }
  });

  // garante sessão da vila atual (não usa id na chave, só no payload)
  try {
    const vId = data?.village?.id;
    if (vId) await ensureFarmSession(vId)
  } catch { /* intentionally empty */ }

  // Otimização Visual (DOM Pruning): Desliga as animações nativas do TW para poupar CPU/RAM
  try {
    if (!d.getElementById('go-farm-opt-css')) {
      const style = d.createElement('style');
      style.id = 'go-farm-opt-css';
      style.innerHTML = `* { transition: none !important; animation: none !important; } #plunder_list tr[style*="opacity"] { display: none !important; } .go-hidden { display: none !important; }`;
      d.head.appendChild(style);
    }
  } catch (e) {}
  // anti-bot
  if (ProtectingBot["bot-protect-all-in-game"].active(d, w) || ProtectingBot["bot-protect-all-in-game"].active()) {
    api.footer.set(`hCaptcha identificado! Encerrando...`, "err");
    await sleep(1000, 1111);
    throw ProtectingBot.error();
  }

  // models da página
  await sleepAbort({ min: 1000, max: 1111 }, { signal: controller.signal });
  const models = getModels(ifr.contentDocument);
  if (!models || !Array.isArray(models) || models.length === 0) {
    // Se não encontrar os modelos, é um erro crítico para a operação do farm.
    // Lançar um erro aqui vai parar a execução da vila atual e exibir a mensagem no rodapé.
    throw new Error("Modelos de farm (A, B, C) não foram encontrados na página.");
  }
  data.models = models;

  // atualizar units a cada troca de página
  // data.village.units = Array.from(ifr.contentDocument.querySelectorAll("td.unit-item"))
  //   .map(unit => Number(unit.innerText.replace(/\D+/g,"")) || 0);

  startPageWatchdog(w, d, ifr, api, data);

  try {
    // break wall
    api.loader.show()
    await handlerBreakWall(data, api, d, w)
    // await updateSentsBlue(data, api, d, w)
    await updateAliveTargets(data, api, d, w)
    api.loader.hide()
  } catch (error) {
    api.loader.hide();
    if (isBotProtectError(error)) {
      return await whenThereIsAnError(api, data, {
        error,
      });
    }
    console.error('Erro na fase inicial (BreakWall/AliveTargets):', error);
    // Não re-lançamos o erro para não travar a UI (fica com loader infinito)
    // e permitir que o bot continue o farm normal caso falhe um desses módulos.
  }

  // fila local da página
  const queue = [];

  // passo do loop
  const step = async () => {
    try {
      while (running.is_paused()) {
        if (controller.signal.aborted) return;
        await sleep(1000, 1500);
      }

      const item = queue.shift();

      if (
        ProtectingBot["bot-protect-all-in-game"].active(d, w) ||
        ProtectingBot["bot-protect-all-in-game"].active()
      ) {
        queue.length = 0;
        throw ProtectingBot.error();
      }

      const avaliableButtons = await avaiableButtonsForReport(item);
      const button = avaliableButtons.reduce((active, button) => {
        if (
          !active &&
          !d.querySelector(`#village_${item.target} a.farm_icon_${button}.farm_icon_disabled`) &&
        calcFarmsPerModels(transformUnitsFarm(data.village.units), data.models, configData)[button] > 0
        ) active = button
        return active
      }, undefined);

      console.debug(`%c ${
          button ? String(button).toLocaleUpperCase() : '🚫'
        } %c units: [${
          transformUnitsFarm(data.village.units).join(', ')
        }] ${
          button ? '🖱️' : '⏭️'
        }`,
        'background:#1976d2;color:#fff;padding:2px 6px;border-radius:4px',
        'font-weight:700'
      );

      api.ui.setButton(button)

      if (button && !(await isAliveTarget(item.target))) { //villas com tropas
        data.clicked = button;
        const btn = item[button];

        if (btn?.el && typeof btn.el.onclick === 'function') {
          try {
            // 1. Manda direto (já possui o escopo atrelado por ser propriedade do objeto)
            btn.el.onclick();
          } catch (e) {
            // 2. Manda call (força o escopo do this caso o direto falhe)
            btn.el.onclick.call(btn.el);
          }
        } else if (btn?.action) {
          btn.action(); // Fallback do disparador interno
        } else if (btn?.el?.click) {
          btn.el.click(); // 3. Último caso o click físico
        }

        // Esconde a linha instantaneamente após o clique para evitar lag de renderização do jQuery do TW
        try {
          const row = d.querySelector(`#village_${item.target}`);
          if (row) {
            row.classList.add('go-hidden');
            // Puxa a próxima linha para cima instantaneamente para manter as 5 visíveis
            const nextRow = Array.from(d.querySelectorAll('#plunder_list tr[id^="village_"]')).find(r => r.style.display === "none" && !r.classList.contains("go-hidden"));
            if (nextRow) nextRow.removeAttribute("style");
          }
        } catch (e) {}

        data.report = item;
      } else {
        const targetDisplay = `(${item.x}|${item.y}) K${String(item.y).padStart(3, 0).substring(0, 1)}${String(item.x).padStart(3, 0).substring(0, 1)}`
        // nada clicável → pular a linha do ITEM (não a primeira!)
        api.footer.set(`Pulou alvo ${targetDisplay}.`, "warn");

        const { plunderList, plunderListHtml } = getPlunderList(d);
        const idx = plunderList.findIndex(r => String(r.target) === String(item?.target));
        if (idx >= 0) {
          plunderList.splice(idx, 1);
          skipReportPlunderListHtml(plunderListHtml, idx);
        }

        // se esvaziou a fila, decide próximo passo
        if (!queue.length) {
          await whenThereAreNoReports(api, data);
        } else if (!Math.max(...Object.values(calcFarmsPerModels(transformUnitsFarm(data.village?.units) || [], data.models, configData)))) {
          await whenThereAreNoTroops(api, data);
        }

        touch(data);
      }
    } catch (error) {
      if (isBotProtectError(error)) {
        queue.length = 0;
        return await whenThereIsAnError(api, data, {
          error,
        });
      }
      throw error;
    }
  };

  // lança o loop inicial
  const show = async () => {
    api.footer.set(`Carregando a lista de farm...`, "warn");
    const { plunderList } = await setPlunderListAvaliables(d);

    touch(data);
    if (plunderList.length) {
      requestAnimationFrame(() => {
        try { api.isolatePlunderList(); api.presentCompactPlunder(); } catch { /* intentionally empty */ }
      });

      queue.push(...plunderList);
      const condition = () => queue.length > 0 && data.count <= data.totalItens;

      runLoop({ condition, step, randomInterval, signal: controller.signal });

      // watchdog auxiliar para quando a fila zera e ainda há itens clicáveis
      const watchdog = setInterval(async () => {
        if (controller.signal.aborted) { clearInterval(watchdog); return; }

        if (queue.length === 0) {
          const { plunderList: avail } = await setPlunderListAvaliables(d);

          if (avail.length > 0) {
            queue.push(...avail);
            runLoop({ condition, step, randomInterval, signal: controller.signal });
          } else {
            clearInterval(watchdog);
            await whenThereAreNoReports(api, data);
          }
        }
      }, 1200);
      controller.signal.addEventListener("abort", () => clearInterval(watchdog), { once: true });
    } else {
      await whenThereAreNoReports(api, data)
    }
  };

  await show();
};

// ====== exports ======
export {
  apiFarm,
  apiFarmNavigate,
  goToPage,
  apiFarmClose,
  apiFarmTerminate,
  whenThereAreNoReports,
  whenThereAreNoTroops,
  whenThereIsAnError,
  requestApiFarmStop,
  skipReportPlunderListHtml,
  calcFarmsPerModels
};
