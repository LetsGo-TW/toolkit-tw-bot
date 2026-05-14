// ./index.js
import Running from "../../running";
import { storageFarmSchedules } from "../config";
import { dataConfig } from "../config/data";
import { withIframe } from "./core/with-iframe";
import { apiFarm, goToPage, requestApiFarmStop, whenThereIsAnError } from "./core/api-farm";
import { getFarmSession } from "./core/farm-session";
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document";
import { BotViewStatus } from "../../shared/bot-view-status";

/** Mensageria cross-janela (não alterar) */
export const source = "FARM-HANDLER";
export const target = "GO-FARM";

export const running = new Running('farmHandler');

const activeExecution = {
  api: null,
  data: null,
  stopPromise: null,
  stopRequested: false,
};

function resetActiveExecution() {
  activeExecution.api = null;
  activeExecution.data = null;
  activeExecution.stopPromise = null;
  activeExecution.stopRequested = false;
}

async function stopActiveExecution(reason = "Stopped by controller.") {
  activeExecution.stopRequested = true;

  if (activeExecution.stopPromise) {
    return await activeExecution.stopPromise;
  }

  const { api, data } = activeExecution;
  if (!api || !data) return;

  activeExecution.stopPromise = requestApiFarmStop(api, data, { reason });

  try {
    await activeExecution.stopPromise;
  } finally {
    activeExecution.stopPromise = null;
  }
}

// helper: constrói URL do AM Farm
export const buildFarmUrl = (villageId, cfg) => {
  const gameData = getGameData()
  const url = new URL(`${gameData.link_base_pure}am_farm&order=${cfg.orderBy}&dir=${cfg.orderDir}&Farm_page=0`, window.location.origin);
  url.searchParams.set('village', villageId);
  return url.toString()
}

export const pause = async () => {
  running.pause();
};

export const resume = async () => {
  running.resume();
};

export const destroy = async(detail = {}) => {
  const reason = typeof detail === "string"
    ? detail
    : detail?.reason || "Destroyed by controller.";

  await stopActiveExecution(reason);
};

export default async function start(data = {}, context = null) {
  // Garante que apenas um processo do bot rode por vez, evitando sobrecarga e comportamento não-humano.
  if (running.is_active()) {
    // A verificação é feita com is_active() sem argumentos para detectar QUALQUER processo ativo.
    console.warn("[FARM-HANDLER] Abortado: já existe outro processo do bot em execução.");
    return;
  }

  resetActiveExecution();

  const gameData = getGameData();
  if (!gameData?.features?.FarmAssistent?.active) {
    console.warn("Assistente de Saque inativo no jogo. Abortando inicialização do Farm.");
    return;
  }

  const ICON_48_URL = `chrome-extension://${RELEASE_EXTENSION_ID}/icons/ico.green.128.png`;

  const schedules = await storageFarmSchedules.get() || { values: [] };
  if (!Array.isArray(schedules.values) || schedules.values.length === 0) {
    console.warn("[FARM-HANDLER] ERROR: A lista de agendamento (schedules) está vazia.");
    return;
  }

  const village = schedules.values[0];
  if (!village || !village.id) {
    console.warn("[FARM-HANDLER] ERROR: Não há ID da vila nos valores agendados.");
    return;
  }

  const session = await getFarmSession()

  const count = session && session.villageId && Number(session.villageId) === Number(village.id)
    ? session.targets.length
    : 0

  running.activate();

  BotViewStatus.setCurrent("Farm Max")
  BotViewStatus.setExecution("Executando")

  document.addEventListener("go-to-page", goToPage);

  context?.registerHandle?.({
    pause: async() => {
      await pause();
    },
    stop: async(detail = {}) => {
      await destroy({
        ...detail,
        reason: detail?.reason || "Stopped by controller.",
      });
    },
    destroy: async(detail = {}) => {
      await destroy({
        ...detail,
        reason: detail?.reason || "Destroyed by controller.",
      });
    },
  });

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

    activeExecution.data = data;

    window.postMessage({
      source, target: "GO-FARM", action: "go-farm-status", args: {
        message: 'Executando...',
        display: 'flex'
      }
    });

    // withIframe só retorna quando o Terminate chamar api.close()
    if (window.__twbot_iframe_mounting) {
      console.warn("[FARM-HANDLER] Evitando reentrância (iframe já está montando).");
      return;
    }
    window.__twbot_iframe_mounting = true;

    await withIframe(
      url,
      async (...args) => {
        const [ , , , apiArg, dataArg ] = args;
        activeExecution.api = apiArg || null;
        activeExecution.data = dataArg || activeExecution.data;

        if (activeExecution.stopRequested) {
          await stopActiveExecution("Stopped before farm loop start.");
          return;
        }

        try {
          await apiFarm(...args);
        } catch (error) {
          if (error?.message === 'Identified bot protection') {
            console.warn('Captcha detectado! Encerrando...');
            if (apiArg && dataArg) {
              await whenThereIsAnError(apiArg, dataArg, { error });
            }
            return;
          }
          throw error;
        }
      },
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
    if (e?.message === 'Identified bot protection') {
      console.warn("WithIframe: captcha detectado");

      if (activeExecution.api && activeExecution.data) {
        try {
          await whenThereIsAnError(activeExecution.api, activeExecution.data, { error: e });
        } catch { /* intentionally empty */ }
      } else {
        try { ProtectingBot.redirect(); } catch { /* intentionally empty */ }
      }
    }

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
    resetActiveExecution();
    window.__twbot_iframe_mounting = false;
  }
};
