import './style.css'
import tableTextHtml from './index.html'
import { useGoTiming } from '../../../hooks/useGoTiming'
import createInfoBalloon from '../../../components/info-balloon'
import {
  buildTemplateFirstRowUnitsForPlaceLink,
  buildTemplateFlags,
  calcDataSendersForTemplate,
  getSlowestUnitName,
  calcDataSendersForDateTimeSchedule,
  calcDataSendersForDateTimeSend,
  senderTemplateContext,
  senderDateTimeContext,
  calcUnitDateTimeSchedule,
  calcUnitDateTimeSend
} from './utils'
import { dataUnits } from '../..'
import { getWorldUnitIndexByName, getWorldUnitsOrder } from '../../../unit'
import {
  readyTableSenderFilterStorage,
  getTableSenderFilterState,
  setTableSenderFilterState
} from './storage'
import { getGameData } from '@toolkit-tw-bot/document'
import { formatDateTime, formatTwFromDatetimeLocal } from '../../../components/input-date-time'
import { nSecStrTime } from '@toolkit-tw-bot/core'
import { createDropdown } from '../../../components/dropdown'

const TEMPLATE_STATUS_VALUES = ['ok', 'partial', 'warn', 'error']

function infoBox(message) {
  const el = document.createElement('div')
  el.className = 'info_box'
  el.textContent = message;
  return el
}

function filterEmptyBox() {
  const el = infoBox('Não há vilas para esse filtro')
  el.classList.add('go-filter-empty')
  return el
}

function extractBonusVariantClass(rawClass = '') {
  const tokens = String(rawClass || '').trim().split(/\s+/).filter(Boolean)
  const variant = tokens.find((token) => /^bonus_icon_\d+$/.test(token))
  if (variant) return variant
  return tokens.find((token) => token.startsWith('bonus_icon_')) || null
}

function normalizeBonusClass(rawClass = '') {
  const variant = extractBonusVariantClass(rawClass)
  if (!variant) return null
  return `bonus_icon ${variant}`
}

function getTemplateStatusByClassName(className = '') {
  if (className === 'go-template-ok') return 'ok'
  if (className === 'go-template-warn') return 'warn'
  if (className === 'go-template-error') return 'error'
  return 'partial'
}

function formatDateInputFromMs(ms) {
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function getTimeMinutesFromMs(ms) {
  if (!Number.isFinite(ms)) return null
  const d = new Date(ms)
  return d.getHours() * 60 + d.getMinutes()
}

function parseNightBonusHour(value) {
  if (value == null) return null
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{1,2})(?::\d{1,2})?$/)
    if (!match) return null
    const parsed = Number(match[1])
    if (!Number.isFinite(parsed)) return null
    if (parsed === 24) return 0
    return Math.max(0, Math.min(23, Math.floor(parsed)))
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  if (parsed === 24) return 0
  return Math.max(0, Math.min(23, Math.floor(parsed)))
}

function parseNightBonusActiveMode(value) {
  if (value == null) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return null
    if (['true', 'yes', 'on'].includes(normalized)) return 1
    if (['false', 'no', 'off'].includes(normalized)) return 0
    const parsed = Number(normalized)
    if (!Number.isFinite(parsed)) return null
    return Math.max(0, Math.floor(parsed))
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.floor(parsed))
}

function normalizeNightBonusConfig(config = null) {
  const startHour = parseNightBonusHour(
    config?.startHour ??
    config?.start_hour ??
    config?.start ??
    config?.startTime ??
    config?.start_time
  )
  const endHour = parseNightBonusHour(
    config?.endHour ??
    config?.end_hour ??
    config?.end ??
    config?.endTime ??
    config?.end_time
  )
  const activeRaw = config?.active ?? config?.enabled ?? config?.isActive
  const activeModeRaw = parseNightBonusActiveMode(activeRaw)
  const hasWindow = startHour != null && endHour != null
  const activeMode = activeModeRaw == null
    ? (hasWindow ? 1 : 0)
    : activeModeRaw
  const active = activeMode > 0
  return {
    activeMode,
    active,
    startHour,
    endHour
  }
}

function getNightWindowLabel(config = null) {
  const normalized = normalizeNightBonusConfig(config)
  if (!normalized.active || normalized.startHour == null || normalized.endHour == null) return null
  const pad = (value) => String(value).padStart(2, '0')
  return `${pad(normalized.startHour)}:00 - ${pad(normalized.endHour)}:00`
}

function isNightBonusAt(arrivalMs, config = null) {
  if (!Number.isFinite(Number(arrivalMs))) return false
  const normalized = normalizeNightBonusConfig(config)
  if (!normalized.active || normalized.startHour == null || normalized.endHour == null) return false
  const startMin = normalized.startHour * 60
  const endMin = normalized.endHour * 60
  const date = new Date(Number(arrivalMs))
  const currentMin = (date.getHours() * 60) + date.getMinutes()
  if (startMin === endMin) return false
  if (startMin < endMin) return currentMin >= startMin && currentMin < endMin
  return currentMin >= startMin || currentMin < endMin
}

function buildSenderMetaContexts({
  senders = [],
  calculateDistance,
  targetId,
  targetPlayerId = null,
  dateTime,
  dispatchMode = 'schedule',
  conflictTroopsMode = 'redistribute',
  templateState,
  fakeLimitPercent = null,
  snobMaxDistance = null,
  nightBonusConfig = null,
  minSpyCommandConfig = null
}) {
  const gameData = getGameData()
  const production = JSON.parse(localStorage.getItem(`_ds_v_data_${gameData.player.id}`)) || []
  const villageById = new Map(production.map(village => [village.id, village]))
  const worldUnitsOrder = getWorldUnitsOrder()
  const unitIndexByName = getWorldUnitIndexByName()
  const dateTimeContext = senderDateTimeContext({
    villageById,
    calculateDistance,
    dateTime,
    dispatchMode,
    nowMs: useGoTiming.getServerNowMs(),
    units: worldUnitsOrder
  })

  const timeByUnitByVillageId = new Map()
  const nextOutputMetaByVillageId = new Map()
  const templateMetaByVillageId = new Map()
  const villageBonusByClass = new Map()
  const nowMsStable = useGoTiming.getServerNowMs()
  const calcDateTimeByMode = dispatchMode === 'send'
    ? calcDataSendersForDateTimeSend
    : calcDataSendersForDateTimeSchedule

  senders.forEach((sender) => {
    const village = villageById.get(sender.villageId)
    if (!village) return
    const senderDistance = calculateDistance.calc({ x: Number(village.x), y: Number(village.y) })
    const { timeByUnit } = calcDateTimeByMode({
      sender,
      senderDateTimeContext: dateTimeContext,
      timeByUnitByVillageId,
      nextOutputMetaByVillageId
    })

    const templateContext = senderTemplateContext({
      templateState,
      fakeLimitPercent,
      villagePoints: Number(village.points) || 0,
      targetPlayerId,
      minSpyCommandConfig
    })
    const dataSendersForTemplate = calcDataSendersForTemplate({
      senderUnits: sender.units,
      unitIndexByName,
      timeByUnit,
      senderTemplateContext: templateContext,
      worldUnits: worldUnitsOrder,
      dispatchMode,
      conflictTroopsMode
    })
    const templateHasSnob = Boolean(dataSendersForTemplate?.unitsInTemplate?.has?.('snob'))
    const hasSnobDistanceLimit = Number.isFinite(Number(snobMaxDistance)) && Number(snobMaxDistance) > 0
    const snobDistanceExceeded = (
      templateHasSnob &&
      hasSnobDistanceLimit &&
      Number.isFinite(Number(senderDistance)) &&
      Number(senderDistance) > Number(snobMaxDistance)
    )
    const dataSendersForTemplateWithRules = dataSendersForTemplate
      ? {
          ...dataSendersForTemplate,
          snobMaxDistance: hasSnobDistanceLimit ? Number(snobMaxDistance) : null,
          senderDistance: Number.isFinite(Number(senderDistance)) ? Number(senderDistance) : null,
          snobDistanceExceeded
        }
      : dataSendersForTemplate
    const scheduleArrivalMs = (
      dispatchMode !== 'send' &&
      dateTime != null &&
      Number.isFinite(new Date(dateTime).getTime())
    )
      ? new Date(dateTime).getTime()
      : null
    const sendArrivalMs = (
      dispatchMode === 'send' &&
      Number.isFinite(Number(dataSendersForTemplate?.slowestTemplateDurationSeconds)) &&
      Number(dataSendersForTemplate?.slowestTemplateDurationSeconds) > 0
    )
      ? nowMsStable + (Math.floor(Number(dataSendersForTemplate.slowestTemplateDurationSeconds)) * 1000)
      : null
    const arrivalMsForNight = dispatchMode === 'send' ? sendArrivalMs : scheduleArrivalMs
    const nightWindowLabel = getNightWindowLabel(nightBonusConfig)
    const isNightBonus = isNightBonusAt(arrivalMsForNight, nightBonusConfig)
    const dataSendersForTemplateWithNightRules = dataSendersForTemplateWithRules
      ? {
          ...dataSendersForTemplateWithRules,
          isNightBonus,
          nightWindowLabel,
          arrivalMsForNight
        }
      : dataSendersForTemplateWithRules
    const unitsInTemplate = dataSendersForTemplate?.unitsInTemplate instanceof Set
      ? dataSendersForTemplate.unitsInTemplate
      : new Set()
    const unitsOutsideTemplate = new Set()
    sender.units.forEach((value, i) => {
      const unitName = worldUnitsOrder?.[i]
      const n = Number(value)
      if (!unitName || !Number.isFinite(n) || n <= 0) return
      if (!unitsInTemplate.has(unitName)) unitsOutsideTemplate.add(unitName)
    })
    const { className = '', title = '' } = buildTemplateFlags(dataSendersForTemplateWithNightRules)
    templateMetaByVillageId.set(sender.villageId, {
      className,
      title,
      status: getTemplateStatusByClassName(className),
      absents: unitsOutsideTemplate,
      hasTemplateSnob: templateHasSnob,
      snobDistanceExceeded,
      snobMaxDistance: hasSnobDistanceLimit ? Number(snobMaxDistance) : null,
      senderDistance: Number.isFinite(Number(senderDistance)) ? Number(senderDistance) : null,
      isNightBonus,
      nightWindowLabel,
      arrivalMsForNight,
      slowestTemplateUnit: dataSendersForTemplate?.slowestTemplateUnit || null,
      slowestTemplateDurationSeconds: Number.isFinite(Number(dataSendersForTemplate?.slowestTemplateDurationSeconds))
        ? Number(dataSendersForTemplate.slowestTemplateDurationSeconds)
        : null
    })

    // SEND: chegada baseada na unidade mais lenta do template que existe na vila.
    if (dispatchMode === 'send') {
      const distance = senderDistance
      const templateUnitsInSender = sender.units.reduce((acc, value, i) => {
        const unitName = worldUnitsOrder?.[i]
        const unitCount = Number(value) || 0
        if (!unitName || unitCount <= 0) return acc
        if (!unitsInTemplate.has(unitName)) return acc
        acc.push(unitName)
        return acc
      }, [])
      const slowestUnitName = getSlowestUnitName(templateUnitsInSender)
      const next = slowestUnitName
        ? calcUnitDateTimeSend(slowestUnitName, distance, nowMsStable)
        : { seconds: null, output: null }
      nextOutputMetaByVillageId.set(sender.villageId, {
        nextUnit: slowestUnitName || null,
        nextOutputMs: next?.output || null,
        nextSeconds: next?.seconds || null
      })
    }

    const bonusKey = extractBonusVariantClass(village?.bonus?.[0])
    if (!bonusKey) return
    const titleBonus = String(village?.bonus?.[1] || 'Bônus')
    if (!villageBonusByClass.has(bonusKey)) {
      villageBonusByClass.set(bonusKey, {
        bonusKey,
        className: `bonus_icon ${bonusKey}`,
        title: titleBonus
      })
    }
  })

  return {
    gameData,
    worldUnitsOrder,
    dateTimeContext,
    villageById,
    unitIndexByName,
    timeByUnitByVillageId,
    nextOutputMetaByVillageId,
    templateMetaByVillageId,
    villageBonusByClass,
    calculateDistance,
    targetId,
    dateTime,
    dispatchMode,
    templateState
  }
}

function buildSendersTbodyHtml({
  rows = [],
  senderMetaContexts,
  selectedGroupId = null
}) {
  const {
    calculateDistance,
    targetId,
    dateTime,
    dispatchMode = 'schedule',
    villageById,
    templateMetaByVillageId,
    nextOutputMetaByVillageId,
    timeByUnitByVillageId,
    templateState,
    unitIndexByName
  } = senderMetaContexts
  const nowMsStable = useGoTiming.getServerNowMs()
  const isSendMode = dispatchMode === 'send'
  const timeLabel = isSendMode ? 'Chegada' : 'Saída'
  const calcUnitDateTimeByMode = isSendMode
    ? (unitName, distance, _dateTime, nowMs) => calcUnitDateTimeSend(unitName, distance, nowMs)
    : (unitName, distance, nextDateTime, nowMs) => calcUnitDateTimeSchedule(unitName, distance, nextDateTime, nowMs)
  const gameData = getGameData()
  const placeUnitsBase = senderMetaContexts.worldUnitsOrder
    .reduce((acc, unit) => {
      acc[unit] = 0
      return acc
    }, {})
  const rowHtmlByVillageId = new Map()
  const emptyAbsentsSet = new Set()
  const tbodyTextHtml = rows.map((sender) => {
    const village = villageById.get(sender.villageId)
    if (!village) return ''
    const x = Number(village.x)
    const y = Number(village.y)
    const distance = calculateDistance.calc({ x, y });
    const distanceText = calculateDistance.round({ x, y }).toFixed(2)
    const templateMeta = templateMetaByVillageId?.get(sender.villageId) || {}
    const snobDistanceExceeded = Boolean(templateMeta?.snobDistanceExceeded)
    const isNightBonus = Boolean(templateMeta?.isNightBonus)
    const nightWindowLabel = String(templateMeta?.nightWindowLabel || '').trim()
    const hasTemplateSnob = Boolean(templateMeta?.hasTemplateSnob)
    const snobMaxDistance = Number(templateMeta?.snobMaxDistance)
    const hasSnobMaxDistance = Number.isFinite(snobMaxDistance) && snobMaxDistance > 0
    const distanceDataTitle = (hasTemplateSnob && hasSnobMaxDistance)
      ? `Nobre: Distância máxima ${snobMaxDistance} campos`
      : null

    const tdTimeHtml = () => {
      const nextMeta = nextOutputMetaByVillageId?.get(sender.villageId) || {}
      let slowest = null
      let title = null

      if (isSendMode) {
        if (Number.isFinite(nextMeta?.nextOutputMs) && Number.isFinite(nextMeta?.nextSeconds)) {
          slowest = {
            unit: nextMeta?.nextUnit || null,
            output: nextMeta.nextOutputMs,
            seconds: nextMeta.nextSeconds
          }
        }
      } else {
        const unitsIdSelected = sender.units.map((value, i) => {
          if (!value) return null
          const unit = senderMetaContexts.worldUnitsOrder[i]
          if (!unit) return null
          const { output, outputInSec, seconds } = calcUnitDateTimeByMode(unit, distance, dateTime, nowMsStable)
          if (!outputInSec) return null
          return { unit, outputInSec, output, seconds }
        }).filter(Boolean)
          .sort(({ outputInSec: a }, { outputInSec: b }) => a - b)

        slowest = unitsIdSelected.length ? unitsIdSelected.shift() : null
        title = unitsIdSelected.length ? (`
          Próximas saídas:
          ${unitsIdSelected.map(({ unit, output }, i) => {
            return `
              <br>
              ${i + 1}. ${dataUnits?.get(unit).name}: <br>${formatTwFromDatetimeLocal(formatDateTime(output))}
            `
          }).join('\n ')}
        `) : null
      }

      return `
        <td
          data-next-unit="${isSendMode ? '' : (nextMeta.nextUnit || '')}"
          data-next-output="${nextMeta.nextOutputMs || ''}"
          data-next-seconds="${isSendMode ? (nextMeta?.nextSeconds || '') : (slowest?.seconds || '')}"
          data-next-unit-label="${slowest ? (dataUnits?.get(slowest?.unit)?.name || slowest?.unit || '') : ''}"
        >
          <span
            class="${slowest ? (snobDistanceExceeded ? 'go-red' : (isNightBonus ? 'go-yellow' : '')) : 'go-smaller go-red'}"
            ${(title || isNightBonus) ? `data-title="${[
              title,
              isNightBonus
                ? `Chegada em bônus noturno${nightWindowLabel ? ` (${nightWindowLabel})` : ''}.`
                : ''
            ].filter(Boolean).join('<br>')}"` : ''}
          >
            ${slowest
              ? (`
                <span class="go-smaller">${dataUnits?.get(slowest?.unit).name}: </span><br>
                <span>${formatTwFromDatetimeLocal(formatDateTime(slowest.output))}</span>

                `)
              : 'no-time'
            }
          </span>
        </td>
      `
    }

    const absents = templateMeta?.absents instanceof Set ? templateMeta.absents : emptyAbsentsSet

    const tdsUnitHtml = () => sender.units.map((unit, i) => {
      const unitCount = Number(unit) || 0
      const unitName = senderMetaContexts.worldUnitsOrder[i];
      if (unitCount <= 0) {
        return `
          <td class="unit-item hidden" data-unit="${unitName}" data-output="" data-distance="${distance}">
            <span>${unitCount}</span>
          </td>
        `
      }
      const { seconds, output, outputInSec, unitOnTime } = calcUnitDateTimeByMode(unitName, distance, dateTime, nowMsStable);

      const isOutsideTemplate = absents.has(unitName)
      const title = output ? `
        ${dataUnits.get(unitName).name}${isOutsideTemplate ? ' (ausente do modelo)' : ''}<br>Duração: ${nSecStrTime(seconds)}<br>${timeLabel}: ${formatTwFromDatetimeLocal(formatDateTime(output))}
      ` : null
      const baseUnitClassName = !output
        ? ''
        : unitOnTime
          ? (isOutsideTemplate ? 'go-orange' : 'go-green')
          : 'go-red'
      const unitClassName = (
        snobDistanceExceeded &&
        unitName === 'snob' &&
        unitCount > 0
      )
        ? 'go-red'
        : baseUnitClassName
      return `
        <td
          class="unit-item ${unitClassName}"
          data-unit="${isSendMode ? '' : unitName}"
          data-output="${output || ''}"
          data-distance="${distance}"
          ${title ? `data-title="${title}"` : ''}
        >
          <span>${unitCount}</span>
          ${!isSendMode && unitClassName === 'go-green' && outputInSec && outputInSec < 600 ? `<span class="go-outin">${nSecStrTime(outputInSec).match(/.{1,5}$/)[0]
          }</span>` : ''}
        </td>
      `
    }).join('\n')

    const tdsUnitHtmlStr = tdsUnitHtml()
    const templateClass = templateMeta.className || 'go-template-partial'
    const templateTitle = templateMeta.title || ''
    const villageBonusClass = normalizeBonusClass(village?.bonus?.[0])
    const timeByUnit = timeByUnitByVillageId?.get(sender.villageId) || new Map()
    const isUnitOnTime = (value) => {
      if (value && typeof value === 'object') return Boolean(value.unitOnTime)
      return Boolean(value)
    }
    const isUnitOnTimeForLink = (unit) => {
      if (!dateTime) return true
      return isUnitOnTime(timeByUnit.get(unit))
    }
    const firstRowUnits = buildTemplateFirstRowUnitsForPlaceLink({
      templateState,
      senderUnits: sender.units,
      unitIndexByName
    })
    const placeUnits = { ...placeUnitsBase }
    firstRowUnits.forEach((value, unit) => {
      if (!(unit in placeUnits)) return
      const n = Number(value)
      const unitValue = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
      placeUnits[unit] = isUnitOnTimeForLink(unit) ? unitValue : 0
    })
    const placeParams = new URLSearchParams({
      village: String(sender.villageId),
      screen: 'place',
      target: String(targetId)
    })
    if (selectedGroupId != null) {
      placeParams.set('group', String(selectedGroupId))
    }
    Object.entries(placeUnits).forEach(([unit, value]) => {
      placeParams.set(unit, String(value))
    })
    const placeHref = `/game.php?${placeParams.toString()}`
    const incomingAttackParams = new URLSearchParams({
      village: String(sender.villageId),
      screen: 'overview_villages',
      mode: 'incomings',
      type: 'all',
      subtype: 'attacks'
    })
    const incomingSupportParams = new URLSearchParams({
      village: String(sender.villageId),
      screen: 'overview_villages',
      mode: 'incomings',
      type: 'all',
      subtype: 'supports'
    })
    if (selectedGroupId != null) {
      incomingAttackParams.set('group', String(selectedGroupId))
      incomingSupportParams.set('group', String(selectedGroupId))
    }
    const incomingAttackHref = `/game.php?${incomingAttackParams.toString()}`
    const incomingSupportHref = `/game.php?${incomingSupportParams.toString()}`

    const tdVillageItemHtml = () => `
      <td class="go-village-cell ${templateClass}" ${templateTitle ? `data-title="${templateTitle}"` : ''}>
        <div class="village-item go-village-item ${templateClass}">
          <span class="village-name" data-id="${sender.villageId}">
              ${village.incoming?.attack ? (
                `<a href="${incomingAttackHref}">
                  <img
                    src="https://dsbr.innogamescdn.com/asset/540228b3/graphic/command/attack.webp"
                    data-title="Sob ataque (${village.incoming.attack})"
                  >
                </a>`
              ) : ''}
              ${village.incoming?.support ? (
                `<a href="${incomingSupportHref}">
                  <img
                    src="https://dsbr.innogamescdn.com/asset/540228b3/graphic/command/support.webp"
                    data-title="Apoio chegando, (${village.incoming.support})"
                  >
                </a>`
              ) : ''}

              <a href="${placeHref}">

              <span
                class="go-name-ellipsis"
                data-title="${village.name.match(/^(.*)(\(.*)$/)[1]} ${village.name.match(/^(.*)(\(.*)$/)[2]}"
              >
                ${village.name.match(/^(.*)(\(.*)$/)[1]}
              </span>
            </a>
            <span>${village.name.match(/^(.*)(\(.*)$/)[2]}</span>
            ${villageBonusClass ? (
              `<span class="${villageBonusClass}" data-title="${village.bonus[1]}"></span>`
            ) : ''}
          </span>
          <span class="village-info">
            <strong>Pontos:</strong>
            ${Number(village.points).toLocaleString("pt-BR")}
            <strong>Pop:</strong>
            ${village.pop}/${village.pop_max}
          </span>
        </div>
      </td>

    `

    const rowClass = [
      Number(gameData.village.id) === sender.villageId ? 'selected' : ''
    ].filter(Boolean).join(' ')
    const isBlockedByTemplate = templateMeta?.status === 'error'
    const blockedTitle = isBlockedByTemplate
      ? 'Vila bloqueada para seleção: conflito de modelo (vermelho).'
      : ''

    const rowHtml = `
      <tr ${rowClass ? `class="${rowClass}"` : ''}>
        <td>
          <input
            type="checkbox"
            name="sender"
            id="input-${sender.villageId}"
            data-id="${sender.villageId}"
            ${isBlockedByTemplate ? 'disabled' : ''}
            ${blockedTitle ? `data-title="${blockedTitle}"` : ''}
          >
        </td>
        ${tdVillageItemHtml()}
        <td class="go-smaller ${snobDistanceExceeded ? 'go-red' : ''}" ${distanceDataTitle ? `data-title="${distanceDataTitle}"` : ''}>${distanceText}</td>
        ${tdTimeHtml()}
        ${tdsUnitHtmlStr}
      </tr>
    `
    rowHtmlByVillageId.set(sender.villageId, rowHtml)
    return rowHtml
  }).join(' ')
  return { tbodyTextHtml, rowHtmlByVillageId }
}

function insert(
  senders = [],
  calculateDistance,
  targetId,
  targetPlayerId = null,
  dateTime,
  templateState,
  fakeLimitPercent = null,
  snobMaxDistance = null,
  nightBonusConfig = null,
  templateStateForHint = null,
  dispatchMode = 'schedule',
  conflictTroopsMode = 'redistribute',
  minSpyCommandConfig = null,
  options = {}
) {
  const selectedGroupIdRaw = options?.selectedGroupId
  const hasSelectedGroupId = (
    selectedGroupIdRaw !== ""
    && selectedGroupIdRaw != null
    && Number.isFinite(Number(selectedGroupIdRaw))
  )
  const selectedGroupId = hasSelectedGroupId ? Number(selectedGroupIdRaw) : null
  let lastFilterState = getTableSenderFilterState(dispatchMode)
  const plannerSenders = document.querySelector('#go-planner-senders')
  if (!plannerSenders) throw new Error('Element not found')
  plannerSenders.dispatchEvent(new CustomEvent('go:planner:table:render:start', {
    bubbles: true,
    detail: { mode: dispatchMode }
  }))
  plannerSenders.innerHTML = ''
  if (!senders.length) {
    plannerSenders.insertAdjacentElement('beforeend', infoBox('Não há aldeias neste grupo.'))
    plannerSenders.dispatchEvent(new CustomEvent('go:planner:table:render:end', {
      bubbles: true,
      detail: { mode: dispatchMode, totalVisibleRows: 0 }
    }))
    return
  }
  plannerSenders.insertAdjacentHTML('beforeend', tableTextHtml)
  const senderMetaContexts = buildSenderMetaContexts({
    senders,
    calculateDistance,
    targetId,
    targetPlayerId,
    dateTime,
    dispatchMode,
    conflictTroopsMode,
    templateState,
    fakeLimitPercent,
    snobMaxDistance,
    nightBonusConfig,
    minSpyCommandConfig
  })
  const {
    gameData,
    worldUnitsOrder,
    villageById,
    unitIndexByName,
    nextOutputMetaByVillageId,
    templateMetaByVillageId,
    villageBonusByClass
  } = senderMetaContexts
  const isSendMode = dispatchMode === 'send'
  const nextOutputUnitsSet = new Set(
    Array.from(nextOutputMetaByVillageId.values())
      .map((item) => item?.nextUnit)
      .filter(Boolean)
  )
  const unitOrderDesc = worldUnitsOrder.slice().reverse()
  const nextOutputUnits = unitOrderDesc.filter((unit) => nextOutputUnitsSet.has(unit))
  Array.from(nextOutputUnitsSet).forEach((unit) => {
    if (!nextOutputUnits.includes(unit)) nextOutputUnits.push(unit)
  })
  const villageBonusOptions = Array.from(villageBonusByClass.values())
  const allVillageBonusClasses = villageBonusOptions.map((bonus) => bonus.bonusKey)
  const thUnitsTextHtml = `
    ${worldUnitsOrder.map(unit => {
      return `
        <th class="go go-center">
          <div class="go-th-wrap">
            <button class="go-ico go-sortable" type="button" data-sort="unit:${unit}">
              <img
                src="https://dsbr.innogamescdn.com/asset/540228b3/graphic/unit/unit_${unit}.webp"
                data-title="Ordenar: ${dataUnits.get(unit).name}"
              >
            </button>
            <button class="go-filter-btn" type="button" data-filter="unit:${unit}" data-title="Filtrar ${String(dataUnits.get(unit).name).toLowerCase()} (min)"></button>
          </div>
        </th>
      `
    }).join('\n ')}
  `
  document.querySelector('#go-village-title').innerHTML = `
    <span class="go-village-title-wrap">
      <a href="#" data-title="Ordenar por: ...">Aldeias</a>
      <button class="go-filter-btn" type="button" data-filter="village:filters" data-title="Filtrar aldeias"></button>
      <button class="go-sort-indicator" type="button"></button>
      <span class="go-selected-count"> (0/${senders.length})</span>
    </span>
    <span class="go-template-hint-slot"></span>
  `
  document.querySelector("#go-planner-senders > table > thead > tr").insertAdjacentHTML('beforeend', thUnitsTextHtml)
  const theadRow = document.querySelector("#go-planner-senders > table > thead > tr")
  const outputTh = theadRow?.querySelector('th:nth-child(4)')
  const outputSortBtn = outputTh?.querySelector('button[data-sort="output"]')
  const outputFilterBtnFromHeader = outputTh?.querySelector('button[data-filter="output"]')
  if (outputTh) outputTh.setAttribute('data-title', isSendMode ? 'Chegada' : 'Próxima Saída')
  if (outputSortBtn) outputSortBtn.setAttribute('data-title', isSendMode ? 'Ordenar: chegada' : 'Ordenar: próxima saída')
  if (outputFilterBtnFromHeader) outputFilterBtnFromHeader.setAttribute('data-title', isSendMode ? 'Filtrar chegada' : 'Filtrar próxima saída')
  const tbody = document.querySelector("#go-planner-senders > table > tbody")
  const { rowHtmlByVillageId } = buildSendersTbodyHtml({
    rows: senders,
    senderMetaContexts,
    selectedGroupId
  })
  const render = (rows) => {
    const tbodyTextHtml = rows
      .map((sender) => rowHtmlByVillageId.get(sender.villageId) || '')
      .join(' ')
    tbody.innerHTML = ''
    tbody.insertAdjacentHTML('beforeend', tbodyTextHtml)
  }
  const updateFilterEmpty = (rows) => {
    const existing = plannerSenders.querySelector('.go-filter-empty')
    if (rows.length === 0) {
      if (!existing) {
        const table = plannerSenders.querySelector('table')
        if (table) table.insertAdjacentElement('afterend', filterEmptyBox())
      }
      return
    }
    if (existing) existing.remove()
  }
  const sortState = { key: null, dir: 1 }
  const selectedVillageIds = new Set(
    (Array.isArray(options?.selectedVillageIds) ? options.selectedVillageIds : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
  )
  let currentVisibleRows = []
  const BONUS_NONE_KEY = '__none__'
  const filterState = {
    villageName: '',
    pointsMin: null,
    pointsMax: null,
    popMin: null,
    bonusClasses: new Set(),
    outputDateMin: null,
    outputDateMax: null,
    outputTimeMin: null,
    outputTimeMax: null,
    outputUnits: new Set(),
    distanceMin: null,
    distanceMax: null,
    templateStatuses: new Set(TEMPLATE_STATUS_VALUES),
    units: new Map(),
    paladinMode: null,
  }
  const loadFilterState = () => {
    if (!lastFilterState) return
    filterState.villageName = lastFilterState.villageName || ''
    filterState.pointsMin = lastFilterState.pointsMin ?? null
    filterState.pointsMax = lastFilterState.pointsMax ?? null
    filterState.popMin = lastFilterState.popMin ?? null
    if (Array.isArray(lastFilterState.bonusClasses)) {
      const allowed = new Set([...allVillageBonusClasses, BONUS_NONE_KEY])
      const persistedBonuses = lastFilterState.bonusClasses.filter((cls) => allowed.has(cls))
      const looksLikeLegacyAllIncluded =
        persistedBonuses.length === allVillageBonusClasses.length &&
        allVillageBonusClasses.length > 0 &&
        !persistedBonuses.includes(BONUS_NONE_KEY)
      filterState.bonusClasses = looksLikeLegacyAllIncluded ? new Set() : new Set(persistedBonuses)
    } else {
      filterState.bonusClasses = new Set()
    }
    filterState.outputDateMin = lastFilterState.outputDateMin ?? null
    filterState.outputDateMax = lastFilterState.outputDateMax ?? null
    filterState.outputTimeMin = lastFilterState.outputTimeMin ?? null
    filterState.outputTimeMax = lastFilterState.outputTimeMax ?? null
    if (filterState.outputDateMin == null && Number.isFinite(lastFilterState.outputMin)) {
      filterState.outputDateMin = formatDateInputFromMs(lastFilterState.outputMin)
    }
    if (filterState.outputDateMax == null && Number.isFinite(lastFilterState.outputMax)) {
      filterState.outputDateMax = formatDateInputFromMs(lastFilterState.outputMax)
    }
    if (Array.isArray(lastFilterState.outputUnits)) {
      const persistedUnits = lastFilterState.outputUnits.filter((unit) => nextOutputUnits.includes(unit))
      filterState.outputUnits = new Set(persistedUnits)
    } else {
      filterState.outputUnits = new Set()
    }
    filterState.distanceMin = lastFilterState.distanceMin ?? null
    filterState.distanceMax = lastFilterState.distanceMax ?? null
    if (Array.isArray(lastFilterState.templateStatuses)) {
      filterState.templateStatuses = new Set(
        lastFilterState.templateStatuses.filter((status) => TEMPLATE_STATUS_VALUES.includes(status))
      )
    } else {
      const legacyStatus = lastFilterState.templateStatus
      if (TEMPLATE_STATUS_VALUES.includes(legacyStatus)) {
        filterState.templateStatuses = new Set([legacyStatus])
      } else {
        filterState.templateStatuses = new Set(TEMPLATE_STATUS_VALUES)
      }
    }
    filterState.units = new Map((lastFilterState.units || []).map(([k, v]) => {
      if (v && typeof v === 'object') return [k, v]
      if (typeof v === 'number') return [k, { mode: 'has', min: v, max: null }]
      return [k, { mode: null, min: null, max: null }]
    }))
    filterState.paladinMode = lastFilterState.paladinMode ?? null
  }
  const persistFilterState = () => {
    lastFilterState = {
      villageName: filterState.villageName,
      pointsMin: filterState.pointsMin,
      pointsMax: filterState.pointsMax,
      popMin: filterState.popMin,
      bonusClasses: Array.from(filterState.bonusClasses),
      outputDateMin: filterState.outputDateMin,
      outputDateMax: filterState.outputDateMax,
      outputTimeMin: filterState.outputTimeMin,
      outputTimeMax: filterState.outputTimeMax,
      outputUnits: Array.from(filterState.outputUnits),
      distanceMin: filterState.distanceMin,
      distanceMax: filterState.distanceMax,
      templateStatuses: Array.from(filterState.templateStatuses),
      units: Array.from(filterState.units.entries()),
      paladinMode: filterState.paladinMode,
    }
    setTableSenderFilterState(dispatchMode, lastFilterState)
  }
  const getDistance = (sender) => {
    const village = villageById.get(sender.villageId)
    if (!village) return null
    return calculateDistance.calc({ x: Number(village.x), y: Number(village.y) })
  }
  const getSortValue = (sender, key) => {
    if (key === 'distance') return getDistance(sender)
    if (key === 'output') {
      return nextOutputMetaByVillageId?.get(sender.villageId)?.nextOutputMs ?? null
    }
    if (key.startsWith('unit:')) {
      const unitName = key.split(':')[1]
      const idx = unitIndexByName.get(unitName)
      return idx === undefined ? null : (sender.units?.[idx] ?? 0)
    }
    if (key.startsWith('village:')) {
      const village = villageById.get(sender.villageId)
      if (!village) return null
      const field = key.split(':')[1]
      if (field === 'name') return String(village.name || '').toLowerCase()
      if (field === 'points') return Number(village.points) || 0
      if (field === 'pop') return Number(village.pop) || 0
    }
    return null
  }
  const sortSenders = (rows, key, dir) => {
    const sorted = [...rows]
    sorted.sort((a, b) => {
      const av = getSortValue(a, key)
      const bv = getSortValue(b, key)
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv), 'pt-BR') * dir
      }
      if (av > bv) return dir
      if (av < bv) return -dir
      return 0
    })
    return sorted
  }
  const isFilterActive = (key) => {
    if (key === 'village:filters') {
      return Boolean(filterState.villageName) ||
        filterState.pointsMin != null ||
        filterState.pointsMax != null ||
        filterState.popMin != null ||
        filterState.bonusClasses.size > 0 ||
        filterState.templateStatuses.size !== TEMPLATE_STATUS_VALUES.length
    }
    if (key === 'distance') return filterState.distanceMin != null || filterState.distanceMax != null
    if (key === 'output') {
      return filterState.outputDateMin != null ||
        filterState.outputDateMax != null ||
        filterState.outputTimeMin != null ||
        filterState.outputTimeMax != null ||
        filterState.outputUnits.size > 0
    }
    if (key.startsWith('unit:')) {
      if (key === 'unit:paladin' || key === 'unit:knight') return filterState.paladinMode != null
      const unitFilter = filterState.units.get(key)
      return Boolean(unitFilter && (unitFilter.mode || unitFilter.min != null || unitFilter.max != null))
    }
    return false
  }
  const updateFilterIndicators = () => {
    theadRow.querySelectorAll('button[data-filter]').forEach((btn) => {
      const key = btn.getAttribute('data-filter')
      if (!key) return
      btn.classList.toggle('go-filtered', isFilterActive(key))
    })
  }
  const filterSenders = (rows) => {
    return rows.filter((sender) => {
      if (filterState.villageName) {
        const village = villageById.get(sender.villageId)
        const name = String(village?.name || '').toLowerCase()
        if (!name.includes(filterState.villageName)) return false
      }
      if (filterState.pointsMin != null || filterState.pointsMax != null) {
        const village = villageById.get(sender.villageId)
        const points = Number(village?.points) || 0
        if (filterState.pointsMin != null && points < filterState.pointsMin) return false
        if (filterState.pointsMax != null && points > filterState.pointsMax) return false
      }
      if (filterState.popMin != null) {
        const village = villageById.get(sender.villageId)
        const pop = Number(village?.pop) || 0
        if (pop < filterState.popMin) return false
      }
      if (filterState.bonusClasses.size > 0) {
        const village = villageById.get(sender.villageId)
        const villageBonusClass = extractBonusVariantClass(village?.bonus?.[0])
        if (!villageBonusClass && filterState.bonusClasses.has(BONUS_NONE_KEY)) return false
        if (villageBonusClass && filterState.bonusClasses.has(villageBonusClass)) return false
      }
      if (
        filterState.outputDateMin != null ||
        filterState.outputDateMax != null ||
        filterState.outputTimeMin != null ||
        filterState.outputTimeMax != null
      ) {
        const nextOutputMs = nextOutputMetaByVillageId?.get(sender.villageId)?.nextOutputMs ?? null
        if (nextOutputMs == null) return false
        const nextDate = formatDateInputFromMs(nextOutputMs)
        if (filterState.outputDateMin != null && nextDate < filterState.outputDateMin) return false
        if (filterState.outputDateMax != null && nextDate > filterState.outputDateMax) return false
        const nextMinutes = getTimeMinutesFromMs(nextOutputMs)
        if (nextMinutes == null) return false
        const min = filterState.outputTimeMin
        const max = filterState.outputTimeMax
        if (min != null && max != null) {
          if (min <= max) {
            if (nextMinutes < min || nextMinutes > max) return false
          } else {
            if (!(nextMinutes >= min || nextMinutes <= max)) return false
          }
        } else {
          if (min != null && nextMinutes < min) return false
          if (max != null && nextMinutes > max) return false
        }
      }
      if (filterState.outputUnits.size > 0) {
        const nextUnit = nextOutputMetaByVillageId?.get(sender.villageId)?.nextUnit || null
        if (nextUnit && filterState.outputUnits.has(nextUnit)) return false
      }
      if (filterState.templateStatuses.size !== TEMPLATE_STATUS_VALUES.length) {
        const status = templateMetaByVillageId?.get(sender.villageId)?.status || 'partial'
        if (!filterState.templateStatuses.has(status)) return false
      }
      if (filterState.distanceMin != null || filterState.distanceMax != null) {
        const dist = getDistance(sender)
        if (dist == null) return false
        if (filterState.distanceMin != null && dist < filterState.distanceMin) return false
        if (filterState.distanceMax != null && dist > filterState.distanceMax) return false
      }
      for (const [key, cfg] of filterState.units.entries()) {
        if (!cfg) continue
        const unitName = key.split(':')[1]
        const idx = unitIndexByName.get(unitName)
        const value = idx == null ? 0 : (sender.units?.[idx] ?? 0)
        if (cfg.mode === 'not') {
          if (value > 0) return false
          continue
        }
        if (cfg.mode === 'has') {
          if (value <= 0) return false
        }
        if (cfg.min != null && value < cfg.min) return false
        if (cfg.max != null && value > cfg.max) return false
      }
      if (filterState.paladinMode) {
        const idx = unitIndexByName.get('paladin') ?? unitIndexByName.get('knight')
        const value = idx == null ? 0 : (sender.units?.[idx] ?? 0)
        if (filterState.paladinMode === 'has' && value <= 0) return false
        if (filterState.paladinMode === 'not' && value > 0) return false
      }
      return true
    })
  }
  let currentTotalRows = senders.length
  const setCheckboxSelection = (checkbox, checked) => {
    if (!checkbox) return
    const villageId = Number(checkbox.dataset.id)
    if (checkbox.disabled) {
      checkbox.checked = false
      if (Number.isFinite(villageId)) selectedVillageIds.delete(villageId)
      return
    }
    checkbox.checked = !!checked
    if (!Number.isFinite(villageId)) return
    if (checked) selectedVillageIds.add(villageId)
    else selectedVillageIds.delete(villageId)
  }
  const applySelectionToVisibleRows = () => {
    tbody.querySelectorAll('input[name="sender"]').forEach((input) => {
      const villageId = Number(input.dataset.id)
      if (input.disabled) {
        input.checked = false
        if (Number.isFinite(villageId)) selectedVillageIds.delete(villageId)
        return
      }
      const checked = Number.isFinite(villageId) && selectedVillageIds.has(villageId)
      input.checked = checked
    })
  }
  const applyView = () => {
    const filtered = filterSenders(senders)
    const rows = sortState.key
      ? sortSenders(filtered, sortState.key, sortState.dir)
      : filtered
    currentVisibleRows = rows
    render(rows)
    applySelectionToVisibleRows()
    currentTotalRows = rows.length
    updateFilterEmpty(rows)
    updateSelectedCount()
    persistFilterState()
  }
  const defaultSortDir = (key) => {
    if (key.startsWith('unit:')) return -1
    if (key === 'village:points' || key === 'village:pop') return -1
    return 1
  }
  const setSortIndicator = (key, dir) => {
    const buttons = theadRow.querySelectorAll('button[data-sort]')
    buttons.forEach((btn) => {
      btn.classList.remove('go-sorted')
      btn.removeAttribute('data-sort-dir')
    })
    const villageTitleWrap = document.querySelector('#go-village-title .go-village-title-wrap')
    const villageIndicator = villageTitleWrap?.querySelector('.go-sort-indicator')
    if (villageTitleWrap) {
      villageTitleWrap.classList.remove('go-sorted')
      villageTitleWrap.removeAttribute('data-sort-dir')
    }
    if (villageIndicator) villageIndicator.textContent = ''
    if (villageIndicator) villageIndicator.setAttribute('data-sort-key', '')
    if (villageIndicator) villageIndicator.removeAttribute('data-sort-dir')
    if (villageIndicator) villageIndicator.setAttribute('data-title', 'Ordenar por: ...')
    if (!key) return
    const dirLabel = dir > 0 ? 'asc' : 'desc'
    if (key.startsWith('village:')) {
      if (villageTitleWrap) {
        villageTitleWrap.classList.add('go-sorted')
        villageTitleWrap.setAttribute('data-sort-dir', dirLabel)
      }
      if (villageIndicator) {
        villageIndicator.textContent = dir > 0 ? '▲' : '▼'
        villageIndicator.setAttribute('data-sort-key', key)
        villageIndicator.setAttribute('data-sort-dir', dirLabel)
        const field = key.split(':')[1]
        const label = field === 'name' ? 'Nome' : field === 'points' ? 'Pontos' : field === 'pop' ? 'População' : '...'
        villageIndicator.setAttribute('data-title', `Ordenar por: ${label}`)
      }
      return
    }
    const match = Array.from(buttons).find((btn) => btn.dataset.sort === key)
    if (match) {
      match.classList.add('go-sorted')
      match.setAttribute('data-sort-dir', dirLabel)
    }
  }
  const applySort = (key, { skipRender = false } = {}) => {
    const dir = sortState.key === key ? -sortState.dir : defaultSortDir(key)
    sortState.key = key
    sortState.dir = dir
    setSortIndicator(key, dir)
    if (!skipRender) applyView()
  }
  const selectedCountEl = document.querySelector('#go-village-title .go-selected-count')
  const templateHintSlot = document.querySelector('#go-village-title .go-template-hint-slot')
  const templateHint = createInfoBalloon({
    mountEl: templateHintSlot,
    icon: '?',
    badgeTitle: 'O que é isto?',
    title: 'CONFLITO:',
    text: 'MODELO de tropas: Se há conflito, a tabela mantém os últimos dados válidos.',
    auto: true,
    autoOpenFirst: true
  })
  const onTemplateStatsForHint = (event) => {
    const payload = event?.detail || null
    const conflicts = payload?.validation?.conflicts || {}
    const isValid = payload?.validation?.isValid
    const shouldShow = isValid === false
    if (!shouldShow) {
      templateHint?.hide?.()
      return
    }
    const conflictNames = []
    if (conflicts.footer) conflictNames.push('TROPAS')
    if (conflicts.paladin) conflictNames.push('PALADINO')
    if (conflicts.speed) conflictNames.push('VELOCIDADE')
    const conflictName = conflictNames.length ? conflictNames.join(' | ') : ''
    templateHint?.show?.({
      title: conflictName ? `CONFLITO: ${conflictName}` : '',
      text: 'MODELO DE TROPAS: Se há conflito, a tabela mantém os últimos dados válidos.',
    })
  }
  onTemplateStatsForHint({ detail: templateStateForHint || templateState })
  document.addEventListener('go:template:stats:stable', onTemplateStatsForHint, true)
  const updateSelectedCount = () => {
    if (!selectedCountEl) return
    const totalSelected = Array.from(tbody.querySelectorAll('input[name="sender"]')).reduce((acc, input) => {
      const villageId = Number(input.dataset.id)
      if (!Number.isFinite(villageId)) return acc
      return acc + (selectedVillageIds.has(villageId) ? 1 : 0)
    }, 0)
    const selectableInputs = Array.from(tbody.querySelectorAll('input[name="sender"]'))
      .filter((input) => !input.disabled)
    const totalSelectableRows = selectableInputs.length
    const totalSelectedSelectable = selectableInputs.reduce((acc, input) => {
      const villageId = Number(input.dataset.id)
      if (!Number.isFinite(villageId)) return acc
      return acc + (selectedVillageIds.has(villageId) ? 1 : 0)
    }, 0)
    const selectableVillageIds = selectableInputs
      .map((input) => Number(input.dataset.id))
      .filter((villageId) => Number.isFinite(villageId))
    selectedCountEl.textContent = ` (${totalSelected}/${currentTotalRows})`
    if (checkAll) {
      checkAll.indeterminate = totalSelectedSelectable > 0 && totalSelectedSelectable < totalSelectableRows
      checkAll.checked = totalSelectableRows > 0 && totalSelectedSelectable === totalSelectableRows
      checkAll.disabled = totalSelectableRows === 0
    }
    plannerSenders.dispatchEvent(new CustomEvent('go:planner:selection', {
      bubbles: true,
      detail: {
        selectedVisibleCount: totalSelected,
        selectedSelectableCount: totalSelectedSelectable,
        selectedVillageIds: Array.from(selectedVillageIds),
        totalSelectableRows,
        totalVisibleRows: currentTotalRows,
        selectableVillageIds,
        visibleVillageIds: currentVisibleRows.map((sender) => sender.villageId)
      }
    }))
  }
  const onClicktheadRow = (event) => {
    const button = event.target.closest('button[data-sort]')
    if (!button) return
    applySort(button.dataset.sort)
  }
  theadRow.addEventListener('click', onClicktheadRow);
  const villageTitle = document.querySelector('#go-village-title')
  const villageTitleWrap = villageTitle?.querySelector('.go-village-title-wrap')
  const villageTitleBtn = villageTitleWrap?.querySelector('a')
  const villageIndicatorBtn = villageTitleWrap?.querySelector('.go-sort-indicator')
  const villageMenu = document.createElement('div')
  villageMenu.className = 'go-dd'
  villageMenu.hidden = true
  villageMenu.innerHTML = `
    <span data-sort="village:name">Nome</span>
    <span data-sort="village:points">Pontos</span>
    <span data-sort="village:pop">População</span>
  `
  villageTitleWrap?.appendChild(villageMenu)
  const makeFloatingHandlers = (btn, menu) => {
    if (!btn || !menu) return {}
    let originalParent = null
    let originalNext = null
    const positionMenu = () => {
      const rect = btn.getBoundingClientRect()
      menu.style.position = 'fixed'
      menu.style.top = `${rect.bottom + 6}px`
      menu.style.left = `${Math.max(4, rect.left)}px`
      menu.style.zIndex = '9999999'
    }
    return {
      onOpen: () => {
        originalParent = menu.parentElement
        originalNext = menu.nextSibling
        document.body.appendChild(menu)
        positionMenu()
      },
      onClose: () => {
        menu.style.position = ''
        menu.style.top = ''
        menu.style.left = ''
        menu.style.zIndex = ''
        if (originalParent) originalParent.insertBefore(menu, originalNext)
      },
    }
  }
  const villageMenuDD = createDropdown({
    btn: villageTitleBtn,
    menu: villageMenu,
    matchSelector: 'span[data-sort]',
    onSelect: (item) => {
      applySort(item.dataset.sort)
      villageMenuDD?.close()
    },
    ...makeFloatingHandlers(villageTitleBtn, villageMenu),
  })
  const filterDropdowns = []
  const filterHandlers = []
  const addFilterHandler = (el, event, handler) => {
    el.addEventListener(event, handler)
    filterHandlers.push(() => el.removeEventListener(event, handler))
  }
  const parseNumber = (value) => {
    if (value == null || value === '') return null
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  const parseTimeInput = (value) => {
    if (!value) return null
    const [h, m] = String(value).split(':').map((v) => Number(v))
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    if (h < 0 || h > 23 || m < 0 || m > 59) return null
    return (h * 60) + m
  }
  const formatTimeInput = (minutes) => {
    if (!Number.isFinite(minutes)) return ''
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  const villageFilterBtn = villageTitleWrap?.querySelector('button[data-filter="village:filters"]')
  if (villageFilterBtn && villageTitleWrap) {
    const villageBonusNoneOptionHtml = `
      <label class="go-dd-check-item">
        <input type="checkbox" data-filter-input="village:bonus" data-value="${BONUS_NONE_KEY}">
        <span>Nenhum bônus</span>
      </label>
    `
    const villageBonusOptionsHtml = villageBonusOptions.length
      ? villageBonusOptions.map(({ bonusKey, className, title }) => `
        <label class="go-dd-check-item" data-title="${title}">
          <input type="checkbox" data-filter-input="village:bonus" data-value="${bonusKey}">
          <span class="${className}" data-title="${title}"></span>
        </label>
      `).join('\n ')
      : '<span class="go-dd-muted">Nenhum bônus nas aldeias listadas.</span>'
    const villageFilterMenu = document.createElement('div')
    villageFilterMenu.className = 'go-dd go-dd-filter'
    villageFilterMenu.hidden = true
    villageFilterMenu.innerHTML = `
      <div class="go-dd-title">
        Filtrar aldeias
        <button class="go-dd-close" type="button" data-filter-action="close" data-title="Fechar">×</button>
      </div>
      <div class="go-dd-row">
        <label>Modelo</label>
        <div class="go-template-status-options">
          <button
            type="button"
            class="go-template-status-square go-template-status-selected go-template-status-ok"
            data-filter-input="village:template-status"
            data-value="ok"
            data-title="Verde: 100% compatível com o modelo"
          ></button>
          <button
            type="button"
            class="go-template-status-square go-template-status-selected go-template-status-partial"
            data-filter-input="village:template-status"
            data-value="partial"
            data-title="Cinza: compatível parcial (faltam tropas do modelo)"
          ></button>
          <button
            type="button"
            class="go-template-status-square go-template-status-selected go-template-status-warn"
            data-filter-input="village:template-status"
            data-value="warn"
            data-title="Amarelo: compatível, mas com tropas fora de horário"
          ></button>
          <button
            type="button"
            class="go-template-status-square go-template-status-selected go-template-status-error"
            data-filter-input="village:template-status"
            data-value="error"
            data-title="Vermelho: incompatível ou nenhuma tropa chega a tempo"
          ></button>
        </div>
      </div>
      <div class="go-dd-row">
        <label>Nome contém</label>
        <div class="go-dd-input-wrap">
          <input class="go-dd-input" type="text" data-filter-input="village:name" placeholder="ex: ala">
          <img
            data-title="Limpar este filtro"
            alt="Borracha Limpar"
            src="https://dsbr.innogamescdn.com/asset/98f3b7c4/graphic/delete_14.png"
            class="float_right go-dd-delete"
            data-clear="village:name"
          >
        </div>
      </div>
      <div class="go-dd-row">
        <label>Pontos (min)</label>
        <div class="go-dd-input-wrap">
          <input class="go-dd-input" type="number" step="1" min="0" data-filter-input="village:points-min">
          <img
            data-title="Limpar este filtro"
            alt="Borracha Limpar"
            src="https://dsbr.innogamescdn.com/asset/98f3b7c4/graphic/delete_14.png"
            class="float_right go-dd-delete"
            data-clear="village:points-min"
          >
        </div>
      </div>
      <div class="go-dd-row">
        <label>Pontos (max)</label>
        <div class="go-dd-input-wrap">
          <input class="go-dd-input" type="number" step="1" min="0" data-filter-input="village:points-max">
          <img
            data-title="Limpar este filtro"
            alt="Borracha Limpar"
            src="https://dsbr.innogamescdn.com/asset/98f3b7c4/graphic/delete_14.png"
            class="float_right go-dd-delete"
            data-clear="village:points-max"
          >
        </div>
      </div>
      <div class="go-dd-row">
        <label>População (min)</label>
        <div class="go-dd-input-wrap">
          <input class="go-dd-input" type="number" step="1" min="0" data-filter-input="village:pop-min">
          <img
            data-title="Limpar este filtro"
            alt="Borracha Limpar"
            src="https://dsbr.innogamescdn.com/asset/98f3b7c4/graphic/delete_14.png"
            class="float_right go-dd-delete"
            data-clear="village:pop-min"
          >
        </div>
      </div>
      <div class="go-dd-row go-dd-col">
        <label>Selecione bônus para excluir:</label>
        <div>
          ${villageBonusNoneOptionHtml}
        </div>
        <div class="go-dd-check-list go-dd-check-list-bonus">
          ${villageBonusOptionsHtml}
        </div>
      </div>
      <div class="go-dd-actions">
        <button type="button" data-filter-action="clear-all">Limpar todos</button>
      </div>
    `
    villageTitleWrap.appendChild(villageFilterMenu)
    const villageFilterDD = createDropdown({
      btn: villageFilterBtn,
      menu: villageFilterMenu,
      matchSelector: '[data-filter-action]',
      onSelect: (item) => {
        if (item.dataset.filterAction === 'close') {
          villageFilterDD?.close()
          return
        }
        villageFilterMenu.querySelectorAll('input').forEach((input) => { input.value = '' })
        filterState.villageName = ''
        filterState.pointsMin = null
        filterState.pointsMax = null
        filterState.popMin = null
        villageFilterMenu.querySelectorAll('input[data-filter-input="village:bonus"]').forEach((input) => {
          input.checked = false
        })
        filterState.bonusClasses = new Set()
        setTemplateStatusButtons(TEMPLATE_STATUS_VALUES)
        villageFilterMenu.querySelectorAll('.go-dd-input').forEach((input) => updateClearIcon(input))
        updateFilterIndicators()
        applyView()
      },
      ...makeFloatingHandlers(villageFilterBtn, villageFilterMenu),
    })
    filterDropdowns.push(villageFilterDD)
    const setTemplateStatusButtons = (statuses = TEMPLATE_STATUS_VALUES) => {
      const next = new Set(
        Array.from(statuses).filter((status) => TEMPLATE_STATUS_VALUES.includes(status))
      )
      villageFilterMenu.querySelectorAll('button[data-filter-input="village:template-status"]').forEach((btn) => {
        btn.classList.toggle('go-template-status-selected', next.has(btn.getAttribute('data-value')))
      })
      filterState.templateStatuses = next
    }
    setTemplateStatusButtons(filterState.templateStatuses)
    villageFilterMenu.querySelectorAll('button[data-filter-input="village:template-status"]').forEach((statusBtn) => {
      addFilterHandler(statusBtn, 'click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        const value = statusBtn.getAttribute('data-value')
        if (!TEMPLATE_STATUS_VALUES.includes(value)) return
        const next = new Set(filterState.templateStatuses)
        if (next.has(value)) next.delete(value)
        else next.add(value)
        setTemplateStatusButtons(next)
        updateFilterIndicators()
        applyView()
      })
    })
    const updateClearIcon = (input) => {
      const wrap = input?.closest('.go-dd-input-wrap')
      if (!wrap) return
      const hasValue = String(input.value || '').trim().length > 0
      wrap.classList.toggle('has-value', hasValue)
    }
    const villageInput = villageFilterMenu.querySelector('input[data-filter-input="village:name"]')
    const pointsMinInput = villageFilterMenu.querySelector('input[data-filter-input="village:points-min"]')
    const pointsMaxInput = villageFilterMenu.querySelector('input[data-filter-input="village:points-max"]')
    const popMinInput = villageFilterMenu.querySelector('input[data-filter-input="village:pop-min"]')
    const syncVillageBonusFromInputs = () => {
      const selected = Array.from(villageFilterMenu.querySelectorAll('input[data-filter-input="village:bonus"]:checked'))
        .map((input) => input.getAttribute('data-value'))
        .filter((cls) => cls === BONUS_NONE_KEY || allVillageBonusClasses.includes(cls))
      filterState.bonusClasses = new Set(selected)
    }
    if (villageInput) {
      addFilterHandler(villageInput, 'input', () => {
        filterState.villageName = String(villageInput.value || '').trim().toLowerCase()
        updateClearIcon(villageInput)
        updateFilterIndicators()
        applyView()
      })
    }
    if (pointsMinInput) {
      addFilterHandler(pointsMinInput, 'input', () => {
        filterState.pointsMin = parseNumber(pointsMinInput.value)
        updateClearIcon(pointsMinInput)
        updateFilterIndicators()
        applyView()
      })
    }
    if (pointsMaxInput) {
      addFilterHandler(pointsMaxInput, 'input', () => {
        filterState.pointsMax = parseNumber(pointsMaxInput.value)
        updateClearIcon(pointsMaxInput)
        updateFilterIndicators()
        applyView()
      })
    }
    if (popMinInput) {
      addFilterHandler(popMinInput, 'input', () => {
        filterState.popMin = parseNumber(popMinInput.value)
        updateClearIcon(popMinInput)
        updateFilterIndicators()
        applyView()
      })
    }
    villageFilterMenu.querySelectorAll('input[data-filter-input="village:bonus"]').forEach((input) => {
      addFilterHandler(input, 'change', () => {
        syncVillageBonusFromInputs()
        updateFilterIndicators()
        applyView()
      })
    })
    villageFilterMenu.querySelectorAll('.go-dd-input').forEach((input) => updateClearIcon(input))
    addFilterHandler(villageFilterMenu, 'click', (event) => {
      const btn = event.target.closest('.go-dd-delete')
      if (!btn) return
      const key = btn.getAttribute('data-clear')
      if (!key) return
      const input = villageFilterMenu.querySelector(`input[data-filter-input="${key}"]`)
      if (input) input.value = ''
      if (input) updateClearIcon(input)
      if (key === 'village:name') filterState.villageName = ''
      if (key === 'village:points-min') filterState.pointsMin = null
      if (key === 'village:points-max') filterState.pointsMax = null
      if (key === 'village:pop-min') filterState.popMin = null
      updateFilterIndicators()
      applyView()
    })
  }
  const outputFilterBtn = theadRow.querySelector('button[data-filter="output"]')
  if (outputFilterBtn) {
    const outputLabelText = isSendMode ? 'chegada' : 'próxima saída'
    const outputUnitOptionsHtml = nextOutputUnits.length
      ? nextOutputUnits.map((unit) => `
        <label class="go-dd-check-item">
          <input type="checkbox" data-filter-input="output-unit" data-value="${unit}">
          <span>${dataUnits?.get?.(unit)?.name || unit}</span>
        </label>
      `).join('\n ')
      : `<span class="go-dd-muted">Nenhuma tropa com ${outputLabelText}.</span>`
    const outputMenu = document.createElement('div')
    outputMenu.className = 'go-dd go-dd-filter go-dd-filter-output'
    outputMenu.hidden = true
    outputMenu.innerHTML = `
      <div class="go-dd-title">
        Filtrar ${outputLabelText}
        <button class="go-dd-close" type="button" data-filter-action="close" data-title="Fechar">×</button>
      </div>
      <div class="go-dd-row">
        <label>Data (min)</label>
        <div class="go-dd-input-wrap">
          <input class="go-dd-input" type="date" data-filter-input="output-date-min">
          <img
            data-title="Limpar este filtro"
            alt="Borracha Limpar"
            src="https://dsbr.innogamescdn.com/asset/98f3b7c4/graphic/delete_14.png"
            class="float_right go-dd-delete"
            data-clear="output-date-min"
          >
        </div>
      </div>
      <div class="go-dd-row">
        <label>Data (max)</label>
        <div class="go-dd-input-wrap">
          <input class="go-dd-input" type="date" data-filter-input="output-date-max">
          <img
            data-title="Limpar este filtro"
            alt="Borracha Limpar"
            src="https://dsbr.innogamescdn.com/asset/98f3b7c4/graphic/delete_14.png"
            class="float_right go-dd-delete"
            data-clear="output-date-max"
          >
        </div>
      </div>
      <div class="go-dd-row">
        <label>Hora (min)</label>
        <div class="go-dd-input-wrap">
          <input class="go-dd-input" type="time" data-filter-input="output-time-min">
          <img
            data-title="Limpar este filtro"
            alt="Borracha Limpar"
            src="https://dsbr.innogamescdn.com/asset/98f3b7c4/graphic/delete_14.png"
            class="float_right go-dd-delete"
            data-clear="output-time-min"
          >
        </div>
      </div>
      <div class="go-dd-row">
        <label>Hora (max)</label>
        <div class="go-dd-input-wrap">
          <input class="go-dd-input" type="time" data-filter-input="output-time-max">
          <img
            data-title="Limpar este filtro"
            alt="Borracha Limpar"
            src="https://dsbr.innogamescdn.com/asset/98f3b7c4/graphic/delete_14.png"
            class="float_right go-dd-delete"
            data-clear="output-time-max"
          >
        </div>
      </div>
      <div class="go-dd-row go-dd-col">
        <label>Selecione tropas para excluir:</label>
        <div class="go-dd-check-list go-dd-check-list-output">
          ${outputUnitOptionsHtml}
        </div>
      </div>
      <div class="go-dd-actions">
        <button type="button" data-filter-action="clear">Limpar todos</button>
      </div>
    `
    outputFilterBtn.parentElement?.appendChild(outputMenu)
    const outputDD = createDropdown({
      btn: outputFilterBtn,
      menu: outputMenu,
      matchSelector: '[data-filter-action]',
      onSelect: (item) => {
        if (item.dataset.filterAction === 'close') {
          outputDD?.close()
          return
        }
        const dateMinInput = outputMenu.querySelector('input[data-filter-input="output-date-min"]')
        const dateMaxInput = outputMenu.querySelector('input[data-filter-input="output-date-max"]')
        const timeMinInput = outputMenu.querySelector('input[data-filter-input="output-time-min"]')
        const timeMaxInput = outputMenu.querySelector('input[data-filter-input="output-time-max"]')
        if (dateMinInput) dateMinInput.value = ''
        if (dateMaxInput) dateMaxInput.value = ''
        if (timeMinInput) timeMinInput.value = ''
        if (timeMaxInput) timeMaxInput.value = ''
        filterState.outputDateMin = null
        filterState.outputDateMax = null
        filterState.outputTimeMin = null
        filterState.outputTimeMax = null
        outputMenu.querySelectorAll('input[data-filter-input="output-unit"]').forEach((input) => {
          input.checked = false
        })
        filterState.outputUnits = new Set()
        outputMenu.querySelectorAll('.go-dd-input').forEach((input) => updateClearIcon(input))
        updateFilterIndicators()
        applyView()
      },
      ...makeFloatingHandlers(outputFilterBtn, outputMenu),
    })
    filterDropdowns.push(outputDD)
    const updateClearIcon = (input) => {
      const wrap = input?.closest('.go-dd-input-wrap')
      if (!wrap) return
      const hasValue = String(input.value || '').trim().length > 0
      wrap.classList.toggle('has-value', hasValue)
    }
    const syncOutputUnitsFromInputs = () => {
      const selected = Array.from(outputMenu.querySelectorAll('input[data-filter-input="output-unit"]:checked'))
        .map((input) => input.getAttribute('data-value'))
        .filter((unit) => nextOutputUnits.includes(unit))
      filterState.outputUnits = new Set(selected)
    }
    const outputDateMinInput = outputMenu.querySelector('input[data-filter-input="output-date-min"]')
    const outputDateMaxInput = outputMenu.querySelector('input[data-filter-input="output-date-max"]')
    const outputTimeMinInput = outputMenu.querySelector('input[data-filter-input="output-time-min"]')
    const outputTimeMaxInput = outputMenu.querySelector('input[data-filter-input="output-time-max"]')
    if (outputDateMinInput) {
      addFilterHandler(outputDateMinInput, 'input', () => {
        filterState.outputDateMin = outputDateMinInput.value || null
        updateClearIcon(outputDateMinInput)
        updateFilterIndicators()
        applyView()
      })
    }
    if (outputDateMaxInput) {
      addFilterHandler(outputDateMaxInput, 'input', () => {
        filterState.outputDateMax = outputDateMaxInput.value || null
        updateClearIcon(outputDateMaxInput)
        updateFilterIndicators()
        applyView()
      })
    }
    if (outputTimeMinInput) {
      addFilterHandler(outputTimeMinInput, 'input', () => {
        filterState.outputTimeMin = parseTimeInput(outputTimeMinInput.value)
        updateClearIcon(outputTimeMinInput)
        updateFilterIndicators()
        applyView()
      })
    }
    if (outputTimeMaxInput) {
      addFilterHandler(outputTimeMaxInput, 'input', () => {
        filterState.outputTimeMax = parseTimeInput(outputTimeMaxInput.value)
        updateClearIcon(outputTimeMaxInput)
        updateFilterIndicators()
        applyView()
      })
    }
    outputMenu.querySelectorAll('input[data-filter-input="output-unit"]').forEach((input) => {
      addFilterHandler(input, 'change', () => {
        syncOutputUnitsFromInputs()
        updateFilterIndicators()
        applyView()
      })
    })
    outputMenu.querySelectorAll('.go-dd-input').forEach((input) => updateClearIcon(input))
    addFilterHandler(outputMenu, 'click', (event) => {
      const btn = event.target.closest('.go-dd-delete')
      if (!btn) return
      const key = btn.getAttribute('data-clear')
      if (!key) return
      const input = outputMenu.querySelector(`input[data-filter-input="${key}"]`)
      if (!input) return
      input.value = ''
      updateClearIcon(input)
      if (key === 'output-date-min') filterState.outputDateMin = null
      if (key === 'output-date-max') filterState.outputDateMax = null
      if (key === 'output-time-min') filterState.outputTimeMin = null
      if (key === 'output-time-max') filterState.outputTimeMax = null
      updateFilterIndicators()
      applyView()
    })
  }
  const distanceFilterBtn = theadRow.querySelector('button[data-filter="distance"]')
  if (distanceFilterBtn) {
    const distanceMenu = document.createElement('div')
    distanceMenu.className = 'go-dd go-dd-filter'
    distanceMenu.hidden = true
    distanceMenu.innerHTML = `
      <div class="go-dd-title">
        Filtrar distancia
        <button class="go-dd-close" type="button" data-filter-action="close" data-title="Fechar">×</button>
      </div>
      <div class="go-dd-row">
        <label>Min</label>
        <div class="go-dd-input-wrap">
          <input class="go-dd-input" type="number" step="0.01" data-filter-input="distance-min">
          <img
            data-title="Limpar este filtro"
            alt="Borracha Limpar"
            src="https://dsbr.innogamescdn.com/asset/98f3b7c4/graphic/delete_14.png"
            class="float_right go-dd-delete"
            data-clear="distance-min"
          >
        </div>
      </div>
      <div class="go-dd-row">
        <label>Max</label>
        <div class="go-dd-input-wrap">
          <input class="go-dd-input" type="number" step="0.01" data-filter-input="distance-max">
          <img
            data-title="Limpar este filtro"
            alt="Borracha Limpar"
            src="https://dsbr.innogamescdn.com/asset/98f3b7c4/graphic/delete_14.png"
            class="float_right go-dd-delete"
            data-clear="distance-max"
          >
        </div>
      </div>
      <div class="go-dd-actions">
        <button type="button" data-filter-action="clear">Limpar todos</button>
      </div>
    `
    distanceFilterBtn.parentElement?.appendChild(distanceMenu)
    const distanceDD = createDropdown({
      btn: distanceFilterBtn,
      menu: distanceMenu,
      matchSelector: '[data-filter-action]',
      onSelect: (item) => {
        if (item.dataset.filterAction === 'close') {
          distanceDD?.close()
          return
        }
        distanceMenu.querySelectorAll('input').forEach((input) => { input.value = '' })
        filterState.distanceMin = null
        filterState.distanceMax = null
        distanceMenu.querySelectorAll('.go-dd-input').forEach((input) => updateClearIcon(input))
        updateFilterIndicators()
        applyView()
      },
      ...makeFloatingHandlers(distanceFilterBtn, distanceMenu),
    })
    filterDropdowns.push(distanceDD)
    const updateClearIcon = (input) => {
      const wrap = input?.closest('.go-dd-input-wrap')
      if (!wrap) return
      const hasValue = String(input.value || '').trim().length > 0
      wrap.classList.toggle('has-value', hasValue)
    }
    const minInput = distanceMenu.querySelector('input[data-filter-input="distance-min"]')
    const maxInput = distanceMenu.querySelector('input[data-filter-input="distance-max"]')
    if (minInput) {
      addFilterHandler(minInput, 'input', () => {
        filterState.distanceMin = parseNumber(minInput.value)
        updateClearIcon(minInput)
        updateFilterIndicators()
        applyView()
      })
    }
    if (maxInput) {
      addFilterHandler(maxInput, 'input', () => {
        filterState.distanceMax = parseNumber(maxInput.value)
        updateClearIcon(maxInput)
        updateFilterIndicators()
        applyView()
      })
    }
    distanceMenu.querySelectorAll('.go-dd-input').forEach((input) => updateClearIcon(input))
    addFilterHandler(distanceMenu, 'click', (event) => {
      const btn = event.target.closest('.go-dd-delete')
      if (!btn) return
      const key = btn.getAttribute('data-clear')
      if (!key) return
      const input = distanceMenu.querySelector(`input[data-filter-input="${key}"]`)
      if (input) input.value = ''
      if (input) updateClearIcon(input)
      if (key === 'distance-min') filterState.distanceMin = null
      if (key === 'distance-max') filterState.distanceMax = null
      updateFilterIndicators()
      applyView()
    })
  }
  theadRow.querySelectorAll('button[data-filter^="unit:"]').forEach((btn) => {
    const key = btn.getAttribute('data-filter')
    if (!key) return
    const unitName = key.split(':')[1]
    const menu = document.createElement('div')
    menu.className = 'go-dd go-dd-filter'
    menu.hidden = true
    const isPaladinUnit = unitName === 'paladin' || unitName === 'knight'
    if (isPaladinUnit) {
      menu.innerHTML = `
        <div class="go-dd-title">
          Filtrar ${String(dataUnits.get(unitName).name).toLowerCase()}
          <button class="go-dd-close" type="button" data-filter-action="close" data-title="Fechar">×</button>
        </div>
        <div class="go-dd-row">
          <label>
            <input type="checkbox" data-filter-input="unit:paladin:has">
            Contém
          </label>
        </div>
        <div class="go-dd-row">
          <label>
            <input type="checkbox" data-filter-input="unit:paladin:not">
            Não contém
          </label>
        </div>
        <div class="go-dd-actions">
          <button type="button" data-filter-action="clear">Limpar</button>
        </div>
      `
    } else {
      menu.innerHTML = `
        <div class="go-dd-title">
          Filtrar ${String(dataUnits.get(unitName).name).toLowerCase()}
          <button class="go-dd-close" type="button" data-filter-action="close" data-title="Fechar">×</button>
        </div>
        <div class="go-dd-row">
          <label>
            <input type="checkbox" data-filter-input="unit:${unitName}:has">
            Contém
          </label>
        </div>
        <div class="go-dd-row">
          <label>
            <input type="checkbox" data-filter-input="unit:${unitName}:not">
            Não contém
          </label>
        </div>
        <div class="go-dd-row">
          <label>Min</label>
          <div class="go-dd-input-wrap">
            <input class="go-dd-input" type="number" step="1" min="0" data-filter-input="unit:${unitName}:min">
            <img
              data-title="Limpar este filtro"
              alt="Borracha Limpar"
              src="https://dsbr.innogamescdn.com/asset/98f3b7c4/graphic/delete_14.png"
              class="float_right go-dd-delete"
              data-clear="unit:${unitName}:min"
            >
          </div>
        </div>
        <div class="go-dd-row">
          <label>Max</label>
          <div class="go-dd-input-wrap">
            <input class="go-dd-input" type="number" step="1" min="0" data-filter-input="unit:${unitName}:max">
            <img
              data-title="Limpar este filtro"
              alt="Borracha Limpar"
              src="https://dsbr.innogamescdn.com/asset/98f3b7c4/graphic/delete_14.png"
              class="float_right go-dd-delete"
              data-clear="unit:${unitName}:max"
            >
          </div>
        </div>
        <div class="go-dd-actions">
          <button type="button" data-filter-action="clear">Limpar tudo</button>
        </div>
      `
    }
    btn.parentElement?.appendChild(menu)
    const dd = createDropdown({
      btn,
      menu,
      matchSelector: '[data-filter-action]',
      onSelect: (item) => {
        if (item.dataset.filterAction === 'close') {
          dd?.close()
          return
        }
        if (isPaladinUnit) {
          const hasInput = menu.querySelector('input[data-filter-input="unit:paladin:has"]')
          const notInput = menu.querySelector('input[data-filter-input="unit:paladin:not"]')
          if (hasInput) hasInput.checked = false
          if (notInput) notInput.checked = false
          filterState.paladinMode = null
        } else {
          menu.querySelectorAll('input[data-filter-input^="unit:' + unitName + '"]').forEach((input) => {
            if (input.type === 'checkbox') input.checked = false
            else input.value = ''
          })
          filterState.units.delete(key)
        }
        updateFilterIndicators()
        applyView()
      },
      ...makeFloatingHandlers(btn, menu),
    })
    filterDropdowns.push(dd)
    if (isPaladinUnit) {
      const hasInput = menu.querySelector('input[data-filter-input="unit:paladin:has"]')
      const notInput = menu.querySelector('input[data-filter-input="unit:paladin:not"]')
      if (hasInput) {
        addFilterHandler(hasInput, 'change', () => {
          if (hasInput.checked) {
            if (notInput) notInput.checked = false
            filterState.paladinMode = 'has'
          } else if (!notInput?.checked) {
            filterState.paladinMode = null
          }
          updateFilterIndicators()
          applyView()
        })
      }
      if (notInput) {
        addFilterHandler(notInput, 'change', () => {
          if (notInput.checked) {
            if (hasInput) hasInput.checked = false
            filterState.paladinMode = 'not'
          } else if (!hasInput?.checked) {
            filterState.paladinMode = null
          }
          updateFilterIndicators()
          applyView()
        })
      }
    } else {
      const updateClearIcon = (input) => {
        const wrap = input?.closest('.go-dd-input-wrap')
        if (!wrap) return
        const hasValue = String(input.value || '').trim().length > 0
        wrap.classList.toggle('has-value', hasValue)
      }
      const hasInput = menu.querySelector(`input[data-filter-input="unit:${unitName}:has"]`)
      const notInput = menu.querySelector(`input[data-filter-input="unit:${unitName}:not"]`)
      const minInput = menu.querySelector(`input[data-filter-input="unit:${unitName}:min"]`)
      const maxInput = menu.querySelector(`input[data-filter-input="unit:${unitName}:max"]`)
      const setUnitFilter = (next) => {
        const isActive = next && (next.mode || next.min != null || next.max != null)
        if (!isActive) filterState.units.delete(key)
        else filterState.units.set(key, next)
      }
      const ensureUnitFilter = () => filterState.units.get(key) || { mode: null, min: null, max: null }
      const setMinMaxEnabled = (enabled) => {
        if (minInput) {
          minInput.disabled = !enabled
          if (!enabled) {
            minInput.value = ''
            updateClearIcon(minInput)
          }
        }
        if (maxInput) {
          maxInput.disabled = !enabled
          if (!enabled) {
            maxInput.value = ''
            updateClearIcon(maxInput)
          }
        }
      }
      if (hasInput) {
        addFilterHandler(hasInput, 'change', () => {
          const cfg = ensureUnitFilter()
          if (hasInput.checked) {
            if (notInput) notInput.checked = false
            cfg.mode = 'has'
            setMinMaxEnabled(true)
          } else if (!notInput?.checked) {
            cfg.mode = null
            setMinMaxEnabled(false)
          }
          setUnitFilter(cfg)
          updateFilterIndicators()
          applyView()
        })
      }
      if (notInput) {
        addFilterHandler(notInput, 'change', () => {
          const cfg = ensureUnitFilter()
          if (notInput.checked) {
            if (hasInput) hasInput.checked = false
            cfg.mode = 'not'
            setMinMaxEnabled(false)
          } else if (!hasInput?.checked) {
            cfg.mode = null
            setMinMaxEnabled(false)
          }
          setUnitFilter(cfg)
          updateFilterIndicators()
          applyView()
        })
      }
      if (minInput) {
        addFilterHandler(minInput, 'input', () => {
          const cfg = ensureUnitFilter()
          cfg.min = parseNumber(minInput.value)
          updateClearIcon(minInput)
          setUnitFilter(cfg)
          updateFilterIndicators()
          applyView()
        })
      }
      if (maxInput) {
        addFilterHandler(maxInput, 'input', () => {
          const cfg = ensureUnitFilter()
          cfg.max = parseNumber(maxInput.value)
          updateClearIcon(maxInput)
          setUnitFilter(cfg)
          updateFilterIndicators()
          applyView()
        })
      }
      menu.querySelectorAll('.go-dd-input').forEach((input) => updateClearIcon(input))
      setMinMaxEnabled(hasInput?.checked === true)
      addFilterHandler(menu, 'click', (event) => {
        const btn = event.target.closest('.go-dd-delete')
        if (!btn) return
        const clearKey = btn.getAttribute('data-clear')
        if (!clearKey) return
        const input = menu.querySelector(`input[data-filter-input="${clearKey}"]`)
        if (input) input.value = ''
        if (input) updateClearIcon(input)
        const cfg = ensureUnitFilter()
        if (clearKey.endsWith(':min')) cfg.min = null
        if (clearKey.endsWith(':max')) cfg.max = null
        setUnitFilter(cfg)
        updateFilterIndicators()
        applyView()
      })
    }
  })
  const syncFiltersFromInputs = () => {
    const textInput = document.querySelector('input[data-filter-input="village:name"]')
    filterState.villageName = String(textInput?.value || '').trim().toLowerCase()
    const pointsMinInput = document.querySelector('input[data-filter-input="village:points-min"]')
    const pointsMaxInput = document.querySelector('input[data-filter-input="village:points-max"]')
    const popMinInput = document.querySelector('input[data-filter-input="village:pop-min"]')
    filterState.pointsMin = parseNumber(pointsMinInput?.value)
    filterState.pointsMax = parseNumber(pointsMaxInput?.value)
    filterState.popMin = parseNumber(popMinInput?.value)
    const villageBonusSelected = Array.from(document.querySelectorAll('input[data-filter-input="village:bonus"]:checked'))
      .map((input) => input.getAttribute('data-value'))
      .filter((cls) => cls === BONUS_NONE_KEY || allVillageBonusClasses.includes(cls))
    filterState.bonusClasses = new Set(villageBonusSelected)
    const outputDateMinInput = document.querySelector('input[data-filter-input="output-date-min"]')
    const outputDateMaxInput = document.querySelector('input[data-filter-input="output-date-max"]')
    const outputTimeMinInput = document.querySelector('input[data-filter-input="output-time-min"]')
    const outputTimeMaxInput = document.querySelector('input[data-filter-input="output-time-max"]')
    filterState.outputDateMin = outputDateMinInput?.value || null
    filterState.outputDateMax = outputDateMaxInput?.value || null
    filterState.outputTimeMin = parseTimeInput(outputTimeMinInput?.value)
    filterState.outputTimeMax = parseTimeInput(outputTimeMaxInput?.value)
    const outputUnitsSelected = Array.from(document.querySelectorAll('input[data-filter-input="output-unit"]:checked'))
      .map((input) => input.getAttribute('data-value'))
      .filter((unit) => nextOutputUnits.includes(unit))
    filterState.outputUnits = new Set(outputUnitsSelected)
    const templateStatusBtns = Array.from(document.querySelectorAll('button[data-filter-input="village:template-status"].go-template-status-selected'))
    filterState.templateStatuses = new Set(
      templateStatusBtns
        .map((btn) => btn.getAttribute('data-value'))
        .filter((status) => TEMPLATE_STATUS_VALUES.includes(status))
    )
    const distanceMinInput = document.querySelector('input[data-filter-input="distance-min"]')
    const distanceMaxInput = document.querySelector('input[data-filter-input="distance-max"]')
    filterState.distanceMin = parseNumber(distanceMinInput?.value)
    filterState.distanceMax = parseNumber(distanceMaxInput?.value)
    filterState.units.clear()
    filterState.paladinMode = null
    const unitGroups = new Map()
    document.querySelectorAll('input[data-filter-input^="unit:"]').forEach((input) => {
      const raw = input.getAttribute('data-filter-input')
      if (!raw) return
      if (raw === 'unit:paladin:has' || raw === 'unit:paladin:not') return
      const parts = raw.split(':')
      const unitName = parts[1]
      const suffix = parts[2]
      if (!unitGroups.has(unitName)) unitGroups.set(unitName, {})
      const group = unitGroups.get(unitName)
      if (suffix === 'has' || suffix === 'not') {
        group[suffix] = input.checked
      } else if (suffix === 'min' || suffix === 'max') {
        group[suffix] = parseNumber(input.value)
      }
    })
    unitGroups.forEach((group, unitName) => {
      const key = `unit:${unitName}`
      const mode = group.has ? 'has' : group.not ? 'not' : null
      const min = group.min ?? null
      const max = group.max ?? null
      if (mode || min != null || max != null) {
        filterState.units.set(key, { mode, min, max })
      }
    })
    const paladinHas = document.querySelector('input[data-filter-input="unit:paladin:has"]')
    const paladinNot = document.querySelector('input[data-filter-input="unit:paladin:not"]')
    if (paladinHas?.checked) filterState.paladinMode = 'has'
    if (paladinNot?.checked) filterState.paladinMode = 'not'
    updateFilterIndicators()
    persistFilterState()
  }
  const applyFilterStateToInputs = () => {
    const textInput = document.querySelector('input[data-filter-input="village:name"]')
    if (textInput) textInput.value = filterState.villageName || ''
    const pointsMinInput = document.querySelector('input[data-filter-input="village:points-min"]')
    const pointsMaxInput = document.querySelector('input[data-filter-input="village:points-max"]')
    const popMinInput = document.querySelector('input[data-filter-input="village:pop-min"]')
    if (pointsMinInput) pointsMinInput.value = filterState.pointsMin ?? ''
    if (pointsMaxInput) pointsMaxInput.value = filterState.pointsMax ?? ''
    if (popMinInput) popMinInput.value = filterState.popMin ?? ''
    document.querySelectorAll('input[data-filter-input="village:bonus"]').forEach((input) => {
      input.checked = filterState.bonusClasses.has(input.getAttribute('data-value'))
    })
    const outputDateMinInput = document.querySelector('input[data-filter-input="output-date-min"]')
    const outputDateMaxInput = document.querySelector('input[data-filter-input="output-date-max"]')
    const outputTimeMinInput = document.querySelector('input[data-filter-input="output-time-min"]')
    const outputTimeMaxInput = document.querySelector('input[data-filter-input="output-time-max"]')
    if (outputDateMinInput) outputDateMinInput.value = filterState.outputDateMin || ''
    if (outputDateMaxInput) outputDateMaxInput.value = filterState.outputDateMax || ''
    if (outputTimeMinInput) outputTimeMinInput.value = formatTimeInput(filterState.outputTimeMin)
    if (outputTimeMaxInput) outputTimeMaxInput.value = formatTimeInput(filterState.outputTimeMax)
    document.querySelectorAll('input[data-filter-input="output-unit"]').forEach((input) => {
      input.checked = filterState.outputUnits.has(input.getAttribute('data-value'))
    })
    document.querySelectorAll('button[data-filter-input="village:template-status"]').forEach((btn) => {
      btn.classList.toggle('go-template-status-selected', filterState.templateStatuses.has(btn.getAttribute('data-value')))
    })
    const distanceMinInput = document.querySelector('input[data-filter-input="distance-min"]')
    const distanceMaxInput = document.querySelector('input[data-filter-input="distance-max"]')
    if (distanceMinInput) distanceMinInput.value = filterState.distanceMin ?? ''
    if (distanceMaxInput) distanceMaxInput.value = filterState.distanceMax ?? ''
    document.querySelectorAll('input[data-filter-input^="unit:"]').forEach((input) => {
      const raw = input.getAttribute('data-filter-input')
      if (!raw) return
      if (raw === 'unit:paladin:has' || raw === 'unit:paladin:not') return
      const parts = raw.split(':')
      const unitName = parts[1]
      const suffix = parts[2]
      const cfg = filterState.units.get(`unit:${unitName}`) || { mode: null, min: null, max: null }
      if (suffix === 'has') input.checked = cfg.mode === 'has'
      else if (suffix === 'not') input.checked = cfg.mode === 'not'
      else if (suffix === 'min') input.value = cfg.min ?? ''
      else if (suffix === 'max') input.value = cfg.max ?? ''
    })
    const paladinHas = document.querySelector('input[data-filter-input="unit:paladin:has"]')
    const paladinNot = document.querySelector('input[data-filter-input="unit:paladin:not"]')
    if (paladinHas) paladinHas.checked = filterState.paladinMode === 'has'
    if (paladinNot) paladinNot.checked = filterState.paladinMode === 'not'
  }
  const onClickVillageIndicator = (event) => {
    const key = villageIndicatorBtn?.getAttribute('data-sort-key')
    if (!key) return
    applySort(key)
    event.preventDefault()
    event.stopPropagation()
  }
  if (villageIndicatorBtn) {
    villageIndicatorBtn.addEventListener('click', onClickVillageIndicator)
  }
  const checkAll = document.querySelector('#go-checked-all')
  if (checkAll) {
    checkAll.onchange = () => {
      const selectableInputs = Array.from(tbody.querySelectorAll('input[name="sender"]'))
        .filter((input) => !input.disabled)
      const allSelectableSelected = selectableInputs.length > 0 && selectableInputs.every((input) => {
        const villageId = Number(input.dataset.id)
        return Number.isFinite(villageId) && selectedVillageIds.has(villageId)
      })
      const shouldCheck = !allSelectableSelected
      selectableInputs.forEach((input) => {
        setCheckboxSelection(input, shouldCheck)
      })
      updateSelectedCount()
    }
  }
  const dragState = { active: false, value: false }
  const onMouseDownTbody = (event) => {
    const checkbox = event.target?.closest?.('input[name="sender"]')
    if (!checkbox || event.button !== 0) return
    dragState.active = true
    dragState.value = !checkbox.checked
    setCheckboxSelection(checkbox, dragState.value)
    updateSelectedCount()
    event.preventDefault()
  }
  const onMouseOverTbody = (event) => {
    if (!dragState.active || (event.buttons & 1) === 0) return
    const checkbox = event.target?.closest?.('input[name="sender"]')
    if (!checkbox) return
    if (checkbox.checked === dragState.value) return
    setCheckboxSelection(checkbox, dragState.value)
    updateSelectedCount()
  }
  const onClickTbody = (event) => {
    const checkbox = event.target?.closest?.('input[name="sender"]')
    if (!checkbox) return
    event.preventDefault()
  }
  const onMouseUpDoc = () => {
    dragState.active = false
  }
  const onChangeTbody = (event) => {
    if (!event.target?.matches?.('input[name="sender"]')) return
    const checkbox = event.target
    setCheckboxSelection(checkbox, checkbox.checked)
    updateSelectedCount()
  }
  tbody.addEventListener('change', onChangeTbody)
  tbody.addEventListener('mousedown', onMouseDownTbody)
  tbody.addEventListener('mouseover', onMouseOverTbody)
  tbody.addEventListener('click', onClickTbody)
  document.addEventListener('mouseup', onMouseUpDoc)
  const unbind = () => {
    templateHint?.destroy?.()
    document.removeEventListener('go:template:stats:stable', onTemplateStatsForHint, true)
    theadRow.removeEventListener('click', onClicktheadRow)
    villageMenuDD?.destroy?.()
    filterDropdowns.forEach((dd) => dd?.destroy?.())
    filterHandlers.forEach((dispose) => dispose())
    villageIndicatorBtn?.removeEventListener('click', onClickVillageIndicator)
    tbody.removeEventListener('change', onChangeTbody)
    tbody.removeEventListener('mousedown', onMouseDownTbody)
    tbody.removeEventListener('mouseover', onMouseOverTbody)
    tbody.removeEventListener('click', onClickTbody)
    document.removeEventListener('mouseup', onMouseUpDoc)
  }
  loadFilterState()
  applyFilterStateToInputs()
  syncFiltersFromInputs()
  applySort('distance')
  setTimeout(() => {
    syncFiltersFromInputs()
    applyView()
    plannerSenders.dispatchEvent(new CustomEvent('go:planner:table:render:end', {
      bubbles: true,
      detail: {
        mode: dispatchMode,
        totalVisibleRows: currentTotalRows
      }
    }))
  }, 0)
  updateSelectedCount()
  const getSelectedVillageIds = () => Array.from(selectedVillageIds)
  const getSelectableVillageIds = () => Array.from(tbody.querySelectorAll('input[name="sender"]'))
    .filter((input) => !input.disabled)
    .map((input) => Number(input.dataset.id))
    .filter((villageId) => Number.isFinite(villageId))
  const getSelectionState = () => {
    const selectableVillageIds = getSelectableVillageIds()
    return {
      selectedSelectableCount: selectableVillageIds.reduce((acc, villageId) => {
        return acc + (selectedVillageIds.has(villageId) ? 1 : 0)
      }, 0),
      selectedVisibleCount: Array.from(tbody.querySelectorAll('input[name="sender"]')).reduce((acc, input) => {
        const villageId = Number(input.dataset.id)
        if (!Number.isFinite(villageId)) return acc
        return acc + (selectedVillageIds.has(villageId) ? 1 : 0)
      }, 0),
      selectedVillageIds: getSelectedVillageIds(),
      selectableVillageIds,
      totalSelectableRows: selectableVillageIds.length,
      totalVisibleRows: currentTotalRows,
      visibleVillageIds: currentVisibleRows.map((sender) => sender.villageId)
    }
  }

  const unbindWithApi = () => unbind()
  unbindWithApi.getSelectedVillageIds = getSelectedVillageIds
  unbindWithApi.getSelectableVillageIds = getSelectableVillageIds
  unbindWithApi.getSelectionState = getSelectionState

  return unbindWithApi;
}

export const plannerTableView = {
  ready: readyTableSenderFilterStorage,
  insert
}
