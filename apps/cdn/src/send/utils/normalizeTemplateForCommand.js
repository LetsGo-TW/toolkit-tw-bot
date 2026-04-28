import { distributeFakeLimitByAvailability } from "../../shared/fakeLimit/index.js";
import { buildUnitIndexByName } from "../../unit/buildUnitIndexByName.js";
import { calcTemplateRowsForSender } from "./calcTemplateRowsForSender.js";

const UNIT_POP_FALLBACK = new Map([
  ['spear', 1],
  ['sword', 1],
  ['axe', 1],
  ['archer', 1],
  ['spy', 2],
  ['light', 4],
  ['marcher', 5],
  ['heavy', 6],
  ['ram', 5],
  ['catapult', 8],
  ['knight', 10],
  ['snob', 100]
])

const UNIT_SPEED_FALLBACK = new Map([
  ['spear', 18],
  ['sword', 22],
  ['axe', 18],
  ['archer', 18],
  ['spy', 9],
  ['light', 10],
  ['marcher', 10],
  ['heavy', 11],
  ['ram', 30],
  ['catapult', 30],
  ['knight', 10],
  ['snob', 35]
])

const PERCENT_LOCKED_UNITS = new Set(['knight', 'snob'])

function normalizeTemplateType(value) {
  return String(value || '').trim().toLowerCase() === 'percent' ? 'percent' : 'value'
}

function normalizeBuildTarget(value) {
  const normalized = String(value || '').trim().replace(/^building:/, '')
  return normalized || null
}

function getSourceVillageUnitAvailable({
  unit,
  fallbackIndex = -1,
  sourceVillageByUnit = new Map(),
  sourceVillageUnits = []
} = {}) {
  const fromMap = Number(
    sourceVillageByUnit instanceof Map
      ? sourceVillageByUnit.get(unit)
      : sourceVillageByUnit?.[unit]
  )
  if (Number.isFinite(fromMap)) return Math.max(0, Math.floor(fromMap))
  const fromArray = Number(sourceVillageUnits?.[fallbackIndex])
  if (Number.isFinite(fromArray)) return Math.max(0, Math.floor(fromArray))
  return 0
}

function toPercentAsAbsolute(rawValue, available) {
  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed)) return 0
  const normalizedPercent = parsed === -1 ? 100 : parsed
  const boundedPercent = Math.max(0, Math.min(100, normalizedPercent))
  return Math.floor((Math.max(0, Number(available) || 0) * boundedPercent) / 100)
}

function normalizeTemplateRowsPercentMode({
  rawValues = [],
  tplIndexByUnit = new Map(),
  worldUnits = [],
  sourceVillageByUnit = new Map(),
  sourceVillageUnits = []
} = {}) {
  return (Array.isArray(rawValues) ? rawValues : [])
    .filter((row) => Array.isArray(row))
    .map((row) => worldUnits.map((unit, unitIndex) => {
      const idx = tplIndexByUnit.get(unit)
      const raw = Number(idx == null ? 0 : row[idx])
      if (!Number.isFinite(raw)) return 0
      if (PERCENT_LOCKED_UNITS.has(unit)) return raw
      const available = getSourceVillageUnitAvailable({
        unit,
        fallbackIndex: unitIndex,
        sourceVillageByUnit,
        sourceVillageUnits
      })
      return toPercentAsAbsolute(raw, available)
    }))
    .filter((normalizedRow) => normalizedRow.some((value) => value !== 0))
}

// Detecta conflito de tropas comparando pedido bruto vs distribuído.
// Conflito = algum valor positivo pedido ficou menor no distribuído.
// Retorno: boolean
function hasTroopsConflict(rawValues = [], distributedValues = []) {
  const raw = Array.isArray(rawValues) ? rawValues : []
  const dist = Array.isArray(distributedValues) ? distributedValues : []
  return raw.some((row, rowIndex) => {
    if (!Array.isArray(row)) return false
    return row.some((value, unitIndex) => {
      const requested = Number(value)
      if (!Number.isFinite(requested) || requested <= 0) return false
      const assigned = Number(dist?.[rowIndex]?.[unitIndex] || 0)
      return assigned < requested
    })
  })
}

// Remove linhas sem tropas (tudo <= 0) após distribuição.
// Retorno: Array<row>
function keepOnlyRowsWithUnits(values = []) {
  return (Array.isArray(values) ? values : []).filter((row) =>
    Array.isArray(row) && row.some((value) => Number(value) > 0)
  )
}

function getUnitMeta(unitName, unitMetaByName = null) {
  if (!unitName) return null
  if (unitMetaByName instanceof Map) return unitMetaByName.get(unitName) || null
  if (unitMetaByName && typeof unitMetaByName === 'object') return unitMetaByName[unitName] || null
  return null
}

function toUnitPop(unitName, unitMetaByName = null) {
  const pop = Number(getUnitMeta(unitName, unitMetaByName)?.pop ?? UNIT_POP_FALLBACK.get(unitName))
  return Number.isFinite(pop) && pop > 0 ? pop : 1
}

function toUnitSpeed(unitName, unitMetaByName = null) {
  const speed = Number(getUnitMeta(unitName, unitMetaByName)?.speed ?? UNIT_SPEED_FALLBACK.get(unitName))
  return Number.isFinite(speed) ? speed : null
}

function toUnitSlowMetric(unitName, unitMetaByName = null) {
  const speed = toUnitSpeed(unitName, unitMetaByName)
  if (speed == null) return null
  // Compatibiliza 2 formatos:
  // - fallback local usa "min por campo" (maior = mais lento)
  // - unit_data do jogo pode vir como "campo/seg" (menor = mais lento)
  // Resultado: métrica única onde maior sempre significa "mais lento".
  if (speed > 1) return speed
  if (speed > 0) return 1 / speed
  return null
}

function getRowPopulation(row = [], units = [], unitMetaByName = null) {
  if (!Array.isArray(row) || !Array.isArray(units)) return 0
  return row.reduce((acc, value, idx) => {
    const qty = Number(value)
    if (!Number.isFinite(qty) || qty <= 0) return acc
    const unit = units[idx]
    return acc + (qty * toUnitPop(unit, unitMetaByName))
  }, 0)
}

function hasKnightInRow(row = [], units = []) {
  if (!Array.isArray(row) || !Array.isArray(units)) return false
  const idx = units.indexOf('knight')
  if (idx < 0) return false
  const value = Number(row[idx])
  return Number.isFinite(value) && value > 0
}

function getSlowestTemplateUnit(values = [], units = [], unitMetaByName = null) {
  const selected = new Set()
  ;(Array.isArray(values) ? values : []).forEach((row) => {
    if (!Array.isArray(row)) return
    row.forEach((raw, idx) => {
      const value = Number(raw)
      if (!Number.isFinite(value) || value === 0) return
      const unit = units[idx]
      if (unit) selected.add(unit)
    })
  })
  let slowestUnit = null
  let slowestSpeed = -Infinity
  selected.forEach((unit) => {
    const speed = toUnitSlowMetric(unit, unitMetaByName)
    if (!Number.isFinite(speed)) return
    if (speed > slowestSpeed) {
      slowestSpeed = speed
      slowestUnit = unit
    }
  })
  return slowestUnit
}

function normalizeTroopsConflictOption(value) {
  const mode = String(value || '').trim().toLowerCase()
  if (mode === 'abort' || mode === 'strict' || mode === 'estrito') return 'abort'
  return 'redistribute'
}

function isSpyOnlyTemplateValues(values = [], units = []) {
  if (!Array.isArray(values) || !values.length) return false
  if (!Array.isArray(units) || !units.length) return false
  let hasSpy = false
  for (let rowIdx = 0; rowIdx < values.length; rowIdx += 1) {
    const row = Array.isArray(values[rowIdx]) ? values[rowIdx] : []
    for (let unitIdx = 0; unitIdx < units.length; unitIdx += 1) {
      const qty = Number(row[unitIdx])
      if (!Number.isFinite(qty) || qty === 0) continue
      const unit = units[unitIdx]
      if (unit !== 'spy') return false
      hasSpy = true
    }
  }
  return hasSpy
}

function resolveSpyOnlyMinPopBase({
  minSpyCommand = null,
  targetPlayerId = null,
  unitMetaByName = null
} = {}) {
  if (!minSpyCommand || typeof minSpyCommand !== 'object') return null
  const playersMin = Number(minSpyCommand?.players)
  const barbariansMin = Number(minSpyCommand?.barbarians)
  const playerIdNum = Number(targetPlayerId)
  const isBarbarian = Number.isFinite(playerIdNum) ? playerIdNum <= 0 : false
  const minSpy = isBarbarian ? barbariansMin : playersMin
  if (!Number.isFinite(minSpy) || minSpy <= 0) return null
  const spyPop = toUnitPop('spy', unitMetaByName)
  const minPop = Math.floor(minSpy * spyPop)
  return Number.isFinite(minPop) && minPop > 0 ? minPop : null
}

function enforceSlowestUnitPerAttack(values = [], units = [], slowestUnit = null, sourceVillageByUnit = new Map()) {
  if (!Array.isArray(values) || !values.length) return { values, changed: false, removedRows: 0 }
  if (!slowestUnit) return { values, changed: false, removedRows: 0 }
  const slowestIndex = units.indexOf(slowestUnit)
  if (slowestIndex < 0) return { values, changed: false, removedRows: 0 }

  const availableSlowest = Math.max(
    0,
    Math.floor(
      Number(
        sourceVillageByUnit instanceof Map
          ? sourceVillageByUnit.get(slowestUnit)
          : sourceVillageByUnit?.[slowestUnit]
      ) || 0
    )
  )
  if (availableSlowest <= 0) return { values: [], changed: values.length > 0, removedRows: values.length }

  const rows = values.map((row) => Array.isArray(row) ? row.map((v) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
  }) : [])
  const activeRows = rows.map((row, idx) => ({ idx, row }))

  const keepCount = Math.min(activeRows.length, availableSlowest)
  const keepIdxSet = new Set(activeRows.slice(0, keepCount).map(({ idx }) => idx))
  const rowQty = rows.map((row) => Number(row?.[slowestIndex]) || 0)
  let changed = false

  for (const { idx } of activeRows) {
    if (keepIdxSet.has(idx)) continue
    if (rowQty[idx] > 0) {
      rowQty[idx] = 0
      rows[idx][slowestIndex] = 0
      changed = true
    }
  }

  const donors = activeRows
    .map(({ idx }) => idx)
    .filter((idx) => keepIdxSet.has(idx))
    .sort((a, b) => rowQty[b] - rowQty[a])

  keepIdxSet.forEach((idx) => {
    if (rowQty[idx] > 0) return
    const donorIdx = donors.find((d) => rowQty[d] > 1)
    if (donorIdx == null) return
    rowQty[donorIdx] -= 1
    rows[donorIdx][slowestIndex] = rowQty[donorIdx]
    rowQty[idx] += 1
    rows[idx][slowestIndex] = rowQty[idx]
    changed = true
  })

  let usedAfterMoves = rowQty.reduce((acc, value) => acc + Math.max(0, value), 0)
  if (usedAfterMoves > availableSlowest) {
    const reducible = donors.filter((idx) => rowQty[idx] > 1)
    for (const idx of reducible) {
      if (usedAfterMoves <= availableSlowest) break
      const extra = Math.max(0, rowQty[idx] - 1)
      if (extra <= 0) continue
      const reduceBy = Math.min(extra, usedAfterMoves - availableSlowest)
      rowQty[idx] -= reduceBy
      rows[idx][slowestIndex] = rowQty[idx]
      usedAfterMoves -= reduceBy
      changed = true
    }
  }

  let remainingFromVillage = Math.max(0, availableSlowest - usedAfterMoves)
  activeRows.forEach(({ idx }) => {
    if (!keepIdxSet.has(idx)) return
    if (rowQty[idx] > 0 || remainingFromVillage <= 0) return
    rowQty[idx] = 1
    rows[idx][slowestIndex] = 1
    remainingFromVillage -= 1
    changed = true
  })

  const filtered = rows.filter((row, idx) => {
    if (!keepIdxSet.has(idx)) return false
    return (Number(row?.[slowestIndex]) || 0) > 0
  })

  return {
    values: filtered,
    changed,
    removedRows: Math.max(0, values.length - filtered.length)
  }
}

function enforceFakeLimitOnAttackRows(values = [], units = [], fakeMinPopBase = null, sourceVillageByUnit = new Map(), unitMetaByName = null, options = {}) {
  const minPop = Number(fakeMinPopBase)
  if (!Number.isFinite(minPop) || minPop <= 0) {
    return { values, changed: false, removedRows: 0, unresolvedRows: 0 }
  }
  if (!Array.isArray(values) || !values.length) {
    return { values, changed: false, removedRows: 0, unresolvedRows: 0 }
  }

  const modelUnitsRaw = options?.modelUnits
  const templateRowsModel = Array.isArray(options?.templateRowsModel) ? options.templateRowsModel : []
  const snobEscortMinPop = Math.max(0, Number(options?.snobEscortMinPop) || 20)
  const slowestUnitRaw = options?.slowestUnit
  const slowestUnit = String(slowestUnitRaw || '').trim() || null
  const slowestSpeed = slowestUnit ? toUnitSlowMetric(slowestUnit, unitMetaByName) : null
  const rows = values.map((row) => Array.isArray(row) ? row.map((v) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
  }) : [])
  const totalRowsBefore = rows.length
  const unitIndexByName = new Map(units.map((unit, index) => [unit, index]))

  let changed = false

  const modelUnitSet = modelUnitsRaw instanceof Set
    ? new Set(Array.from(modelUnitsRaw).map((unit) => String(unit || '').trim()).filter(Boolean))
    : new Set(
      units.filter((unit, unitIdx) => rows.some((row) => (Number(row?.[unitIdx]) || 0) > 0))
    )
  const snobIndex = units.indexOf('snob')

  const getAvailableByUnit = (unit) => {
    const available = Number(
      sourceVillageByUnit instanceof Map
        ? sourceVillageByUnit.get(unit)
        : sourceVillageByUnit?.[unit]
    ) || 0
    return Math.max(0, Math.floor(available))
  }

  const isDistributionLockedUnit = (unit) => unit === 'knight' || unit === 'snob'
  const isUnitAllowedBySlowest = (unit) => {
    if (!slowestUnit || slowestSpeed == null) return true
    const speed = toUnitSlowMetric(unit, unitMetaByName)
    if (speed == null) return true
    // No pool só pode entrar unidade não mais lenta que a mais lenta do modelo.
    // Como a métrica de lentidão cresce com a lentidão, usamos <=.
    return speed <= slowestSpeed
  }
  const hasSnobInRow = (row = []) => {
    if (snobIndex < 0) return false
    return (Number(row?.[snobIndex]) || 0) > 0
  }
  const hasAnyUnitsInRow = (row = []) =>
    Array.isArray(row) && row.some((value) => (Number(value) || 0) > 0)
  const getRowSnobPop = (row = []) => {
    if (snobIndex < 0) return 0
    const qty = Number(row?.[snobIndex]) || 0
    if (qty <= 0) return 0
    return qty * toUnitPop('snob', unitMetaByName)
  }
  const getRowTargetPop = (row = []) => {
    if (!hasSnobInRow(row)) return minPop
    return Math.max(minPop, getRowSnobPop(row) + snobEscortMinPop)
  }
  const getRowLimitPopulation = (row = []) => getRowPopulation(row, units, unitMetaByName)
  const getModelCellValue = (rowIdx, unitIdx) => Number(templateRowsModel?.[rowIdx]?.[unitIdx])
  const rowHasAnyAll = (rowIdx) => {
    const modelRow = templateRowsModel?.[rowIdx]
    if (!Array.isArray(modelRow)) return false
    return modelRow.some((value) => Number(value) === -1)
  }
  const getDeficitRows = () => rows
    .map((row, idx) => ({
      idx,
      pop: getRowLimitPopulation(row),
      hasKnight: hasKnightInRow(row, units),
      hasSnob: hasSnobInRow(row),
      target: getRowTargetPop(row)
    }))
    .filter((item) => !item.hasKnight && (item.pop > 0 || item.hasSnob) && item.pop < item.target)

  // Sem conflito de limite, não redistribui fake-limit:
  // mantém as linhas do modelo após o corte por tropa mais lenta.
  const initialDeficitRows = getDeficitRows()
  if (!initialDeficitRows.length) {
    return {
      values: rows.filter((row) => getRowLimitPopulation(row) > 0),
      changed: false,
      removedRows: 0,
      unresolvedRows: 0
    }
  }

  // Limita linhas possíveis por unidade mais lenta e por população total disponível.
  const capRowsByAvailability = () => {
    const currentRows = rows
      .map((row, idx) => ({
        idx,
        pop: getRowLimitPopulation(row),
        hasKnight: hasKnightInRow(row, units),
        hasSnob: hasSnobInRow(row)
      }))
      .filter((item) => (item.pop > 0 || item.hasSnob) && !item.hasKnight)
    if (!currentRows.length) return

    const totalAvailablePop = units.reduce((acc, unit) => {
      if (unit === 'knight') return acc
      if (!isUnitAllowedBySlowest(unit)) return acc
      return acc + (getAvailableByUnit(unit) * toUnitPop(unit, unitMetaByName))
    }, 0)
    const maxRowsByPop = Math.max(0, Math.floor(totalAvailablePop / minPop))
    const maxRowsBySlowest = slowestUnit ? getAvailableByUnit(slowestUnit) : currentRows.length
    const attacksPossible = Math.max(0, Math.min(currentRows.length, maxRowsBySlowest, maxRowsByPop))

    if (attacksPossible >= currentRows.length) return
    const keepRows = new Set(currentRows.slice(0, attacksPossible).map((item) => item.idx))
    currentRows.forEach(({ idx }) => {
      if (keepRows.has(idx)) return
      rows[idx] = rows[idx].map(() => 0)
      changed = true
    })
  }

  capRowsByAvailability()

  const allocatedByUnit = new Map(units.map((unit, idx) => {
    const sum = rows.reduce((acc, row) => acc + (Number(row?.[idx]) || 0), 0)
    return [unit, sum]
  }))
  const remainingByUnit = new Map(units.map((unit) => {
    const available = getAvailableByUnit(unit)
    const allocated = Number(allocatedByUnit.get(unit) || 0)
    return [unit, Math.max(0, available - allocated)]
  }))

  const modelPoolUnits = units.filter((unit) =>
    modelUnitSet.has(unit) &&
    !isDistributionLockedUnit(unit) &&
    isUnitAllowedBySlowest(unit)
  )
  const outsideModelPoolUnits = units.filter((unit) =>
    !modelUnitSet.has(unit) &&
    !isDistributionLockedUnit(unit) &&
    isUnitAllowedBySlowest(unit)
  )

  const fillRowFromPool = (rowIdx, poolUnits = []) => {
    if (!poolUnits.length) return false
    let moved = false
    const preferredUnits = poolUnits.filter((unit, unitIdx) => {
      const mappedIdx = unitIndexByName.get(unit)
      if (mappedIdx == null || mappedIdx < 0) return false
      return getModelCellValue(rowIdx, mappedIdx) > 0
    })
    const fallbackUnits = poolUnits.filter((unit) => !preferredUnits.includes(unit))
    const prioritizedPools = [preferredUnits, fallbackUnits].filter((list) => list.length > 0)

    for (const scopedPoolUnits of prioritizedPools) {
      const maxIter = Math.max(1, scopedPoolUnits.length * 4)
      for (let iter = 0; iter < maxIter; iter += 1) {
        const row = rows[rowIdx]
        const rowTarget = getRowTargetPop(row)
        const currentPop = getRowLimitPopulation(row)
        const missingPop = rowTarget - currentPop
        if (missingPop <= 0) break

        const pool = scopedPoolUnits.reduce((acc, unit) => {
          const remaining = Number(remainingByUnit.get(unit) || 0)
          const pop = toUnitPop(unit, unitMetaByName)
          if (remaining <= 0 || pop <= 0) return acc
          acc.push({ unit, count: remaining, pop })
          return acc
        }, [])
        if (!pool.length) break

        const distribution = distributeFakeLimitByAvailability(missingPop, pool)
        let movedInIter = false
        Object.entries(distribution).forEach(([unit, qtyRaw]) => {
          const qty = Number(qtyRaw)
          if (!Number.isFinite(qty) || qty <= 0) return
          const unitIdx = unitIndexByName.get(unit)
          if (unitIdx == null || unitIdx < 0) return
          const remaining = Number(remainingByUnit.get(unit) || 0)
          const applied = Math.min(Math.floor(qty), remaining)
          if (applied <= 0) return
          rows[rowIdx][unitIdx] += applied
          remainingByUnit.set(unit, remaining - applied)
          moved = true
          movedInIter = true
        })
        if (!movedInIter) break
      }
    }
    return moved
  }

  const topUpDeficitRowsFromPool = (poolUnits = []) => {
    if (!poolUnits.length) return false
    let touched = false
    const rowIndexes = rows.map((_, idx) => idx)
      .sort((a, b) => {
        const aAll = rowHasAnyAll(a) ? 1 : 0
        const bAll = rowHasAnyAll(b) ? 1 : 0
        return aAll - bAll
      })
    rowIndexes.forEach((rowIdx) => {
      const row = rows[rowIdx]
      if (hasKnightInRow(row, units)) return
      if (!hasAnyUnitsInRow(row)) return
      const currentPop = getRowLimitPopulation(row)
      const rowTarget = getRowTargetPop(row)
      if (currentPop >= rowTarget) return
      if (fillRowFromPool(rowIdx, poolUnits)) touched = true
    })
    return touched
  }

  const rebalanceRowsBySurplus = (poolUnits = []) => {
    if (!poolUnits.length) return false
    const allowedUnits = new Set(poolUnits)
    const slowestIndex = slowestUnit ? units.indexOf(slowestUnit) : -1
    let touched = false
    const maxPass = Math.max(1, rows.length * 3)
    for (let pass = 0; pass < maxPass; pass += 1) {
      let movedInPass = false
      const populations = rows.map((row) => getRowLimitPopulation(row))
      const deficitRows = rows
        .map((row, idx) => ({
          idx,
          pop: populations[idx],
          hasKnight: hasKnightInRow(row, units),
          hasSnob: hasSnobInRow(row),
          target: getRowTargetPop(row)
        }))
        .filter((item) => !item.hasKnight && (item.pop > 0 || item.hasSnob) && item.pop < item.target)
      if (!deficitRows.length) break

      for (const deficitItem of deficitRows) {
        let deficit = deficitItem.target - deficitItem.pop
        if (deficit <= 0) continue
        const donors = rows
          .map((row, idx) => ({
            idx,
            pop: populations[idx],
            hasKnight: hasKnightInRow(row, units),
            target: getRowTargetPop(row),
            surplus: populations[idx] - getRowTargetPop(row)
          }))
          .filter((item) =>
            item.idx !== deficitItem.idx &&
            !item.hasKnight &&
            item.pop > item.target &&
            item.surplus > 0
          )
          .sort((a, b) => b.surplus - a.surplus)

        for (const donor of donors) {
          if (deficit <= 0) break
          let donorSurplus = Math.max(0, getRowLimitPopulation(rows[donor.idx]) - donor.target)
          if (donorSurplus <= 0) continue

          const transferableUnits = rows[donor.idx]
            .map((qtyRaw, unitIdx) => {
              const qty = Number(qtyRaw) || 0
              const unit = units[unitIdx]
              if (qty <= 0 || !allowedUnits.has(unit)) return null
              if (isDistributionLockedUnit(unit)) return null
              let availableQty = qty
              if (slowestIndex >= 0 && unitIdx === slowestIndex) {
                availableQty = Math.max(0, qty - 1)
              }
              if (availableQty <= 0) return null
              const pop = toUnitPop(unit, unitMetaByName)
              if (pop <= 0) return null
              return { unitIdx, pop, qty: availableQty }
            })
            .filter(Boolean)
            .sort((a, b) => b.pop - a.pop)

          for (const unit of transferableUnits) {
            if (deficit <= 0 || donorSurplus <= 0) break
            const maxBySurplus = Math.floor(donorSurplus / unit.pop)
            if (maxBySurplus <= 0) continue
            const neededQty = Math.ceil(deficit / unit.pop)
            const moveQty = Math.min(unit.qty, maxBySurplus, neededQty)
            if (moveQty <= 0) continue
            rows[donor.idx][unit.unitIdx] -= moveQty
            rows[deficitItem.idx][unit.unitIdx] += moveQty
            const movedPop = moveQty * unit.pop
            deficit -= movedPop
            donorSurplus -= movedPop
            movedInPass = true
            touched = true
          }
        }
      }

      if (!movedInPass) break
    }
    return touched
  }

  const rebalanceSupportRowsByFallbackProportion = () => {
    const activeRows = rows
      .map((row, idx) => ({
        idx,
        row,
        hasKnight: hasKnightInRow(row, units),
        hasSnob: hasSnobInRow(row)
      }))
      .filter((item) => !item.hasKnight && item.hasSnob)
    if (!activeRows.length) return false

    const allRow = activeRows.find((item) => rowHasAnyAll(item.idx))
    if (!allRow) return false
    const supportRows = activeRows.filter((item) => item.idx !== allRow.idx)
    if (!supportRows.length) return false

    // Só aplica quando as linhas de suporte já caíram em fallback (usando unidade fora do modelo).
    const hasFallbackInSupport = supportRows.some(({ idx, row }) =>
      row.some((qtyRaw, unitIdx) => {
        const qty = Number(qtyRaw) || 0
        if (qty <= 0) return false
        const unit = units[unitIdx]
        if (isDistributionLockedUnit(unit)) return false
        return getModelCellValue(idx, unitIdx) <= 0
      })
    )
    if (!hasFallbackInSupport) return false

    const eligibleUnitIdx = units
      .map((unit, unitIdx) => ({ unit, unitIdx }))
      .filter(({ unit, unitIdx }) => {
        if (isDistributionLockedUnit(unit)) return false
        if (!isUnitAllowedBySlowest(unit)) return false
        return supportRows.some(({ row }) => (Number(row?.[unitIdx]) || 0) > 0)
      })
      .map(({ unitIdx }) => unitIdx)
    if (eligibleUnitIdx.length < 2) return false

    const pool = new Map(
      eligibleUnitIdx.map((unitIdx) => ([
        units[unitIdx],
        activeRows.reduce((acc, item) => acc + (Number(item.row?.[unitIdx]) || 0), 0)
      ]))
    )

    const optimizeDistribution = (distribution = {}, neededPop = 0, unitPool = new Map()) => {
      const next = new Map(eligibleUnitIdx.map((unitIdx) => {
        const unit = units[unitIdx]
        const capped = Math.max(
          0,
          Math.min(
            Math.floor(Number(distribution?.[unit]) || 0),
            Math.floor(Number(unitPool.get(unit)) || 0)
          )
        )
        return [unit, capped]
      }))
      const calcPop = () =>
        eligibleUnitIdx.reduce((acc, unitIdx) => {
          const unit = units[unitIdx]
          return acc + ((Number(next.get(unit)) || 0) * toUnitPop(unit, unitMetaByName))
        }, 0)
      let popNow = calcPop()
      const removable = eligibleUnitIdx
        .map((unitIdx) => ({ unit: units[unitIdx], pop: toUnitPop(units[unitIdx], unitMetaByName) }))
        .filter((item) => item.pop > 0)
        .sort((a, b) => a.pop - b.pop)
      while (popNow > neededPop) {
        const candidate = removable.find(({ unit, pop }) =>
          (next.get(unit) || 0) > 0 && (popNow - pop) >= neededPop
        )
        if (!candidate) break
        next.set(candidate.unit, (next.get(candidate.unit) || 0) - 1)
        popNow -= candidate.pop
      }
      return next
    }

    let changedLocal = false
    supportRows.forEach(({ idx }) => {
      const row = rows[idx]
      const rowTarget = getRowTargetPop(row)
      const rowSnobPop = getRowSnobPop(row)
      const neededPop = Math.max(0, rowTarget - rowSnobPop)
      if (neededPop <= 0) return
      const poolArray = eligibleUnitIdx
        .map((unitIdx) => ({
          unit: units[unitIdx],
          count: Number(pool.get(units[unitIdx]) || 0),
          pop: toUnitPop(units[unitIdx], unitMetaByName)
        }))
        .filter((item) => item.count > 0 && item.pop > 0)
      if (!poolArray.length) return
      const distributionRaw = distributeFakeLimitByAvailability(neededPop, poolArray)
      const next = optimizeDistribution(distributionRaw, neededPop, pool)
      eligibleUnitIdx.forEach((unitIdx) => {
        const unit = units[unitIdx]
        const nextQty = Number(next.get(unit) || 0)
        if ((Number(row?.[unitIdx]) || 0) !== nextQty) changedLocal = true
        row[unitIdx] = nextQty
        pool.set(unit, Math.max(0, Number(pool.get(unit) || 0) - nextQty))
      })
    })

    const rowAll = rows[allRow.idx]
    eligibleUnitIdx.forEach((unitIdx) => {
      const unit = units[unitIdx]
      const remainingQty = Math.max(0, Math.floor(Number(pool.get(unit) || 0)))
      if ((Number(rowAll?.[unitIdx]) || 0) !== remainingQty) changedLocal = true
      rowAll[unitIdx] = remainingQty
    })

    return changedLocal
  }

  const redistributeSurplusToAllRows = (poolUnits = []) => {
    if (!poolUnits.length || !templateRowsModel.length) return false
    const allowedUnits = new Set(poolUnits)
    let touched = false
    const activeRows = rows
      .map((row, idx) => ({
        idx,
        row,
        hasKnight: hasKnightInRow(row, units),
        pop: getRowLimitPopulation(row)
      }))
      .filter((item) => !item.hasKnight && item.pop > 0)
    if (!activeRows.length) return false

    units.forEach((unit, unitIdx) => {
      if (!allowedUnits.has(unit)) return
      if (isDistributionLockedUnit(unit)) return
      const unitPop = toUnitPop(unit, unitMetaByName)
      if (!Number.isFinite(unitPop) || unitPop <= 0) return

      const recipients = activeRows
        .map((item) => item.idx)
        .filter((rowIdx) => getModelCellValue(rowIdx, unitIdx) === -1)
      if (!recipients.length) return

      const donors = activeRows
        .map((item) => item.idx)
        .filter((rowIdx) => {
          const qty = Number(rows?.[rowIdx]?.[unitIdx]) || 0
          if (qty <= 0) return false
          const modelValue = getModelCellValue(rowIdx, unitIdx)
          return Number.isFinite(modelValue) && modelValue > 0
        })
      if (!donors.length) return

      const recipientIdx = recipients[0]
      donors.forEach((donorIdx) => {
        const qty = Number(rows?.[donorIdx]?.[unitIdx]) || 0
        if (qty <= 0) return
        const donorTarget = getRowTargetPop(rows[donorIdx])
        const donorPop = getRowLimitPopulation(rows[donorIdx])
        const donorSurplus = donorPop - donorTarget
        if (donorSurplus <= 0) return
        const maxMove = Math.min(qty, Math.floor(donorSurplus / unitPop))
        if (maxMove <= 0) return
        rows[donorIdx][unitIdx] -= maxMove
        rows[recipientIdx][unitIdx] += maxMove
        touched = true
      })
    })

    return touched
  }

  if (topUpDeficitRowsFromPool(modelPoolUnits)) changed = true
  if (rebalanceRowsBySurplus(modelPoolUnits)) changed = true

  if (getDeficitRows().length > 0) {
    if (topUpDeficitRowsFromPool(outsideModelPoolUnits)) changed = true
    if (rebalanceRowsBySurplus([...modelPoolUnits, ...outsideModelPoolUnits])) changed = true
  }
  if (rebalanceSupportRowsByFallbackProportion()) changed = true
  if (redistributeSurplusToAllRows([...modelPoolUnits, ...outsideModelPoolUnits])) changed = true

  const filtered = rows.filter((row) => {
    const pop = getRowLimitPopulation(row)
    if (pop <= 0) return false
    if (hasKnightInRow(row, units)) return true
    return pop >= getRowTargetPop(row)
  })

  const removedRows = Math.max(0, totalRowsBefore - filtered.length)
  if (removedRows > 0) changed = true

  const unresolvedRows = filtered.reduce((acc, row) => {
    const pop = getRowLimitPopulation(row)
    if (!hasKnightInRow(row, units) && pop > 0 && pop < getRowTargetPop(row)) return acc + 1
    return acc
  }, 0)

  return {
    values: filtered,
    changed,
    removedRows,
    unresolvedRows
  }
}

// Converte uma row (array por índice) em objeto por nome de unidade.
// Ex.: units ['spear','axe'], row [10,50] -> { spear:10, axe:50 }
export function buildTemplateRowMap(units = [], row = []) {
  return units.reduce((map, unit, index) => {
    const value = Number(row?.[index])
    map[unit] = Number.isFinite(value) ? value : 0
    return map
  }, {})
}

// Enriquece o retorno normalizado com a 1a linha pronta para payload.
// Retorna:
// - firstRow: array na ordem de units
// - firstRowMap: objeto unit -> quantidade
function withPayloadFirstRow(normalized = {}, worldUnits = []) {
  const units = Array.isArray(normalized?.units) ? normalized.units : (Array.isArray(worldUnits) ? worldUnits : [])
  const values = Array.isArray(normalized?.values) ? normalized.values : []
  const firstRow = values[0] || units.map(() => 0)
  return {
    ...normalized,
    firstRow,
    firstRowMap: buildTemplateRowMap(units, firstRow)
  }
}

// Orquestra toda normalização do template para a etapa getPlace:
// - coloca na ordem do mundo
// - resolve conflitos locais (tropas/linhas)
// - registra conflitos de schedule em meta
// - devolve 1a linha pronta para payload
//
// Retorno final:
// {
//   units: string[],
//   values: number[][],
//   meta: {
//     mode, commandType, options,
//     conflicts: {...},
//     resolutions: [...]
//   },
//   firstRow: number[],
//   firstRowMap: Record<string, number>
// }
export function normalizeTemplateForCommand(template, unitsOrder = [], context = {}) {
  // Ordem canônica de unidades para este mundo.
  const worldUnits = Array.isArray(unitsOrder) ? unitsOrder : []
  // Estrutura "nova" de template.
  const tplUnits = Array.isArray(template?.units) ? template.units : []
  const buildTarget = normalizeBuildTarget(template?.buildTarget)
  const templateType = normalizeTemplateType(template?.templateType)
  const rawValues = Array.isArray(template?.values) ? template.values : []
  // Tropas reais da vila no momento do getPlace.
  const sourceVillageUnits = Array.isArray(context?.sourceVillageUnits?.units) ? context.sourceVillageUnits.units : []
  const sourceVillageByUnit = context?.sourceVillageUnits?.byUnit instanceof Map
    ? context.sourceVillageUnits.byUnit
    : new Map(worldUnits.map((unit, index) => [unit, Number(sourceVillageUnits[index]) || 0]))
  const unitMetaByName = context?.unitMetaByName
  const troopsConflictOption = normalizeTroopsConflictOption(
    context?.conflictTroops ?? context?.conflictTroopsMode ?? template?.conflictTroops
  )
  // Modo da execução: send ou schedule.
  const mode = String(context?.mode || template?.mode || 'send').toLowerCase() === 'schedule' ? 'schedule' : 'send'
  // Tipo do comando impacta regra de "attacks" (só attack usa fake_limit/limite).
  const commandType = String(context?.commandType || template?.commandType || 'attack').toLowerCase() === 'support'
    ? 'support'
    : 'attack'
  const fakeLimitPercent = Number(context?.fakeLimitPercent)
  const villagePoints = Number(context?.villagePoints)
  const targetPlayerId = context?.targetPlayerId
  const minSpyCommand = context?.minSpyCommand
  const slowestTemplateUnit = String(context?.slowestTemplateUnit || '').trim() || null
  const fakeMinPopBase =
    commandType === 'attack' &&
    Number.isFinite(fakeLimitPercent) &&
    Number.isFinite(villagePoints)
      ? Math.floor((villagePoints * fakeLimitPercent) / 100)
      : null
  // Índice unit -> posição para casar arrays com segurança.
  const unitIndexByName = buildUnitIndexByName(worldUnits)

  // "Relatório" de normalização para logging/confirm.
  const resultMeta = {
    mode,
    templateType,
    commandType,
    slowestUnit: null,
    requestedAttackCount: 0,
    finalAttackCount: 0,
    options: {
      troops: troopsConflictOption,
      attacks: 'partial'
    },
    conflicts: {
      troops: false,
      attacks: false
    },
    resolutions: []
  }

  // formato novo: { units, values }
  if (tplUnits.length && rawValues.length) {
    // Mapeia índice das unidades do template original.
    const tplIndexByUnit = new Map(tplUnits.map((unit, index) => [unit, index]))
    // Reordena cada linha para worldUnits + sanitiza números inválidos.
    // IMPORTANTE: caminho "value" mantido como estava.
    const valuesRawNormalized = templateType === 'percent'
      ? normalizeTemplateRowsPercentMode({
        rawValues,
        tplIndexByUnit,
        worldUnits,
        sourceVillageByUnit,
        sourceVillageUnits
      })
      : rawValues
        .filter((row) => Array.isArray(row))
        .map((row) => worldUnits.map((unit) => {
          const idx = tplIndexByUnit.get(unit)
          const value = Number(idx == null ? 0 : row[idx])
          return Number.isFinite(value) ? value : 0
        }))
        // Remove linhas totalmente zeradas.
        .filter((row) => row.some((value) => value !== 0))
    resultMeta.requestedAttackCount = valuesRawNormalized.length

    // Se sobrou nada, já retorna vazio com firstRow padronizada.
    if (!valuesRawNormalized.length) {
      return withPayloadFirstRow({ buildTarget, units: worldUnits, values: [], meta: resultMeta }, worldUnits)
    }
    const slowestUnitForAttack = commandType === 'attack'
      ? (slowestTemplateUnit || getSlowestTemplateUnit(valuesRawNormalized, worldUnits, unitMetaByName))
      : null
    if (commandType === 'attack') {
      resultMeta.slowestUnit = slowestUnitForAttack
    }
    let valuesRawForDistribution = valuesRawNormalized
    let preTrimmedBySlowest = false
    if (commandType === 'attack' && slowestUnitForAttack && valuesRawNormalized.length > 0) {
      const availableSlowest = Math.max(
        0,
        Math.floor(
          Number(
            sourceVillageByUnit instanceof Map
              ? sourceVillageByUnit.get(slowestUnitForAttack)
              : sourceVillageByUnit?.[slowestUnitForAttack]
          ) || 0
        )
      )
      if (availableSlowest <= 0) {
        valuesRawForDistribution = []
        preTrimmedBySlowest = valuesRawNormalized.length > 0
      } else {
        const activeRowsRaw = valuesRawNormalized.filter((row) => row.some((value) => Number(value) > 0))
        const keepCount = Math.min(activeRowsRaw.length, availableSlowest)
        if (keepCount < activeRowsRaw.length) {
          valuesRawForDistribution = activeRowsRaw.slice(0, keepCount)
          preTrimmedBySlowest = true
        }
      }
    }
    const modelUnitsInTemplate = new Set(
      worldUnits.filter((unit, unitIdx) =>
        valuesRawForDistribution.some((row) => (Number(row?.[unitIdx]) || 0) !== 0)
      )
    )
    const spyOnlyMinPopBase = (
      commandType === 'attack' &&
      isSpyOnlyTemplateValues(valuesRawNormalized, worldUnits)
    )
      ? resolveSpyOnlyMinPopBase({
          minSpyCommand,
          targetPlayerId,
          unitMetaByName
        })
      : null
    const attackMinPopBase = Number.isFinite(spyOnlyMinPopBase) && spyOnlyMinPopBase > 0
      ? spyOnlyMinPopBase
      : fakeMinPopBase

    // Distribuição local usando tropas reais da vila no momento.
    // Resolve fixed/all dentro do próprio template deste comando.
    const distributedValues = calcTemplateRowsForSender({
      tplUnits: worldUnits,
      tplValues: valuesRawForDistribution,
      senderUnits: sourceVillageUnits,
      unitIndexByName
    })

    // Se algum fixed foi reduzido pela distribuição, houve conflito de tropas.
    if (hasTroopsConflict(valuesRawForDistribution, distributedValues)) {
      resultMeta.conflicts.troops = true
      resultMeta.resolutions.push({
        type: 'troops',
        resolution: troopsConflictOption,
        message: troopsConflictOption === 'abort'
          ? 'Conflito de tropas: modo estrito bloqueou redistribuição.'
          : 'Conflito de tropas: redistribuído com o disponível.'
      })
      if (troopsConflictOption === 'abort') {
        resultMeta.finalAttackCount = 0
        return withPayloadFirstRow({ buildTarget, units: worldUnits, values: [], meta: resultMeta }, worldUnits)
      }
    }
    if (preTrimmedBySlowest) {
      resultMeta.resolutions.push({
        type: 'slowestUnit',
        resolution: 'partial',
        message: `Unidade mais lenta (${slowestUnitForAttack || 'N/A'}): linhas reduzidas antes da distribuição.`
      })
    }

    // Ataque: mantém linhas para priorizar quantidade de ataques pela tropa mais lenta.
    // Suporte continua removendo linhas zeradas logo após distribuição.
    let valuesWithUnits = commandType === 'attack'
      ? distributedValues
      : keepOnlyRowsWithUnits(distributedValues)

    // Ataque com múltiplas linhas: a unidade mais lenta precisa ir em cada linha.
    if (commandType === 'attack' && valuesWithUnits.length > 0) {
      const slowestResult = enforceSlowestUnitPerAttack(
        valuesWithUnits,
        worldUnits,
        slowestUnitForAttack,
        sourceVillageByUnit
      )
      valuesWithUnits = slowestResult.values
      if (slowestResult.changed) {
        resultMeta.resolutions.push({
          type: 'slowestUnit',
          resolution: slowestResult.removedRows > 0 ? 'partial' : 'redistribute',
          message: slowestResult.removedRows > 0
            ? `Unidade mais lenta (${slowestUnitForAttack || 'N/A'}): linhas reduzidas por falta da unidade.`
            : `Unidade mais lenta (${slowestUnitForAttack || 'N/A'}): garantida em cada linha de ataque.`
        })
      }
    }

    // Ataque: tenta manter linhas válidas no fake-limit real do momento.
    if (commandType === 'attack' && Number.isFinite(attackMinPopBase) && attackMinPopBase > 0) {
      const fakeResult = enforceFakeLimitOnAttackRows(
        valuesWithUnits,
        worldUnits,
        attackMinPopBase,
        sourceVillageByUnit,
        unitMetaByName,
        {
          modelUnits: modelUnitsInTemplate,
          slowestUnit: slowestUnitForAttack,
          templateRowsModel: valuesRawNormalized,
          snobEscortMinPop: 20
        }
      )
      valuesWithUnits = fakeResult.values
      if (fakeResult.changed) {
        resultMeta.resolutions.push({
          type: 'fakeLimit',
          resolution: fakeResult.removedRows > 0 ? 'partial' : 'redistribute',
          message: fakeResult.removedRows > 0
            ? `Fake limit ajustado: ${fakeResult.removedRows} linha(s) removida(s) por limite mínimo.`
            : 'Fake limit ajustado: tropas redistribuídas para manter as linhas.'
        })
      }
    }

    if (commandType === 'attack' && valuesWithUnits.length > 0) {
      const slowestAfterFakeResult = enforceSlowestUnitPerAttack(
        valuesWithUnits,
        worldUnits,
        slowestUnitForAttack,
        sourceVillageByUnit
      )
      valuesWithUnits = slowestAfterFakeResult.values
      if (slowestAfterFakeResult.changed) {
        resultMeta.resolutions.push({
          type: 'slowestUnit',
          resolution: slowestAfterFakeResult.removedRows > 0 ? 'partial' : 'redistribute',
          message: slowestAfterFakeResult.removedRows > 0
            ? `Unidade mais lenta (${slowestUnitForAttack || 'N/A'}): linhas reduzidas após fake limit.`
            : `Unidade mais lenta (${slowestUnitForAttack || 'N/A'}): revalidada após fake limit.`
        })
      }
    }

    // "attacks" só vale para ataque; apoio não usa esse corte por limite.
    if (commandType === 'attack' && valuesWithUnits.length < valuesRawNormalized.length) {
      resultMeta.conflicts.attacks = true
      resultMeta.resolutions.push({
        type: 'attacks',
        resolution: 'partial',
        message: `Conflito de limite de ataques: ${valuesWithUnits.length}/${valuesRawNormalized.length} ataques disponíveis.`
      })
    }

    // Retorno normal do fluxo principal.
    resultMeta.finalAttackCount = valuesWithUnits.length
    return withPayloadFirstRow({ buildTarget, units: worldUnits, values: valuesWithUnits, meta: resultMeta }, worldUnits)
  }

  // formato legado: { spear: 100, sword: 0, ... }
  // Converte formato antigo para 1 linha na ordem do mundo.
  const firstRow = worldUnits.map((unit) => {
    const value = Number(template?.[unit])
    return Number.isFinite(value) ? value : 0
  })
  const values = firstRow.some((value) => value !== 0) ? [firstRow] : []
  resultMeta.requestedAttackCount = values.length
  resultMeta.finalAttackCount = values.length
  // Retorno com mesma estrutura do formato novo.
  return withPayloadFirstRow({ buildTarget, units: worldUnits, values, meta: resultMeta }, worldUnits)
}
