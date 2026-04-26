import { combineAbortControllerSignals, makeAjaxBody, makeAjaxHeadersPost } from "@toolkit-tw-bot/browser"
import { getParamsUrl } from "@toolkit-tw-bot/core"
import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document"
import { extensionId as RELEASE_EXTENSION_ID } from "@toolkit-tw-bot/release"
import StorageLocalCompat from "../shared/indexdb/storage-local-compat.js"

const INCOMING_WATCH_MESSAGE_TYPE = "CS_INCOMING_WATCH"
const INCOMING_STORAGE_PATH = ["incoming", "state"]

function getCurrentGameData() {
  return getGameData()
}

function getCurrentWorld() {
  return String(getCurrentGameData()?.world || "").trim() || null
}

function getCurrentPlayerId() {
  const raw = Number(getCurrentGameData()?.player?.id)
  return Number.isFinite(raw) && raw > 0 ? raw : null
}

function createIncomingStorage() {
  return StorageLocalCompat.create({
    world: getCurrentWorld(),
    playerId: getCurrentPlayerId(),
    path: INCOMING_STORAGE_PATH,
  })
}

function normalizeIncomingAttackEntry(entry = null) {
  return {
    power: String(entry?.power || "").trim() || null,
    ticket: String(entry?.ticket || "").trim() || null,
    attacker: String(entry?.attacker || "").trim() || null,
    attackerID: String(entry?.attackerID || "").trim() || null,
    attackerCoord: String(entry?.attackerCoord || "").trim() || null,
    attackerVillageID: String(entry?.attackerVillageID || "").trim() || null,
    arrival: Number.isFinite(Number(entry?.arrival)) ? Number(entry.arrival) : null,
    taggedAt: Number.isFinite(Number(entry?.taggedAt)) ? Number(entry.taggedAt) : null,
  }
}

function normalizeIncomingVillageState(value = null) {
  const comingAttackRaw = value?.comingAttack && typeof value.comingAttack === "object"
    ? value.comingAttack
    : {}

  const comingAttack = Object.entries(comingAttackRaw).reduce((acc, [commandId, entry]) => {
    acc[String(commandId)] = normalizeIncomingAttackEntry(entry)
    return acc
  }, {})

  return {
    name: String(value?.name || "").trim() || null,
    coord: String(value?.coord || "").trim() || null,
    comingAttack,
  }
}

function createIncomingStateBase() {
  return {
    lastIncomingCount: 0,
    villages: {},
  }
}

function normalizeIncomingState(value = null) {
  const base = createIncomingStateBase()
  const villagesRaw = value?.villages && typeof value.villages === "object"
    ? value.villages
    : {}

  base.lastIncomingCount = Math.max(0, Math.floor(Number(value?.lastIncomingCount ?? 0) || 0))
  base.villages = Object.entries(villagesRaw).reduce((acc, [villageId, villageState]) => {
    const normalizedVillageId = String(villageId || "").trim()
    if (!normalizedVillageId) return acc
    acc[normalizedVillageId] = normalizeIncomingVillageState(villageState)
    return acc
  }, {})

  return base
}

async function readIncomingState() {
  try {
    return normalizeIncomingState(await createIncomingStorage().get())
  } catch (error) {
    console.warn("[incoming-apply][storage:get]", error)
    return createIncomingStateBase()
  }
}

async function writeIncomingState(state) {
  const nextState = normalizeIncomingState(state)

  try {
    await createIncomingStorage().set(nextState)
  } catch (error) {
    console.warn("[incoming-apply][storage:set]", error)
  }

  return nextState
}

function listPendingIncomingEntries(state = null) {
  return Object.entries(normalizeIncomingState(state).villages)
    .flatMap(([villageId, villageState]) => (
      Object.entries(villageState.comingAttack)
        .filter(([, entry]) => Boolean(entry?.ticket) && entry?.taggedAt === null)
        .map(([commandId, entry]) => ({
          villageId,
          commandId,
          arrival: entry?.arrival ?? null,
          ticket: entry?.ticket ?? null,
        }))
    ))
    .sort((left, right) => {
      const leftArrival = Number.isFinite(Number(left.arrival)) ? Number(left.arrival) : Number.MAX_SAFE_INTEGER
      const rightArrival = Number.isFinite(Number(right.arrival)) ? Number(right.arrival) : Number.MAX_SAFE_INTEGER
      return leftArrival - rightArrival
    })
}

function countPendingIncomingTags(state = null) {
  return listPendingIncomingEntries(state).length
}

async function sendMessageToExtension(context, payload = {}) {
  if (typeof context?.extension?.sendMessage === "function") {
    return await context.extension.sendMessage(payload)
  }

  return await chrome.runtime.sendMessage(RELEASE_EXTENSION_ID, {
    extensionId: RELEASE_EXTENSION_ID,
    ...payload,
  })
}

async function notifyApplyCompleted(context, {
  pendingTagCount = 0,
  taggedCount = 0,
  failedCount = 0,
} = {}) {
  const gameData = getCurrentGameData()
  const runtimeParams = getParamsUrl(window.location.href, window.location.origin)

  return await sendMessageToExtension(context, {
    type: INCOMING_WATCH_MESSAGE_TYPE,
    action: "apply-completed",
    world: gameData?.world ?? null,
    t: runtimeParams.t ?? null,
    playerId: getCurrentPlayerId(),
    pendingTagCount,
    taggedCount,
    failedCount,
  })
}

async function tagRequest(ticket, commandId, { signal } = {}) {
  const gameData = getCurrentGameData()
  const url = new URL(
    `${gameData.link_base_pure}info_command&ajaxaction=edit_other_comment&id=${commandId}&`,
    window.origin,
  )

  const payload = {
    text: ticket,
    h: gameData.csrf,
  }
  const body = makeAjaxBody(payload)
  const headers = makeAjaxHeadersPost()
  const timeoutCtrl = new AbortController()
  const timeoutId = setTimeout(() => timeoutCtrl.abort(new Error("timeout")), 8000)
  const combinedSignal = signal
    ? combineAbortControllerSignals([signal, timeoutCtrl.signal])
    : timeoutCtrl.signal

  if (ProtectingBot["bot-protect-all-in-game"].active()) {
    clearTimeout(timeoutId)
    throw ProtectingBot.error()
  }

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers,
      body,
      credentials: "include",
      referrerPolicy: "origin",
      cache: "no-store",
      signal: combinedSignal,
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }

    const { response, error } = await res.json()
    if (error || !response) {
      throw new Error(error || "Not found!")
    }

    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

export default async function incomingApplyRunner(data = {}, context = {}) {
  await context.reportState?.("running")

  let state = await readIncomingState()
  const pendingEntries = listPendingIncomingEntries(state)
  let taggedCount = 0
  let failedCount = 0

  for (const pendingEntry of pendingEntries) {
    if (!pendingEntry.ticket) {
      continue
    }

    try {
      await tagRequest(pendingEntry.ticket, pendingEntry.commandId)
      const currentVillage = state.villages[pendingEntry.villageId]
      const currentEntry = currentVillage?.comingAttack?.[pendingEntry.commandId]

      if (currentVillage && currentEntry) {
        currentVillage.comingAttack[pendingEntry.commandId] = {
          ...normalizeIncomingAttackEntry(currentEntry),
          taggedAt: Date.now(),
        }
      }

      taggedCount++
    } catch (error) {
      failedCount++
      console.error("[incoming-apply][tag]", {
        commandId: pendingEntry.commandId,
        error,
      })
    }
  }

  const nextState = await writeIncomingState(state)
  const remainingPendingCount = countPendingIncomingTags(nextState)

  try {
    await notifyApplyCompleted(context, {
      pendingTagCount: remainingPendingCount,
      taggedCount,
      failedCount,
    })
  } catch (error) {
    console.error("[incoming-apply][sync-completed]", error)
  }

  await context.reportState?.({
    status: "completed",
    detail: {
      pendingTagCount: remainingPendingCount,
      taggedCount,
      failedCount,
    },
  })
}
