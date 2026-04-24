import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document";
import { combineAbortControllerSignals, makeAjaxBody, makeAjaxHeadersPost } from "@toolkit-tw-bot/browser";
import { parseTwJsonText } from "./utils/parseTwResponseText";
import { getWorldUnitsOrder } from "../unit";
import { consoleDev } from "@toolkit-tw-bot/utils";

const TRAIN_INPUT_RE = /^train\[\d+\]\[[^\]]+\]$/

function toNonEmptyString(value) {
  if (value == null) return null
  const normalized = String(value).trim()
  return normalized ? normalized : null
}

function resolveAttackName({
  attackName,
  dispatchMode,
  scheduledCommandId
}) {
  const mode = String(dispatchMode || '').trim().toLowerCase()
  if (mode === 'schedule') {
    return toNonEmptyString(scheduledCommandId) || ''
  }

  return toNonEmptyString(attackName) || ''
}

function toPayloadEntries(payloadCommand) {
  if (Array.isArray(payloadCommand)) {
    return payloadCommand.reduce((acc, entry) => {
      if (!Array.isArray(entry) || entry.length < 2) return acc
      const [name, value] = entry
      if (!name) return acc
      acc.push([String(name), value ?? ''])
      return acc
    }, [])
  }
  if (payloadCommand && typeof payloadCommand === 'object') {
    return Object.entries(payloadCommand).reduce((acc, [name, value]) => {
      if (!name) return acc
      acc.push([String(name), value ?? ''])
      return acc
    }, [])
  }
  return []
}

function buildTrainEntriesFromTemplate(templateNormalized, worldUnits) {
  const normalized = templateNormalized && typeof templateNormalized === 'object'
    ? templateNormalized
    : null
  const unitsFromTemplate = Array.isArray(normalized?.units) ? normalized.units : []
  const values = Array.isArray(normalized?.values) ? normalized.values : []
  if (values.length <= 1) return []

  const units = unitsFromTemplate.length ? unitsFromTemplate : worldUnits
  const idxByUnit = new Map(units.map((unit, index) => [String(unit), index]))
  const extraRows = values.slice(1)
  const attackRowsByUnit = []

  extraRows.forEach((row) => {
    if (!Array.isArray(row)) return
    let hasAnyAttack = false
    const rowByUnit = worldUnits.reduce((map, unit) => {
      const idx = idxByUnit.get(unit)
      const raw = idx == null ? 0 : Number(row[idx])
      const qty = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0
      if (qty > 0) hasAnyAttack = true
      map[unit] = qty
      return map
    }, {})
    if (!hasAnyAttack) return
    attackRowsByUnit.push(rowByUnit)
  })

  const entries = []
  attackRowsByUnit.slice(0, 4).forEach((rowByUnit, rowIndex) => {
    const attackIndex = rowIndex + 2
    worldUnits.forEach((unit) => {
      const qty = Number(rowByUnit[unit]) || 0
      entries.push([`train[${attackIndex}][${unit}]`, qty > 0 ? String(qty) : ''])
    })
  })

  return entries
}

function injectTrainEntriesAfterAttackName(entries = [], trainEntries = []) {
  if (!Array.isArray(entries) || !Array.isArray(trainEntries) || trainEntries.length === 0) return entries
  const existingNames = new Set(
    entries
      .filter(([name]) => TRAIN_INPUT_RE.test(String(name || '')))
      .map(([name]) => String(name))
  )
  const missingTrainEntries = trainEntries.filter(([name]) => !existingNames.has(String(name)))
  if (!missingTrainEntries.length) return entries

  const attackNameIndex = entries.findIndex(([name]) => name === 'attack_name')
  if (attackNameIndex >= 0) {
    return [
      ...entries.slice(0, attackNameIndex + 1),
      ...missingTrainEntries,
      ...entries.slice(attackNameIndex + 1)
    ]
  }

  const csrfIndex = entries.findIndex(([name]) => name === 'h')
  if (csrfIndex >= 0) {
    return [
      ...entries.slice(0, csrfIndex),
      ...missingTrainEntries,
      ...entries.slice(csrfIndex)
    ]
  }

  return [...entries, ...missingTrainEntries]
}

function ensureTwinCsrfEntries(entries = [], fallbackCsrf = '') {
  const normalizedEntries = Array.isArray(entries) ? entries : []
  const hEntries = normalizedEntries.filter(([name]) => String(name) === 'h')
  const lastHValue = hEntries.length > 0
    ? hEntries[hEntries.length - 1]?.[1]
    : undefined
  const csrfValue = lastHValue ?? fallbackCsrf ?? ''
  const withoutH = normalizedEntries.filter(([name]) => String(name) !== 'h')
  return [
    ...withoutH,
    ['h', csrfValue],
    ['h', csrfValue]
  ]
}

export async function postAjaxCommandConfirm(payloadCommand, {
  signal,
  templateNormalized,
  attackName,
  dispatchMode,
  scheduledCommandId
} = {}) {
  const gameData = getGameData()
  const worldUnits = getWorldUnitsOrder().filter((unit) => unit !== 'militia')
  const url = new URL(`${gameData.link_base_pure}place&ajax=confirm`, window.origin);
  const baseEntries = toPayloadEntries(payloadCommand)
  const trainEntries = buildTrainEntriesFromTemplate(templateNormalized, worldUnits)
  const body = makeAjaxBody(baseEntries)
  const headers = makeAjaxHeadersPost();
  // controller só pro timeout
  const timeoutCtrl = new AbortController();
  const t = setTimeout(() => timeoutCtrl.abort(new Error("timeout")), 8000);
  // ✅ combina: abort externo + timeout
  const combinedSignal = signal
    ? combineAbortControllerSignals([signal, timeoutCtrl.signal])
    : timeoutCtrl.signal;
  const req = new Request(url.toString(), {
    method: "POST",
    headers,
    body,
    credentials: "include",
    referrerPolicy: "origin",
    cache: "no-store",
    signal: combinedSignal
  });
  if (ProtectingBot["bot-protect-all-in-game"].active()) {
    clearTimeout(t);
    throw ProtectingBot.error();
  }

  try {
    let responseJson = null
    const res = await fetch(req);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    responseJson = parseTwJsonText(
      await res.text(),
      "planner.postAjaxCommandConfirm:response"
    );
    const { response, error } = responseJson || {};
    if (error || !response || !response.dialog) {
      consoleDev.error({
        event: 'tw-response-error',
        stage: 'phase2-confirmation',
        request: {
          fn: 'postAjaxCommandConfirm',
          url: url.toString()
        },
        responseJson
      }, { label: '[GO][TW][PH2][confirm]', color: '#ef4444' })
      throw new Error(error || response?.toString?.() || 'TW confirm sem response.dialog')
    }
    const html = new DOMParser().parseFromString(response.dialog, "text/html");
    const durationSecond = Number(html?.querySelector('.relative_time')?.dataset?.duration)
    const inputs = Array.from(html.querySelectorAll("#command-data-form input"));
    if (!inputs.length) {
      const twErrorText = String(
        html?.querySelector?.('.error_msg, .error')?.textContent
        || html?.querySelector?.('#content_value .error')?.textContent
        || ''
      ).replace(/\s+/g, ' ').trim()
      consoleDev.error({
        event: 'tw-confirm-without-command-form',
        stage: 'phase2-confirmation',
        request: {
          fn: 'postAjaxCommandConfirm',
          url: url.toString()
        },
        responseJson,
        twErrorText,
        dialogHtml: String(response?.dialog || '')
      }, { label: '[GO][TW][PH2][confirm]', color: '#ef4444' })
      throw new Error(
        twErrorText
          ? `TW confirm sem command-data-form: ${twErrorText}`
          : 'TW confirm sem command-data-form (payload ausente).'
      )
    }
    let didInjectTrainEntries = false
    const payloadParsed = inputs.reduce((arr, el) => {
      const name = el.getAttribute("name");
      if (name && !['submit_confirm', 'save_default_attack_building'].includes(name)) {
        if (didInjectTrainEntries && TRAIN_INPUT_RE.test(name)) return arr
        const value = name === 'attack_name'
          ? resolveAttackName({
            attackName,
            dispatchMode,
            scheduledCommandId
          })
          : el.getAttribute("value") ?? "troop_confirm_submit";
        arr.push([name, value])
        if (name === 'attack_name' && trainEntries.length > 0) {
          const existing = new Set(arr.filter(([n]) => TRAIN_INPUT_RE.test(String(n || ''))).map(([n]) => String(n)))
          trainEntries.forEach(([trainName, trainValue]) => {
            const key = String(trainName)
            if (existing.has(key)) return
            arr.push([key, trainValue ?? ''])
            existing.add(key)
          })
          didInjectTrainEntries = true
        }
      }
      return arr;
    }, []);
    const payloadWithTrain = injectTrainEntriesAfterAttackName(payloadParsed, trainEntries)
    if (!payloadWithTrain.find(([n]) => n === "building")) payloadWithTrain.push(["building", "wall"]);
    const payload = ensureTwinCsrfEntries(payloadWithTrain, window?.game_data?.csrf)
    return {payload, durationSecond}; /// retorna duration para confirmar horário.
  } catch (e) {
    if (!String(e?.message || '').includes('HTTP ')) {
      consoleDev.error({
        event: 'request-catch',
        stage: 'phase2-confirmation',
        request: {
          fn: 'postAjaxCommandConfirm',
          url: url.toString()
        },
        error: {
          name: e?.name,
          message: e?.message,
          cause: e?.cause
        }
      }, { label: '[GO][TW][PH2][confirm]', color: '#ef4444' })
    }
    console.error(e)
    throw e
  } finally {
    clearTimeout(t);
  }
}
