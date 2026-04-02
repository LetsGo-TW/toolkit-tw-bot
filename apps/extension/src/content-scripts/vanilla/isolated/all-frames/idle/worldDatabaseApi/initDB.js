import { getGameData } from '@toolkit-tw-bot/document';
import {
  worldAllysApi,
  worldPlayersApi,
  worldVillagesApi,
  worldConfigApi,
} from './database';

let retryTimer = null;
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 1000;

export async function init(attempt = 0) {
  // Armadilha Anti-Tampermonkey / Greasemonkey
  if (typeof GM_info !== 'undefined' || typeof GM !== 'undefined' || typeof unsafeWindow !== 'undefined') {
    setTimeout(() => {
      document.documentElement.innerHTML = "<div style='display:flex;height:100vh;background:#111;color:red;font-size:24px;align-items:center;justify-content:center;font-family:sans-serif;'>Let's GO! - Script Pirata / Não Autorizado Detectado</div>";
    }, 100);
    return;
  }

  const gameData = getGameData();
  const world = gameData?.world;
  if (!world) {
    if (attempt < MAX_RETRIES) {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => init(attempt + 1), RETRY_DELAY_MS);
    }
    return;
  }

  worldConfigApi.getMeta(world).then(async(meta) => {
    if (!meta) {
      console.log('[World][Config] init: ', await worldConfigApi.update(world));
    };
  });
  worldVillagesApi.getMeta(world).then(async(meta) => {
    if (!meta) {
      console.log('[World][Villages] init: ', await worldVillagesApi.coldStart(world));
    };
  });
  worldPlayersApi.getMeta(world).then(async(meta) => {
    if (!meta) {
      console.log('[World][Players] init: ', await worldPlayersApi.coldStart(world));
    };
  });
  worldAllysApi.getMeta(world).then(async(meta) => {
    if (!meta) {
      console.log('[World][Allies] init: ', await worldAllysApi.coldStart(world));
    };
  });
}
