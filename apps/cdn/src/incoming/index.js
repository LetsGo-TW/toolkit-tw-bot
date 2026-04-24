import { sendNotify } from "../notify"
import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document"
import { nDateTime, strTimeToSec } from "../stable-compat/date-parse"
import { combineAbortControllerSignals, makeAjaxBody, makeAjaxHeadersGetDoc, makeAjaxHeadersPost } from "@toolkit-tw-bot/browser"
import { assertNoCaptchaInGame } from "../shared/assertNoCaptchaInGame"
import { assertNoGameUpdateOrBlockedRequest } from "../shared/assertNoGameUpdateOrBlockedRequest"
import { dateServer, timeServer } from "../stable-compat/date-tw"
import { incomingUnitSlow, initUnitdata, travelSecond } from "../unit"
import { Distance } from "@toolkit-tw-bot/core"
import { postChangePageSize } from "../requests/postChangePageSize"
import { normalizeDateTwString } from "../shared/normalizeDateTwString"
import StorageLocalCompat from "../shared/indexdb/storage-local-compat.js"
import getPages, { getPageSize } from "../stable-compat/getPages"
import { printMessage } from "../components/printMessage"
import { loaderGame } from "../components/loaderGame"

const gameData = getGameData()
const incomingStorage = StorageLocalCompat.create({
  world: gameData?.world ?? null,
  playerId: gameData?.player?.id ?? null,
  path: ['incoming', 'state'],
})

export const updatingTicketNotPremium = (elem, ticket) => {
  if (!elem) return
  if (!elem.textContent) return
  const nextTicket = String(ticket || '').trim()
  if (!nextTicket) return
  if (elem.textContent.trim() === nextTicket) return
  elem.textContent = ticket
}

const getBackTime = (travel, arrival) => {
  let strDateTime = new Date(nDateTime(arrival[0], arrival[1]) + (travel * 1000)).toLocaleString("pt-BR")

  let arrDateTime = strDateTime.split(' ')

  return `${ arrDateTime[0].substring(0, 5) } ${ arrDateTime[1] }`
}

const getLaunchTime = (travel, arrival) => {
  let strDateTime = new Date(nDateTime(arrival[0], arrival[1]) - (travel * 1000)).toLocaleString("pt-BR")

  let arrDateTime = strDateTime.split(' ')

  return `${ arrDateTime[0].substring(0, 5)} - ${arrDateTime[1]}`
}

const twServer = window?.location.host.split(".")?.[0]?.match(/^[a-z]{2}/ig)?.[0]

const i18n = {
  ro: {
    incomings : ["atac"]
  },
  en: {
    incomings : ["attack"]
  },
  us: {
    incomings : ["attack"]
  },
  uk: {
    incomings : ["attack"]
  },
  br: {
    incomings : ["ataque"]
  },
  pt: {
    incomings : ["ataque"]
  },
  it: {
    incomings : ["attacco"]
  },
}

const createIncomingStateBase = () => ({
  lastIncomingCount: 0,
  villages: {},
})

function normalizeFiniteNumber(value) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function calcContinentFromCoords(x, y) {
  const numX = normalizeFiniteNumber(x)
  const numY = normalizeFiniteNumber(y)
  if (numX == null || numY == null) return null
  return (Math.floor(numY / 100) * 10) + Math.floor(numX / 100)
}

function parseVillageInfoText(rawText = '') {
  const text = String(rawText || '').replace(/\s+/g, ' ').trim()
  const coordsMatch = text.match(/\(\s*(\d+)\s*\|\s*(\d+)\s*\)/)
  const x = coordsMatch ? normalizeFiniteNumber(coordsMatch[1]) : null
  const y = coordsMatch ? normalizeFiniteNumber(coordsMatch[2]) : null
  const continentMatch = text.match(/\bK(\d{1,2})\b/i)
  const k = continentMatch
    ? normalizeFiniteNumber(continentMatch[1])
    : calcContinentFromCoords(x, y)
  const name = text
    .replace(/\s*\(\s*\d+\s*\|\s*\d+\s*\)\s*(?:K\d{1,2})?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  const hasCoords = x != null && y != null
  const hasK = k != null
  const label = name
    ? hasCoords
      ? hasK
        ? `${name} (${x}|${y}) K${k}`
        : `${name} (${x}|${y})`
      : name
    : text

  return {
    name: name || null,
    x: hasCoords ? x : null,
    y: hasCoords ? y : null,
    k: hasK ? k : null,
    label: String(label || '').trim() || null
  }
}

function parseVillageInfoCell(cell) {
  const anchor = cell?.querySelector?.('a')
  const rawText = String(anchor?.textContent || cell?.textContent || '')
  return parseVillageInfoText(rawText)
}

function normalizeIncomingAttackEntry(entry = null) {
  if (!entry || typeof entry !== 'object') return null

  return {
    power: String(entry?.power || '').trim() || null,
    ticket: String(entry?.ticket || '').trim() || null,
    attacker: String(entry?.attacker || '').trim() || null,
    attackerID: String(entry?.attackerID || '').trim() || null,
    attackerCoord: String(entry?.attackerCoord || '').trim() || null,
    attackerVillageID: String(entry?.attackerVillageID || '').trim() || null,
    arrival: Number.isFinite(Number(entry?.arrival)) ? Number(entry.arrival) : null,
  }
}

function normalizeIncomingVillageState(value = null) {
  const comingAttackRaw = value?.comingAttack && typeof value.comingAttack === 'object'
    ? value.comingAttack
    : {}

  const comingAttack = Object.entries(comingAttackRaw).reduce((acc, [commandId, entry]) => {
    const normalizedEntry = normalizeIncomingAttackEntry(entry)
    if (!normalizedEntry) return acc
    acc[String(commandId)] = normalizedEntry
    return acc
  }, {})

  return {
    name: String(value?.name || '').trim() || null,
    coord: String(value?.coord || '').trim() || null,
    comingAttack,
  }
}

function normalizeIncomingState(value = null) {
  const base = createIncomingStateBase()
  const villagesRaw = value?.villages && typeof value.villages === 'object'
    ? value.villages
    : {}

  base.lastIncomingCount = Math.max(0, Math.floor(Number(value?.lastIncomingCount ?? 0) || 0))
  base.villages = Object.entries(villagesRaw).reduce((acc, [villageId, villageState]) => {
    const normalizedVillageId = String(villageId || '').trim()
    if (!normalizedVillageId) return acc
    acc[normalizedVillageId] = normalizeIncomingVillageState(villageState)
    return acc
  }, {})

  return base
}

async function readIncomingState() {
  try {
    return normalizeIncomingState(await incomingStorage.get())
  } catch (error) {
    console.warn('[incoming][storage:get]', error)
    return createIncomingStateBase()
  }
}

async function writeIncomingState(state = null) {
  const nextState = normalizeIncomingState(state)

  try {
    await incomingStorage.set(nextState)
  } catch (error) {
    console.warn('[incoming][storage:set]', error)
  }

  return nextState
}

function isPremiumAccountActive() {
  try {
    return Boolean(getGameData()?.features?.Premium?.active)
  } catch (_) {
    return false
  }
}

function isCurrentIncomingsScreen() {
  try {
    const url = new URL(window.location.href)
    return (
      url.pathname.endsWith('/game.php')
      && url.searchParams.get('screen') === 'overview_villages'
      && url.searchParams.get('mode') === 'incomings'
    )
  } catch (_) {
    return false
  }
}

function buildInfoVillageUrl(villageId) {
  const normalizedVillageId = String(villageId || '').trim()
  if (!normalizedVillageId) return null

  try {
    const url = new URL('/game.php', window.location.origin)
    url.searchParams.set('screen', 'info_village')
    url.searchParams.set('id', normalizedVillageId)
    return url.toString()
  } catch (_) {
    return null
  }
}

class IncomingsAttaks {
  notifyData = []
  newAttack = 0
  newSnob = 0
  dataUnits = null

  constructor() {
    this.notifyData = []
    this.newAttack = 0
    this.newSnob = 0
    this.dataUnits = new Map()
  }

  static async create() {
    const dataUnitsJson = await initUnitdata()
    if (!dataUnitsJson) throw new Error('Data units not found!')
    const incoming = new IncomingsAttaks()
    incoming.syncDataUnitsMap(dataUnitsJson)
    return incoming
  }

  syncDataUnitsMap(dataUnitsJson) {
    if (!dataUnitsJson || typeof dataUnitsJson !== 'object') return
    this.dataUnits.clear()
    Object.entries(dataUnitsJson).forEach(([key, value]) => this.dataUnits.set(key, value))
  }

  async ensurePlannerUnitsLoaded() {
    const dataUnitsJson = await initUnitdata()
    if (!dataUnitsJson) throw new Error('Data units not found!')
    this.syncDataUnitsMap(dataUnitsJson)
    return dataUnitsJson
  }

  resetNotifyState = () => {
    this.notifyData = []
    this.newAttack = 0
    this.newSnob = 0
  }

  parseHrefParam = (href = '', param = '') => {
    try {
      const url = new URL(String(href || ''), location.origin)
      return String(url.searchParams.get(param) || '').trim() || null
    } catch (_) {
      return null
    }
  }

  normalizeInlineText = (value = '') => {
    return String(value || '')
      .replace(/\s*[\r\n]+\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }

  splitNotifySegments = (value = '') => {
    return String(value || '')
      .split('|')
      .map((segment) => this.normalizeInlineText(segment))
      .filter(Boolean)
  }

  stripLeadingEmojiLabel = (value = '') => {
    return String(value || '')
      .replace(/^[^\p{L}\p{N}]+\s*/u, '')
      .trim()
  }

  buildPowerCountsText = () => {
    const powers = {
      small: '🟢',
      medium: '🟠',
      large: '🔴',
      unknown: '🔘',
    }
    const order = ["small", "medium", "large", "unknown"]
    const counts = this.notifyData.reduce((acc, { power }) => {
      const key = power || "unknown"
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})

    return order
      .filter((power) => counts[power] > 0)
      .map((power) => `${powers[power] || "🔘"} ${counts[power]}`)
      .join(" | ")
  }

  parseArrivalData = (arrivalText = '') => {
    const raw = String(arrivalText || '').trim()
    if (!raw) return null

    const date = normalizeDateTwString(raw)
    const time = raw.match(/[0-9]{2}[:][0-9]{2}[:][0-9]{2}/ig)?.[0] || null
    const ms = raw.match(/[0-9]{3}$/ig)?.[0] || "000"

    if (!date || !time) return null

    return {
      arrivalText: raw,
      arrival: nDateTime(date, time, ms),
      arrivalParts: [date, time, ms],
    }
  }

  resolveIncomingTravelMeta = ({
    sourceCoord = '',
    targetCoord = '',
    travelText = ''
  } = {}) => {
    const source = String(sourceCoord || '').match(/\d+\|\d+/)?.[0] || null
    const target = String(targetCoord || '').match(/\d+\|\d+/)?.[0] || null
    const travelSeconds = strTimeToSec(String(travelText || '').trim())

    if (!source || !target || !Number.isFinite(travelSeconds) || travelSeconds <= 0) {
      return null
    }

    const distance = Distance.create(target).calc(source)
    if (!Number.isFinite(distance) || distance <= 0) {
      return null
    }

    const unitSlower = incomingUnitSlow(travelSeconds, distance)
    if (!unitSlower) return null

    return {
      distance,
      travelSeconds,
      unitSlower,
      travel: Math.round(travelSecond(distance, unitSlower))
    }
  }

  buildIncomingTicket = ({
    arrivalParts = null,
    travel = 0,
    unitSlower = ''
  } = {}) => {
    if (!Array.isArray(arrivalParts) || arrivalParts.length < 2) return null
    const unitName = this.dataUnits.get(unitSlower)?.name || unitSlower
    return `${unitName} | 📝 ${dateServer().split("/")[0]+"/"+dateServer().split("/")[1]} ${timeServer()} | 🚀 ${getLaunchTime(travel, arrivalParts)} | 🏠 ${getBackTime(travel, arrivalParts)} |`
  }

  collectIncomingVillages = (html = document) => {
    const rows = Array.from(html.querySelectorAll("tr.nowrap"))
    return rows.reduce((arr, row) => {
      const villageSpan = row.querySelector("span.quickedit-vn")
      const villageTd = villageSpan?.closest?.("td")
      const villageId = Number(villageSpan?.dataset?.id)
      const hasIncoming = Boolean(villageSpan?.querySelector?.('img'))

      if (!Number.isFinite(villageId) || !hasIncoming) {
        return arr
      }

      const info = parseVillageInfoCell(villageTd || row)
      arr.push({
        id: villageId,
        name: info?.name || null,
        coord: info?.x != null && info?.y != null ? `${info.x}|${info.y}` : null,
        label: info?.label || null
      })
      return arr
    }, [])
  }

  tagAttacksNotPremium = async () => {
    if (isPremiumAccountActive()) return
    try {
      const currentGameData = getGameData()
      const incomingState = await readIncomingState()
      const comingAttack = incomingState?.villages?.[String(currentGameData?.village?.id || '')]?.comingAttack || null
      if (comingAttack && document.querySelector("#quickedit-rename")) {
        this.tagQuickedit(comingAttack)
      }
      if (comingAttack && document.querySelector("#commands_incomings")) {
        this.tagCommands(comingAttack)
      }
    } catch (error) {
      console.error({msg: error.message | null, script: "Incomings-tagAttacksNotPremium", error})
      throw error
    }
  }

  tagQuickedit = function(comingAttack) {
    const id = document.querySelector("#quickedit-rename").dataset.id
    if (comingAttack[id]) {
      if (comingAttack[id].ticket) {
        updatingTicketNotPremium(document.querySelector("#quickedit-rename"), comingAttack[id].ticket)
      }
    }
  }

  tagCommands = (comingAttack) => Array.from( document.querySelector( "#commands_incomings" ).querySelectorAll( 'tr.command-row' )).forEach (row => {
    const id = row.querySelector('span.quickedit').dataset.id
    if (comingAttack[id]) {
      if ( comingAttack[id].ticket ) {
        updatingTicketNotPremium(row.querySelector("span.quickedit-label"), comingAttack[id].ticket)
      }
    }
  })

  attackPower = (row) => {
    const iconEl = row.querySelector("span.icon-container img")
    const iconSrc = String(iconEl?.src || iconEl?.getAttribute?.("src") || "").trim()
    const match = iconSrc.match(/attack_(.*?)\.webp/i)
    return match?.[1] || null
  }

  generateBodyNotify = () => {
    const powers = { small: '🟢' , medium: '🟠', large: '🔴'}
    const textPowers = this.buildPowerCountsText()
    const total = Number(document.querySelector("#incomings_amount")?.innerText || 0)
    let villageId = null, count = 1
    const lines = [`👤 Atacado: ${gameData.world} - ${gameData.player.name}`]
    lines.push(`↳ ⚔️ Ataques: [${this.newAttack}/${total}] | 👑 ${this.newSnob} | ${textPowers}`)

    this.notifyData
      .slice()
      .sort((a, b) => {
        const villageCompare = Number(a.targetVillageId) - Number(b.targetVillageId)
        if (villageCompare !== 0) return villageCompare
        return Number(a.arrival) - Number(b.arrival)
      })
      .forEach(({
      power,
      ticket,
      targetVillageId,
      targetVillageName,
      sourceName,
      sourceVillageName,
      arrivalText,
    }) => {
      const targetVillageLine = this.normalizeInlineText(targetVillageName)
      const sourceVillageLine = this.normalizeInlineText(sourceVillageName)
      const sourcePlayerLine = this.normalizeInlineText(sourceName)
      const ticketSegments = this.splitNotifySegments(ticket)
      const arrivalLine = this.normalizeInlineText(arrivalText)

      if (!villageId || villageId !== targetVillageId) {
        lines.push("")
        lines.push(`🎯 Alvo: ${targetVillageLine}`)
        const infoVillageUrl = buildInfoVillageUrl(targetVillageId)
        if (infoVillageUrl) {
          lines.push(`↳ 🔗 Link: ${infoVillageUrl}`)
        }
        villageId = targetVillageId;
        count = 1;
      }

      if (ticketSegments.length) {
        const [unitLine, ...ticketDetails] = ticketSegments
        const [registeredRaw = "", sentRaw = "", returnRaw = ""] = ticketDetails
        const registeredLine = this.stripLeadingEmojiLabel(registeredRaw)
        const sentLine = this.stripLeadingEmojiLabel(sentRaw)
        const returnLine = this.stripLeadingEmojiLabel(returnRaw)
        lines.push("")
        lines.push(`${count}. Comando: ${power ? powers[power] : '🔘'} ${unitLine}`)
        if (registeredLine) {
          lines.push(`↳ 📝 Registrado: ${registeredLine}`)
        }
        if (sentLine) {
          lines.push(`↳ 🚀 Enviado: ${sentLine}`)
        }
        if (returnLine) {
          lines.push(`↳ 🏠 Retorno: ${returnLine}`)
        }
      } else {
        lines.push("")
        lines.push(`${count}. ${power ? powers[power] : '🔘'} Ataque identificado`)
      }
      lines.push(`↳ 👤 Atacante: ${sourcePlayerLine}`)
      lines.push(`↳ 📍 Vila: ${sourceVillageLine}`)
      lines.push(`↳ ⏱️ Chegada: ${arrivalLine}`)
      lines.push("")
      count++
    })

    return lines.join("\n").trim()
  }

  saveAttackNotPremium = async () => {
    this.notifyData = []
    loaderGame.insert()
    try {
      const overviewVillagesHtml = await this.getDoc('overview_villages')
      const incomingVillages = this.collectIncomingVillages(overviewVillagesHtml)
      const incomingVillageIdSet = new Set(incomingVillages.map(({ id }) => String(id)))
      const state = await readIncomingState()

      Object.keys(state.villages).forEach((villageId) => {
        if (!incomingVillageIdSet.has(villageId)) {
          delete state.villages[villageId]
        }
      })

      if (!incomingVillages.length) {
        await writeIncomingState(state)
        return state
      }

      let count = 0

      for (const incomingVillage of incomingVillages) {
        const villageId = String(incomingVillage.id)
        const previousVillageState = state.villages[villageId] || normalizeIncomingVillageState()
        const nextVillageState = normalizeIncomingVillageState({
          ...previousVillageState,
          name: incomingVillage.name ?? previousVillageState.name,
          coord: incomingVillage.coord ?? previousVillageState.coord,
        })
        const overviewHtml = await this.getDoc('overview', villageId)
        const commandsTable = overviewHtml.querySelector("#commands_incomings")

        if (!commandsTable) {
          delete state.villages[villageId]
          continue
        }

        const comingAttack = { ...nextVillageState.comingAttack }
        const arrAttackID = Array.from(commandsTable.querySelectorAll("tr.command-row"))
          .reduce((arr, row) => {
            const power = this.attackPower(row)
            const attId = String(row.querySelector('span.quickedit')?.dataset?.id || '').trim()
            if (!attId) return arr
            if (!comingAttack[attId]) {
              comingAttack[attId] = normalizeIncomingAttackEntry({})
            }
            arr.push({ attId, power })
            return arr
          }, [])

        Object.keys(comingAttack).forEach((commandId) => {
          if (!arrAttackID.find(({ attId }) => Number(attId) === Number(commandId))) {
            delete comingAttack[commandId]
          }
        })

        for (const { attId, power } of arrAttackID) {
          if (comingAttack[attId]?.ticket) continue

          const infoCommandHtml = await this.getDoc(`info_command&id=${attId}&type=other`, villageId)
          const rows = Array.from(
            infoCommandHtml.querySelector("#content_value > table.vis > tbody")?.querySelectorAll?.('tr') || []
          )

          if (rows.length < 3) continue

          const attacker = this.normalizeInlineText(Array.from(rows[1]?.querySelectorAll('td') || [])[Array.from(rows[1]?.querySelectorAll('td') || []).length - 1]?.innerText)
          const attackerID = String(
            Array.from(rows[1]?.querySelectorAll('td') || [])[Array.from(rows[1]?.querySelectorAll('td') || []).length - 1]
              ?.querySelector?.('a')
              ?.href
              ?.split("=")
              ?.pop() || ''
          ).trim() || null
          const attackerVillageName = this.normalizeInlineText(Array.from(rows[2]?.querySelectorAll('td') || [])[Array.from(rows[2]?.querySelectorAll('td') || []).length - 1]?.innerText)
          const attackerCoord = attackerVillageName.match(/\d+\|\d+/ig)?.[0] || null
          const attackerVillageID = String(
            Array.from(rows[2]?.querySelectorAll('td') || [])[Array.from(rows[2]?.querySelectorAll('td') || []).length - 1]
              ?.querySelector?.('a')
              ?.href
              ?.split("=")
              ?.pop() || ''
          ).trim() || null
          const defenderCoord = nextVillageState.coord || incomingVillage.coord || null
          const defenderVillageName = this.normalizeInlineText(nextVillageState.name || incomingVillage.name || incomingVillage.label || `Vila ${villageId}`)
          const regExp = gameData.market == "pt" ? new RegExp(/[(][0-9]{2}[:][0-9]{2}[:][0-9]{2}[)][:][0-9]{3}$/ig) : new RegExp(/[0-9]{2}[:][0-9]{2}[:][0-9]{2}[:][0-9]{3}$/ig)
          const index = rows.reduce((ind, row, i) => {
            if (row.innerText.match(regExp)) {
              return i
            }
            return ind
          }, null)

          if (index == null || !rows[index] || !rows[index + 1] || !defenderCoord || !attackerCoord) {
            continue
          }

          const arrivalText = String(Array.from(rows?.[index]?.querySelectorAll('td'))?.[1]?.innerText || '').trim()
          const arrivalData = this.parseArrivalData(arrivalText)
          if (!arrivalData) continue

          const { arrival, arrivalParts } = arrivalData
          const travelText = String(rows[index + 1]?.querySelectorAll('td')?.[1]?.innerText || '').trim()
          const travelMeta = this.resolveIncomingTravelMeta({
            sourceCoord: attackerCoord,
            targetCoord: defenderCoord,
            travelText
          })

          if (!travelMeta) continue

          const { unitSlower, travel } = travelMeta
          const ticket = this.buildIncomingTicket({
            arrivalParts,
            travel,
            unitSlower
          })

          if (!ticket) continue

          comingAttack[attId] = {
            ...normalizeIncomingAttackEntry(comingAttack[attId]),
            power,
            ticket,
            attacker,
            attackerID,
            attackerCoord,
            attackerVillageID,
            arrival,
          }

          const attackCount = count + 1
          printMessage.warn(`${attackCount} ${attackCount > 1 ? 'Ataques Atualizados' : 'Ataque Atualizado'}`, 2000)
          count++
          this.newAttack++
          if (unitSlower === "snob") this.newSnob++
          this.notifyData.push({
            power,
            ticket,
            targetVillageId: villageId,
            targetVillageName: defenderVillageName,
            sourceName: attacker,
            sourceVillageName: attackerVillageName,
            arrivalText,
            arrival,
          })
        }

        nextVillageState.comingAttack = comingAttack
        state.villages[villageId] = normalizeIncomingVillageState(nextVillageState)
      }

      await writeIncomingState(state)

      if (this.notifyData.length) {
        await sendNotify('incoming', this.generateBodyNotify())
      }

      return state
    } catch (error) {
      console.error({ msg: error.message | null, script: "IncomingsAttaks - saveAttackNotPremium", error })
    } finally {
      loaderGame.remove()
    }
  }

  checkComingAttacks = async () => {
    try {
      this.resetNotifyState()
      const state = await readIncomingState()
      let config_atk = Number.isFinite(Number(state?.lastIncomingCount)) ? Number(state.lastIncomingCount) : 0
      const currentGameData = getGameData()
      const tbody = document.querySelector('tbody')
      const nAtkRaw = Number(document.querySelector("#incomings_amount")?.textContent)
      let n_atk = Number.isFinite(nAtkRaw) ? nAtkRaw : 0

      if (n_atk > config_atk && tbody) {
        const src = ""
        const audio = document.createElement('audio')
        tbody.append(audio)
        audio.src = src
        audio.id = 'audio_atk'
        const diff = Math.max(0, n_atk - config_atk)
        printMessage.warn(`${ diff } ${ diff > 1 ? 'Novos Ataques' : 'Novo Ataque' } CHEGANDO!!!`, 2000)
      }

      let atk_atual
      while (n_atk != config_atk) {
        atk_atual = n_atk
        if (!isPremiumAccountActive()) {
          await this.saveAttackNotPremium()
          await this.tagAttacksNotPremium()
        } else {
          await this.tagAttacksComingNPages()
        }
        const nAtkRaw = Number(document.querySelector("#incomings_amount")?.textContent)
        n_atk = Number.isFinite(nAtkRaw) ? nAtkRaw : 0
        if (n_atk == atk_atual) config_atk = n_atk
      }

      const nextState = await writeIncomingState({
        ...(await readIncomingState()),
        lastIncomingCount: n_atk,
      })

      if (isCurrentIncomingsScreen()) {
        window.location.reload()
      }

      if (document.querySelector("#audio_atk")) document.querySelector("#audio_atk").remove()

      return nextState?.villages?.[String(currentGameData?.village?.id || '')] || nextState
    } catch (error) {
      console.error({msg: error.message | null, script: "IncomingsAttaks - checkComingAttacks", error})
      throw error
    }
  }

  tagAttacksComing = (html = document) => {
    const incomingLabelRaw = String(i18n?.[twServer]?.incomings?.[0] || 'ataque').toLocaleLowerCase()
    const incomingLabel = incomingLabelRaw.replace(/[^a-z0-9]/gi, '')
    const rows = Array.from(
      html.querySelectorAll("#incomings_table > tbody tr.nowrap")
    )

    // Fallback: TW pode alterar a classe da linha e manter o quickedit.
    const sourceRows = rows.length
      ? rows
      : Array.from(html.querySelectorAll("#incomings_table > tbody tr"))
          .filter((row) => !!row.querySelector("span.quickedit"))

    return sourceRows.reduce((arr, row) => {
      try {
        const cells = Array.from(row.querySelectorAll("td"))
        if (!cells.length) return arr

        const power = this.attackPower(row)
        const quickedit = cells[0]?.querySelector?.("span.quickedit")
        const idCommand = String(quickedit?.dataset?.id || '').trim()
        if (!idCommand) return arr

        const coords = row.innerText.match(/\d+\|\d+/ig) || []
        const target = String(coords[0] || '').trim()
        const source = String(coords[1] || '').trim()
        if (!target || !source) return arr

        const villagesNames = cells.filter((td) => /\d+\|\d+/ig.test(String(td?.innerText || '')))
        const targetVillageName = this.normalizeInlineText(villagesNames[0]?.innerText || '')
        const sourceVillageName = this.normalizeInlineText(villagesNames[1]?.innerText || '')

        const targetLink = cells[1]?.querySelector?.('a[href*="village="]')
        const targetId = this.parseHrefParam(targetLink?.href || '', 'village')

        const arrivalCell =
          cells[5] ||
          cells.find((td) => /[0-9]{2}[:][0-9]{2}[:][0-9]{2}/ig.test(String(td?.innerText || '')))
        const arrivalText = String(arrivalCell?.innerText || '').trim()
        if (!arrivalText) return arr

        const sourceCell = cells.find((td) => td?.querySelector('a')?.href?.includes('info_player'));
        const sourceName = this.normalizeInlineText(sourceCell?.innerText || '')

        const arrivalData = this.parseArrivalData(arrivalText)
        if (!arrivalData) return arr
        const { arrival, arrivalParts } = arrivalData

        const ticket = String(cells[0]?.innerText || '').trim()
        const normalizedTicket = ticket.toLocaleLowerCase().replace(/[^a-z0-9]/gi, '')
        const hasTagInfo = /[|]\s*(r|send|envio|bt|backtime)\s*:/i.test(ticket)
        const isAttackDefault =
          !hasTagInfo &&
          normalizedTicket &&
          (
            normalizedTicket === incomingLabel ||
            normalizedTicket.startsWith(incomingLabel)
          )

        if (!isAttackDefault) return arr

        const travelText = String(cells[6]?.innerText || '').trim()
        if (!travelText) return arr

        const travelMeta = this.resolveIncomingTravelMeta({
          sourceCoord: source,
          targetCoord: target,
          travelText
        })

        if (!travelMeta) return arr

        const { unitSlower, travel } = travelMeta
        const newTicket = this.buildIncomingTicket({
          arrivalParts,
          travel,
          unitSlower
        })

        if (!newTicket) return arr

        this.newAttack++
        if (unitSlower === "snob") this.newSnob++

        this.notifyData.push({
          power,
          ticket: newTicket,
          targetVillageId: targetId,
          targetVillageName,
          sourceName,
          sourceVillageName,
          arrivalText,
          arrival
        })

        arr.push({
          id: idCommand,
          target: cells[0],
          targetId: targetId,
          ticket: newTicket
        })
      } catch (error) {
        console.warn({ msg: error?.message || null, script: "IncomingsAttaks - tagAttacksComing:row", error })
        return arr
      }
      return arr
    }, [])
  }

  tagAttacksComingNPages = async function () {
    // printMessage.warn("Tag Attacks Coming. Wait please...", 2500)
    try {
      this.notifyData = []
      const html = await this.getDoc('overview_villages&mode=incomings&type=all&subtype=attacks&group=0&page=-1')
      const { numberPages } = getPages(html)
      const pageSize = getPageSize(html)
      const n_atk = Number(document.querySelector("#incomings_amount")?.textContent)
      const arr = this.tagAttacksComing(html)

      if (numberPages > 0 && n_atk > 1000) {
        for (let n = 1; n < numberPages; n++) {
          const pageHtml = await this.getDoc(`overview_villages&mode=incomings&type=all&subtype=attacks&group=0&page=${n}`)
          arr.push(...this.tagAttacksComing(pageHtml))
        }
      }

      await postChangePageSize(pageSize, `overview_villages&mode=incomings`, 1000)

      if (!arr.length) return

      for (const e of arr) {
        await this.tagRequest(e.ticket, e.id)
      }

      if (this.notifyData.length) {
        await sendNotify('incoming', this.generateBodyNotify())
      }

      if (this.newAttack > 0) {
        printMessage.warn(
          `${this.newAttack} ${this.newAttack > 1 ? 'ataques etiquetados' : 'ataque etiquetado'}.`,
          2200
        )
      }
    } catch (error) {
      console.error({msg: error.message | null, script: "IncomingsAttack - tagAttacksComingNPages", error})
    }
  }

  getDoc = async(screen, villageId = null, { signal } = {}) => {
    const gameData = getGameData()
    const url = new URL(`${gameData.link_base_pure}${screen}`, window.origin)
    if (villageId) url.searchParams.set('village', villageId)
    const headers = makeAjaxHeadersGetDoc();
    // controller só pro timeout
    const timeoutCtrl = new AbortController();
    const t = setTimeout(() => timeoutCtrl.abort(new Error("timeout")), 8000);
    // ✅ combina: abort externo + timeout
    const combinedSignal = signal
      ? combineAbortControllerSignals([signal, timeoutCtrl.signal])
      : timeoutCtrl.signal;
    const req = new Request(url.toString(), {
      method: "GET",
      headers,
      credentials: "include",
      referrerPolicy: "origin",
      cache: "no-store",
      signal: combinedSignal
    });
    assertNoCaptchaInGame(document, 'getDoc:pre-fetch')
    try {
      const res = await fetch(req);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
  
      const text = await res.text();
      const html = new DOMParser().parseFromString(text, "text/html");
      assertNoCaptchaInGame(html, 'getDoc:html-response')
      assertNoGameUpdateOrBlockedRequest(html, { context: 'getDoc:html-response' })
      return html
    } finally {
      clearTimeout(t);
    }
  }
  
  tagRequest = async function(ticket, commandId, { signal } = {}) {
    const gameData = getGameData();
    const url = new URL(
      `${gameData.link_base_pure}info_command&ajaxaction=edit_other_comment&id=${commandId}&`,
      window.origin
    );
  
    const payloadSenders = {
      text: ticket,
      h: gameData.csrf
    }
    const body = makeAjaxBody(payloadSenders);
    const headers = makeAjaxHeadersPost();
  
    // controller só pro timeout
    const timeoutCtrl = new AbortController();
    const t = setTimeout(() => timeoutCtrl.abort(new Error("timeout")), 8000);
  
    // ✅ combina: abort externo + timeout
    const combinedSignal = signal
      ? combineAbortControllerSignals([signal, timeoutCtrl.signal])
      : timeoutCtrl.signal;
  
    if (ProtectingBot["bot-protect-all-in-game"].active()) {
      clearTimeout(t);
      throw ProtectingBot.error();
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
      });
  
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
  
      const { response, error } = await res.json();
      if (error || !response) throw new Error(error || "Not found!");
      return response;
    } finally {
      clearTimeout(t);
    }
  }
  // tagRequest = async function(ticket, commandId) {
  //   try {
  //     if (ProtectingBot['bot-protect-all-in-game'].active()) {
  //       throw ProtectingBot.error()
  //     }
  //     const headers = new Headers()

  //     headers.set('Tribalwars-Ajax', 1)

  //     const data = [
  //       ['text', ticket],
  //       ['h', gameData.csrf]
  //     ]

  //     await postRequest(linkSameVillage,
  //       `info_command&ajaxaction=edit_other_comment&id=${commandId}&`, data, {
  //         headers,
  //       }
  //     )
  //   } catch (error) {
  //     console.error({ msg: error.message | null, script: "IncomingsAttaks - TagRequest", error })
  //   }
  // }
}

export default IncomingsAttaks
