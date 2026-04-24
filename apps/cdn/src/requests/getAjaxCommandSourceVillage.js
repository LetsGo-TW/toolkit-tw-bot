import { getWorldUnitsOrder, getUnitData } from "../unit";
import {
  normalizeTemplateForCommand
} from "../send/utils/normalizeTemplateForCommand";
import { buildSourceVillageUnitsFromInputs } from "../send/utils/buildSourceVillageUnitsFromInputs";
import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document";
import { consoleDev } from "@toolkit-tw-bot/utils";
import { combineAbortControllerSignals, makeAjaxHeadersGet } from "@toolkit-tw-bot/browser";

export async function getAjaxCommandSourceVillage(
  sourceId,
  targetX,
  targetY,
  template,
  options = {}
) {
  const {
    commandType = 'attack',
    normalizeContext = {},
    signal
  } = options
  const gameData = getGameData();
  const worldUnits = getWorldUnitsOrder()
  const unitData = getUnitData()
  const unitMetaByName = worldUnits.reduce((map, unit) => {
    const meta = unitData?.[unit]
    if (meta) map.set(unit, meta)
    return map
  }, new Map())
  const url = new URL(
    `${gameData.link_base_pure}place&ajax=command&x=${targetX}&y=${targetY}&source_village=${sourceId}`,
    window.origin
  );
  worldUnits.forEach(unit => {
    url.searchParams.set(unit, 0)
  });
  url.searchParams.set('group', 0)
  const headers = makeAjaxHeadersGet();

  const timeoutCtrl = new AbortController();
  const t = setTimeout(() => timeoutCtrl.abort(new Error("timeout")), 8000);

  const combinedSignal = signal
    ? combineAbortControllerSignals([signal, timeoutCtrl.signal])
    : timeoutCtrl.signal;

  if (ProtectingBot["bot-protect-all-in-game"].active()) {
    clearTimeout(t);
    throw ProtectingBot.error();
  }

  try {
    let responseJson = null
    const res = await fetch(url.toString(), {
      method: "GET",
      headers,
      credentials: "include",
      referrerPolicy: "origin",
      cache: "no-store",
      signal: combinedSignal,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    responseJson = await res.json();
    const { response, error, game_data } = responseJson || {};
    if (error || !response || !response.dialog) {
      consoleDev.error({
        event: 'tw-response-error',
        stage: 'phase1-preparation',
        request: {
          fn: 'getAjaxCommandSourceVillage',
          url: url.toString(),
          sourceId,
          targetX,
          targetY
        },
        responseJson
      }, { label: '[GO][TW][PH1][command]', color: '#ef4444' })
      throw new Error(error ?? response?.toString?.() ?? 'TW command sem response.dialog')
    }
    const html = new DOMParser().parseFromString(response.dialog, "text/html");

    const inputs = Array.from(html.querySelectorAll("#command-data-form input"));
    if (!inputs.length) {
      const twErrorText = String(
        html?.querySelector?.('.error_msg, .error')?.textContent
        || html?.querySelector?.('#content_value .error')?.textContent
        || ''
      ).replace(/\s+/g, ' ').trim()
      consoleDev.error({
        event: 'tw-command-without-command-form',
        stage: 'phase1-preparation',
        request: {
          fn: 'getAjaxCommandSourceVillage',
          url: url.toString(),
          sourceId,
          targetX,
          targetY
        },
        responseJson,
        twErrorText,
        dialogHtml: String(response?.dialog || '')
      }, { label: '[GO][TW][PH1][command]', color: '#ef4444' })
    }
    const sourceVillageUnits = buildSourceVillageUnitsFromInputs(inputs, worldUnits)
    const villagePoints = Number(game_data?.village?.points)
    console.log('[source-village-units]', sourceVillageUnits)
    const templateNormalized = normalizeTemplateForCommand(template, worldUnits, {
      sourceVillageUnits,
      commandType,
      villagePoints: Number.isFinite(villagePoints) ? villagePoints : undefined,
      unitMetaByName: unitMetaByName.size > 0 ? unitMetaByName : undefined,
      ...(normalizeContext && typeof normalizeContext === 'object' ? normalizeContext : {})
    })
    const firstRowTemplate = templateNormalized.firstRowMap || {}
    const templateOverrides = template && typeof template === 'object' ? template : {}
    const normalizedAttackName = String(
      templateOverrides.attack_name ?? templateOverrides.attackName ?? ''
    ).trim() || null
    const normalizedScheduledCommandId = String(
      templateOverrides.scheduledCommandId ?? templateOverrides.commandId ?? ''
    ).trim() || null

    const excludeType = commandType === 'support' ? 'attack' : 'support';

    const payload = inputs.reduce((arr, el) => {
      const name = el.getAttribute("name");
      if (!name || name === excludeType) return arr;

      let value;
      if (name === 'attack' || name === 'support') value = "l"
      else if (name === "x") value = targetX;
      else if (name === "y") value = targetY;
      else if (worldUnits.includes(name)) value = firstRowTemplate[name] ?? ''
      else if (name === 'attack_name') value = normalizedAttackName ?? el.getAttribute("value")
      else value = templateOverrides[name] ?? el.getAttribute("value")

      arr.push([name, value]);
      return arr;
    }, []);

    if (!payload.find(([n]) => n === "h")) payload.push(["h", window.game_data.csrf]);
    return {
      payload,
      templateNormalized,
      templateFirstRow: firstRowTemplate,
      sourceVillageUnits,
      attackName: normalizedAttackName,
      scheduledCommandId: normalizedScheduledCommandId
    };
  } catch (e) {
    if (!String(e?.message || '').includes('HTTP ')) {
      consoleDev.error({
        event: 'request-catch',
        stage: 'phase1-preparation',
        request: {
          fn: 'getAjaxCommandSourceVillage',
          url: url.toString(),
          sourceId,
          targetX,
          targetY
        },
        error: {
          name: e?.name,
          message: e?.message,
          cause: e?.cause
        }
      }, { label: '[GO][TW][PH1][command]', color: '#ef4444' })
    }
    console.error(e)
    throw e
  } finally {
    clearTimeout(t);
  }
}
