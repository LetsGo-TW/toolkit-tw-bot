import { StorageLocalCompat } from "@toolkit-tw-bot/browser"
import { getGameData } from "@toolkit-tw-bot/document"

const INCOMING_STORAGE_PATH = ["incoming", "state"]

function getCurrentWorld() {
  return String(getGameData()?.world || "").trim() || null
}

function getCurrentPlayerId() {
  const raw = Number(getGameData()?.player?.id)
  return Number.isFinite(raw) && raw > 0 ? raw : null
}

function createIncomingStorage() {
  return StorageLocalCompat.create({
    world: getCurrentWorld(),
    playerId: getCurrentPlayerId(),
    path: INCOMING_STORAGE_PATH,
  })
}

function createIncomingStateBase() {
  return {
    lastIncomingCount: 0,
    villages: {},
  }
}

function normalizeIncomingAttackEntry(entry = null) {
  if (!entry || typeof entry !== "object") return null

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
    const normalizedEntry = normalizeIncomingAttackEntry(entry)
    if (!normalizedEntry) return acc
    acc[String(commandId)] = normalizedEntry
    return acc
  }, {})

  return {
    name: String(value?.name || "").trim() || null,
    coord: String(value?.coord || "").trim() || null,
    comingAttack,
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
    console.warn("[incoming][storage:get]", error)
    return createIncomingStateBase()
  }
}

function isPremiumAccountActive() {
  try {
    return Boolean(getGameData()?.features?.Premium?.active)
  } catch (_) {
    return false
  }
}

function getCurrentVillageIncomingAttack(state = null) {
  const currentVillageId = String(getGameData()?.village?.id || "").trim()
  if (!currentVillageId) return null

  return normalizeIncomingState(state)?.villages?.[currentVillageId]?.comingAttack || null
}

export const updatingTicketNotPremium = (elem, ticket) => {
  if (!elem) return
  if (!elem.textContent) return
  const nextTicket = String(ticket || "").trim()
  if (!nextTicket) return
  if (elem.textContent.trim() === nextTicket) return
  elem.textContent = nextTicket
}

class IncomingsAttaks {
  static async create() {
    return new IncomingsAttaks()
  }

  async tagAttacksNotPremium() {
    if (isPremiumAccountActive()) return

    const comingAttack = getCurrentVillageIncomingAttack(await readIncomingState())
    if (!comingAttack) return

    if (document.querySelector("#quickedit-rename")) {
      this.tagQuickedit(comingAttack)
    }

    if (document.querySelector("#commands_incomings")) {
      this.tagCommands(comingAttack)
    }
  }

  tagQuickedit(comingAttack = {}) {
    const quickedit = document.querySelector("#quickedit-rename")
    const commandId = String(quickedit?.dataset?.id || "").trim()
    if (!commandId) return

    const ticket = String(comingAttack?.[commandId]?.ticket || "").trim()
    if (!ticket) return

    updatingTicketNotPremium(quickedit, ticket)
  }

  tagCommands(comingAttack = {}) {
    const table = document.querySelector("#commands_incomings")
    if (!table) return

    Array.from(table.querySelectorAll("tr.command-row")).forEach((row) => {
      const label = row.querySelector("span.quickedit-label")
      const quickedit = row.querySelector("span.quickedit")
      const commandId = String(quickedit?.dataset?.id || "").trim()
      if (!commandId) return

      const ticket = String(comingAttack?.[commandId]?.ticket || "").trim()
      if (!ticket) return

      updatingTicketNotPremium(label, ticket)
    })
  }
}

export default IncomingsAttaks
