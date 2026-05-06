// ./index.js
import Running from "../../running";
import { storageFarmSchedules } from "../config";
import { dataConfig } from "../config/data";
import { withIframe } from "./core/with-iframe";
import { apiFarm, goToPage } from "./core/api-farm";
import { getFarmSession } from "./core/farm-session";
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { getGameData } from "@toolkit-tw-bot/document";

/** Mensageria cross-janela (não alterar) */
export const source = "FARM-HANDLER";
export const target = "GO-FARM";

export const running = new Running('farmHandler');

// helper: constrói URL do AM Farm
export const buildFarmUrl = (villageId, cfg) => {
  const gameData = getGameData()
  const url = new URL(`${gameData.link_base_pure}am_farm&order=${cfg.orderBy}&dir=${cfg.orderDir}&Farm_page=0`, window.location.origin);
  url.searchParams.set('village', villageId);
  return url.toString()
}

export const pause = () => {
  running.pause();
};

export const resume = () => {
  running.resume();
};

export const destroy = () => {
  window.postMessage({ source: "SW-CONTROLLER", target: "GO-FARM", action: "farm-destroy" });
};

export const start = async () => {
  const gameData = getGameData();
  if (!gameData?.features?.FarmAssistent?.active) {
    console.warn("Assistente de Saque inativo no jogo. Abortando inicialização do Farm.");
    return;
  }

  const ICON_48_URL = `chrome-extension://${RELEASE_EXTENSION_ID}/icons/ico.green.128.png`;
  if (running.is_active()) {
    console.debug("ERROR: There is already a script running.");
    return;
  }

  const schedules = await storageFarmSchedules.get() || { values: [] };
  if (!Array.isArray(schedules.values) || schedules.values.length === 0) {
    console.debug("ERROR: Not schedules list.");
    return;
  }

  const village = schedules.values[0];
  if (!village || !village.id) {
    console.debug("ERROR: Not village in schedules values.");
    return;
  }

  const session = await getFarmSession()

  const count = session && session.villageId && Number(session.villageId) === Number(village.id)
    ? session.targets.length
    : 0

  running.activate();
  document.addEventListener("go-to-page", goToPage);

  try {
    const { config } = await dataConfig();
    const url = buildFarmUrl(village.id, config);

    const data = {
      village,
      vCount: schedules.count,
      vTotal: schedules.total,
      page: 1,
      pageSize: 0,
      pages: [],
      totalItens: 0,
      totalPages: 0,
      count,
      url,
      reports: []
    };

    window.postMessage({
      source, target: "GO-FARM", action: "go-farm-status", args: {
        message: 'Executando...',
        display: 'flex'
      }
    });

    // withIframe só retorna quando o Terminate chamar api.close()
    if (window.__twbot_iframe_mounting) return;  // evita reentrância
    window.__twbot_iframe_mounting = true;
    await withIframe(
      url,
      apiFarm,
      data,
      {
        keepAlive: true,
        visible: true,
        width: 530,
        top: 200,
        left: 20,
        autoCompact: true,
        maxRows: 5,
        navTimeout: 20000,
        ICON_48_URL
      }
    );

    console.log("WithIframe: finished");
  } catch (e) {
    console.error("WithIframe: error", e);
  } finally {
    window.postMessage({
      source, target: "GO-FARM", action: "go-farm-status", args: {
        message: 'Aguardando próxima execução...',
        display: 'none'
      }
    });
    try { document.removeEventListener("go-to-page", goToPage); } catch { /* intentionally empty */ }
    try { running.remove?.(); } catch { /* intentionally empty */ }
    window.__twbot_iframe_mounting = false;
  }
};

export default start;
