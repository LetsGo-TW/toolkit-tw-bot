/**
 * EXEMPLO: Como usar http-retry em break-wall/requests.js
 *
 * Isso resolve o problema 405 Method Not Allowed durante reload
 */

// === ANTES (sem retry) ===
/*
async function fetchConfirmCommand(villageId, payloadCommand) {
  const url = new URL(`/game.php?village=${villageId}&screen=place&ajax=confirm`, origin)
  const body = new URLSearchParams();
  for (const [k, v] of payloadCommand) body.append(k, v);

  const controller = new AbortController();
  const headers = makeAjaxHeaders();
  headers.set("content-type", "application/x-www-form-urlencoded; charset=UTF-8");

  const req = new Request(url.toString(), {
    method: "POST",
    headers,
    body,
    credentials: "include",
    referrerPolicy: "origin",
    cache: "no-store",
    signal: controller.signal
  });

  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(req);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);  // <-- Quebra aqui em 405!
    const { response, error } = await res.json();
    if (error || !response || !response.dialog) throw new Error(error || response.toString())
    // ... resto do código
  } finally {
    clearTimeout(t);
  }
}
*/

// === DEPOIS (com retry) ===

import { getGameData } from '@toolkit-tw-bot/document';
import { fetchWithRetry, DEFAULT_RETRY_CONFIG } from '../common/http-retry.js'

function makeAjaxHeaders() {
  const h = new Headers();
  h.set("accept", "application/json, text/javascript, */*; q=0.01");
  h.set("tribalwars-ajax", "1");
  h.set("x-requested-with", "XMLHttpRequest");
  return h;
}

async function fetchConfirmCommandV2(villageId, payloadCommand) {
  const url = new URL(`/game.php?village=${villageId}&screen=place&ajax=confirm`, origin)
  const body = new URLSearchParams();
  for (const [k, v] of payloadCommand) body.append(k, v);

  const headers = makeAjaxHeaders();
  headers.set("content-type", "application/x-www-form-urlencoded; charset=UTF-8");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    // Usa fetchWithRetry em vez de fetch direto
    // Isso trata 405 com retry automático
    const res = await fetchWithRetry(
      url.toString(),
      {
        method: "POST",
        headers,
        body,
        credentials: "include",
        referrerPolicy: "origin",
        cache: "no-store",
        signal: controller.signal
      },
      {
        maxRetries: 3,                                    // Tenta 3 vezes em 405
        initialDelayMs: 500,                              // Aguarda 500ms na 1ª tentativa
        maxDelayMs: 2000,
        backoffMultiplier: 2,
        retryableStatuses: [405, 408, 429, 500, 502, 503]
      }
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const { response, error } = await res.json();
    if (error || !response || !response.dialog) throw new Error(error || response.toString())

    // ... resto do código igual
    const html = new DOMParser().parseFromString(response.dialog, "text/html");
    const durationSecond = Number(html?.querySelector('.relative_time')?.dataset?.duration)
    const inputs = Array.from(html.querySelectorAll("#command-data-form input"));
    const payload = inputs.reduce((arr, el) => {
      const name = el.getAttribute("name");
      if (name && !['submit_confirm', 'save_default_attack_building'].includes(name)) {
        const value = name === 'attack_name' && !el.getAttribute("value") && gameData.features.Premium.active
          ? 'breakWall'
          : el.getAttribute("value") ?? "troop_confirm_submit";
        arr.push([name, value])
      }
      return arr;
    }, []);

    if (!payload.find(([n]) => n === "building")) payload.push(["building", "wall"]);
    payload.push(["h", window.game_data.csrf], ["h", window.game_data.csrf]);
    return {payload, durationSecond};

  } catch (e) {
    console.error('[farm-max] fetchConfirmCommand failed:', e)
    throw e
  } finally {
    clearTimeout(timeoutId);
  }
}

// === MESMO PADRÃO PARA fetchPopupCommand ===
async function fetchPopupCommandV2(villageId, payloadConfirm) {
  const url = new URL(`/game.php?village=${villageId}&screen=place&ajaxaction=popup_command`, origin)
  const body = new URLSearchParams();
  for (const [k, v] of payloadConfirm) body.append(k, v);

  const headers = makeAjaxHeaders();
  headers.set("content-type", "application/x-www-form-urlencoded; charset=UTF-8");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetchWithRetry(
      url.toString(),
      {
        method: "POST",
        headers,
        body,
        credentials: "include",
        referrerPolicy: "origin",
        cache: "no-store",
        signal: controller.signal
      }
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const { game_data, response, error } = await res.json()
    if (error || !response || !game_data) throw new Error(error || response.toString())

    const { time_generated } = game_data
    const { message, target_village, source_village } = response;

    return { time_generated, message, target_village, source_village };

  } catch (e) {
    console.error('[farm-max] fetchPopupCommand failed:', e)
    throw e
  } finally {
    clearTimeout(timeoutId);
  }
}

export { fetchConfirmCommandV2, fetchPopupCommandV2 }
