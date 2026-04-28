import { fallbackUnitValue } from "./fallbackUnitValue"
import { sumTemplateByUnitAllForSender } from "./sumTemplateByUnit"
import { computeSlowestUnit } from "../../../shared/slowestUnit"
import { dataUnits } from "../../.."
import { normalizeTemplateForCommand } from "../../../../send/utils"

export const rowHasUnit = ({
  row,
  unitName = 'knight',
  unitIndexByName
}) => {
  const unitIndex = unitIndexByName instanceof Map ? unitIndexByName.get(unitName) : -1
  if (!Number.isInteger(unitIndex) || unitIndex < 0) return false

  const rowValues = Array.isArray(row)
    ? row
    : Array.isArray(row?.row)
      ? row.row
      : Array.isArray(row?.value)
        ? row.value
        : []

  const value = Number(rowValues?.[unitIndex])
  return value > 0 || value === -1
}

function isUnitOnTime(timeMeta) {
  if (timeMeta && typeof timeMeta === 'object') {
    return Boolean(timeMeta.unitOnTime)
  }
  return Boolean(timeMeta)
}

function getUnitDurationSeconds(timeMeta) {
  if (!timeMeta || typeof timeMeta !== 'object') return null
  const seconds = Number(timeMeta.seconds)
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : null
}

function normalizeConflictTroopsMode(value) {
  const mode = String(value || '').trim().toLowerCase()
  if (mode === 'abort' || mode === 'strict' || mode === 'estrito') return 'abort'
  return 'redistribute'
}

export function calcDataSendersForTemplate({
  senderUnits,
  unitIndexByName,
  timeByUnit,
  senderTemplateContext,
  worldUnits = [],
  dispatchMode = 'schedule',
  conflictTroopsMode = 'redistribute'
}) {
  if (!senderTemplateContext) return null
  const {
    commandMode,
    tplUnits,
    tplType,
    tplRowsNormalized,
    tplValues,
    fakeMinPopBase,
    template,
    fakeLimitPercent,
    villagePoints,
    targetPlayerId,
    minSpyCommandConfig
  } = senderTemplateContext
  const normalizedConflictTroopsMode = normalizeConflictTroopsMode(conflictTroopsMode)
  const previewUnitsOrder = Array.isArray(worldUnits) && worldUnits.length
    ? worldUnits
    : tplUnits

  // 1) Cálculo sender x template:
  // resolve o valor efetivo de ALL(-1) por unidade para essa vila (senderUnits).
  const tplAll = sumTemplateByUnitAllForSender({
    tplUnits,
    tplValues,
    senderUnits,
    unitIndexByName,
  })
  // Mapa unit -> rowIndex que possui ALL(-1) no template normalizado.
  // O template valida 1 ALL por unidade; mesmo assim, mantemos essa trava
  // para garantir que somente a linha marcada receba o valor de ALL.
  const allRowIndexByUnit = new Map()
  tplRowsNormalized.forEach(({ row, rowIndex }) => {
    tplUnits?.forEach((unit, i) => {
      if (allRowIndexByUnit.has(unit)) return
      if (Number(row?.[i]) !== -1) return
      allRowIndexByUnit.set(unit, rowIndex)
    })
  })

  const absents = new Set()
  const overdue = new Set()
  const onTime = new Set()
  const unitsInTemplate = new Set()
  const villageNotLimit = new Map()
  const templateNotLimit = new Map()

  tplRowsNormalized.forEach(({ row, rowIndex }) => {
    // População total da linha no template (tplRowPop)
    // vs população efetiva disponível na vila para a linha (vlgRowPop).
    let tplRowPop = 0
    let vlgRowPop = 0

    const rowId = `#${rowIndex + 1}`
    tplUnits?.map((unit, i) => {
      const rowValue = row[i];
      if (rowValue === 0) return;
      unitsInTemplate.add(unit)
      const tplHasValue = tplType === 'value' || ['knight', 'snob'].includes(unit)
      const tplHasAll = rowValue < 0
      const pop = Number(dataUnits?.get?.(unit)?.pop) || 1
      // 2) Cálculo sender x template:
      // lê quantas tropas a vila realmente tem nessa unidade.
      const vlgValue = fallbackUnitValue({ unitName: unit, units: senderUnits, unitIndexByName, fallbackIndex: i })
      // 3) Cálculo sender x template:
      // marca ausente se template exige (>0 ou all) e vila não tem.
      if (vlgValue <= 0 && (tplHasAll || rowValue > 0)) absents.add(unit)
      // 4) Cálculo sender x template:
      // separa unidades no prazo (onTime) e fora do prazo (overdue) usando timeByUnit.
      if (!absents.has(unit)) {
        if (isUnitOnTime(timeByUnit?.get(unit))) onTime.add(unit)
        else overdue.add(unit)
      }
      // 5) Cálculo sender x template:
      // valor da linha no template: fixo da row ou ALL resolvido para essa vila (tplAll).
      const allRowIndex = allRowIndexByUnit.get(unit)
      const tplAllValue = Number(tplAll.get(unit) || 0)
      const tplValue = !tplHasAll
        ? rowValue
        : (allRowIndex === rowIndex ? tplAllValue : 0)
      // 6) Cálculo sender x template:
      // converte valor de template em população e limita pelo que a vila consegue enviar.
      const tplUnitPop = tplHasValue ? tplValue * pop : Math.floor((tplValue * vlgValue * pop) / 100)
      const vlgUnitPop = overdue.has(unit) ? 0 : tplHasValue ? Math.min(tplUnitPop, vlgValue * pop) : tplUnitPop
      tplRowPop += tplUnitPop
      vlgRowPop += vlgUnitPop
      return {
        unit,
        tplValue,
        tplUnitPop,
        vlgValue,
        vlgUnitPop,
      }
    }).filter(Boolean)

    const hasKnight = rowHasUnit({ row, unitName: 'knight', unitIndexByName })
    row.hasKnight = hasKnight
    // 7) Cálculo sender x template:
    // conflito de fake limit: compara pop da linha do template e pop efetiva da vila.
    // linha com paladino é exceção e não entra nesses conflitos.
    if (!hasKnight && fakeMinPopBase !== null && tplRowPop < fakeMinPopBase) {
      templateNotLimit.set(rowId, tplRowPop - fakeMinPopBase)
    }
    if (!hasKnight && fakeMinPopBase !== null && vlgRowPop < fakeMinPopBase) {
      villageNotLimit.set(rowId, vlgRowPop - fakeMinPopBase)
    }
  })

  const slowestTemplateUnits = getSlowestUnitNames(Array.from(unitsInTemplate), dataUnits)
  const slowestTemplateUnit = slowestTemplateUnits[0] || null
  const senderHasSlowestTemplateUnit = slowestTemplateUnits.some((unitName) => (
    fallbackUnitValue({
      unitName,
      units: senderUnits,
      unitIndexByName
    }) > 0
  ))
  const slowestTemplateDurationSeconds = slowestTemplateUnits.reduce((seconds, unitName) => {
    if (Number.isFinite(seconds) && seconds > 0) return seconds
    return getUnitDurationSeconds(timeByUnit?.get(unitName))
  }, null)

  let strictTroopsConflict = false
  let strictTroopsConflictMessage = ''
  if (dispatchMode === 'send' && normalizedConflictTroopsMode === 'abort' && template) {
    const sourceByUnit = new Map(
      previewUnitsOrder.map((unit, idx) => [unit, Number(senderUnits?.[idx]) || 0])
    )
    const previewNormalized = normalizeTemplateForCommand(template, previewUnitsOrder, {
      mode: 'send',
      commandType: commandMode === 'support' ? 'support' : 'attack',
      sourceVillageUnits: {
        units: Array.isArray(senderUnits) ? senderUnits : [],
        byUnit: sourceByUnit
      },
      fakeLimitPercent: Number.isFinite(Number(fakeLimitPercent)) ? Number(fakeLimitPercent) : undefined,
      villagePoints: Number.isFinite(Number(villagePoints)) ? Number(villagePoints) : undefined,
      targetPlayerId: Number.isFinite(Number(targetPlayerId)) ? Number(targetPlayerId) : undefined,
      minSpyCommand: minSpyCommandConfig && typeof minSpyCommandConfig === 'object'
        ? minSpyCommandConfig
        : undefined,
      conflictTroops: 'abort'
    })
    strictTroopsConflict = Boolean(previewNormalized?.meta?.conflicts?.troops)
    strictTroopsConflictMessage = Array.isArray(previewNormalized?.meta?.resolutions)
      ? previewNormalized.meta.resolutions
        .map((entry) => String(entry?.message || '').trim())
        .filter(Boolean)
        .join(' | ')
      : ''
  }

  return {
    absents,
    overdue,
    onTime,
    villageNotLimit,
    templateNotLimit,
    commandMode,
    conflictTroopsMode: normalizedConflictTroopsMode,
    strictTroopsConflict,
    strictTroopsConflictMessage,
    unitsInTemplate,
    slowestTemplateUnits,
    slowestTemplateUnit,
    senderHasSlowestTemplateUnit,
    slowestTemplateDurationSeconds
  }
}

export function getSlowestUnitNames(unitNames = [], unitData = dataUnits) {
  const selected = Array.isArray(unitNames)
    ? unitNames.filter(Boolean)
    : []
  const { slowestSpeed } = computeSlowestUnit(selected, unitData)
  if (!Number.isFinite(slowestSpeed)) return []
  return selected.filter((unit) => Number(unitData?.get?.(unit)?.speed) === slowestSpeed)
}

export function getSlowestUnitName(unitNames = [], unitData = dataUnits) {
  return getSlowestUnitNames(unitNames, unitData)[0] || null
}
