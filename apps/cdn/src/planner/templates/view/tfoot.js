import { consoleDev } from "@toolkit-tw-bot/utils";
import { createEventPayloadFactory } from "../../events/eventPayload";
import { getGameData } from "@toolkit-tw-bot/document";

const getCurrentGameData = () => {
  if (typeof window !== "undefined" && typeof window.game_data !== "undefined") {
    return window.game_data
  }

  if (typeof document === "undefined") return null

  return getGameData()
}

const gameData = getCurrentGameData()

function renderTfootTotals(plannerTemplates, dataUnits) {
  const tfootRow = plannerTemplates.querySelector('tfoot tr');
  if (!tfootRow) return { destroy: () => {} }
  const payloadFactory = createEventPayloadFactory({
    source: 'planner:templates:tfoot',
    eventVersion: 1
  })
  const stableDelayMs = 120
  let stableTimer = null
  let lastStableSignature = ''

  const units = gameData.units.filter((id) => id !== 'militia');
  const getTemplateType = () => plannerTemplates?.dataset?.templateType || 'value'
  const getCommandMode = () => plannerTemplates?.dataset?.commandMode || 'attack'
  const lockedUnits = new Set(['knight', 'snob'])
  const isPercentUnit = (unit) =>
    getTemplateType() === 'percent' && !lockedUnits.has(unit)
  const normalizeValue = (raw, unit) => {
    if (raw === null || raw === undefined) return 0
    const text = String(raw).trim()
    if (text === '' || text === '0') return 0
    if (text === 'all' || text === '-1') {
      const isPercent = getTemplateType() === 'percent'
      if (isPercent && !lockedUnits.has(unit)) return 100
      return -1
    }
    const num = Number(text)
    return Number.isNaN(num) ? 0 : num
  }
  const ensureCells = () => {
    tfootRow.querySelectorAll('td.unit-item').forEach((td) => td.remove())
    const html = units
      .map(
        (id) => `
          <td data-unit-count="0" data-unit="${id}" class="unit-item unit-item-${id} hidden">0</td>
        `
      )
      .join('\n ')
    tfootRow.insertAdjacentHTML('beforeend', html)
  }
  ensureCells()

  const getRows = () => {
    const rows = Array.from(plannerTemplates.querySelectorAll('tbody tr'))
    if (getCommandMode() === 'support') return rows.slice(0, 1)
    return rows
  }
  const getInputsByUnit = (unit) =>
    Array.from(plannerTemplates.querySelectorAll(`tbody input.go-unit-input[data-unit="${unit}"]`))
  const getSelectedUnits = (row) => {
    if (!row) return []
    return Array.from(row.querySelectorAll('input.go-unit-input[data-unit]'))
      .map((input) => {
        const unit = input.dataset.unit
        const raw = String(input.value || '').trim()
        if (raw === 'all' || raw === '-1') return unit
        const num = Number(raw)
        if (!Number.isNaN(num) && num > 0) return unit
        return null
      })
      .filter(Boolean)
  }

  const clearFooterState = () => {
    units.forEach((unit) => {
      const td = tfootRow.querySelector(`td.unit-item-${unit}`)
      if (!td) return
      td.classList.remove('go-unit-footer-all', 'go-unit-footer-error')
      td.dataset.unitCount = '0'
      td.textContent = '0'
      td.classList.add('hidden')
    })
  }

  const computeUnitTotals = () => {
    const errorUnits = []
    const errorInputsByUnit = new Map()
    let totalFixed = 0
    let totalPopExtra = 0
    let hasAllAny = false

    const isPercentMode = getTemplateType() === 'percent'
    units.forEach((unit) => {
      const percentUnit = isPercentUnit(unit)
      const inputs = getInputsByUnit(unit)
      const values = inputs.map((input) => String(input.value || '').trim())
      const allInputs = inputs.filter((input, idx) => {
        const raw = values[idx]
        if (raw === '-1' || raw === 'all') return !percentUnit
        return false
      })
      const hasAll = !percentUnit && allInputs.length > 0
      const hasError = !isPercentMode && !percentUnit && allInputs.length > 1

      let sum = 0
      if (percentUnit) {
        const nums = inputs.map((input, idx) => {
          const raw = values[idx]
          const num = Number(raw)
          return Number.isNaN(num) ? 0 : num
        })
        const lastUnit = plannerTemplates?.dataset?.lastChangedUnit || ''
        const lastRow = Number(plannerTemplates?.dataset?.lastChangedRow)
        const allIndex = inputs.findIndex((input) => allInputs.includes(input))
        let sumOther = 0
        nums.forEach((num, idx) => {
          if (idx === allIndex) return
          sumOther += num
        })
        if (allIndex >= 0 && allInputs.length === 1) {
          let residual = 100 - sumOther
          if (residual < 0) {
            residual = 0
          }
          inputs[allIndex].value = String(residual)
          nums[allIndex] = residual
          sum = sumOther + residual
        } else {
          sum = nums.reduce((acc, n) => acc + n, 0)
          if (sum > 100) {
            const overflow = sum - 100
            let idx = -1
            let maxVal = -Infinity
            nums.forEach((n, i) => {
              if (n <= 0) return
              if (unit === lastUnit && i === lastRow) return
              if (n > maxVal) {
                maxVal = n
                idx = i
              }
            })
            if (idx < 0) {
              nums.forEach((n, i) => {
                if (n > maxVal) {
                  maxVal = n
                  idx = i
                }
              })
            }
            if (idx >= 0 && maxVal > 0) {
              const nextVal = Math.max(0, maxVal - overflow)
              nums[idx] = nextVal
              inputs[idx].value = String(nextVal)
            }
            sum = 100
          }
        }
      } else {
        inputs.forEach((input, idx) => {
          const raw = values[idx]
          if (!raw || raw === '-1' || raw === 'all') return
          const num = Number(raw)
          if (!Number.isNaN(num)) sum += num
        })
      }

      const td = tfootRow.querySelector(`td.unit-item-${unit}`)
      if (!td) return

      const unitPop = Number(dataUnits?.get?.(unit)?.pop) || 1
      const hasFixed = sum > 0
      const showPopInfo = unitPop > 1 && hasFixed
      if (hasAll) {
        if (percentUnit) {
          td.textContent = '100%'
        } else {
          td.textContent = 'all'
          hasAllAny = true
          if (showPopInfo) {
            const totalPop = sum * unitPop
            const sumText = sum.toLocaleString('pt-BR')
            const totalPopText = totalPop.toLocaleString('pt-BR')
            td.insertAdjacentHTML(
              'beforeend',
              `<span class="icon info-small go-total-fixed-info" data-title="total fixo: ${sumText}<br>total pop: ${totalPopText}"></span>`
            )
            td.classList.add('go-unit-footer-allpos')
          }
        }
        td.classList.remove('hidden')
        td.classList.add('go-unit-footer-all')
      } else if (sum !== 0) {
        td.textContent = percentUnit ? `${sum}%` : String(sum)
        if (!percentUnit && showPopInfo) {
          const totalPop = sum * unitPop
          const totalPopText = totalPop.toLocaleString('pt-BR')
          td.insertAdjacentHTML(
            'beforeend',
            `<span class="icon info-small go-total-fixed-info" data-title="total pop: ${totalPopText}"></span>`
          )
          td.classList.add('go-unit-footer-allpos')
        }
        td.classList.remove('hidden')
      } else {
        td.textContent = '0'
        td.classList.add('hidden')
      }

      if (!percentUnit && sum > 0) {
        totalFixed += sum
        if (unitPop > 1) totalPopExtra += sum * (unitPop - 1)
      }

      if (hasError) {
        td.classList.add('go-unit-footer-error')
        errorUnits.push(unit)
        errorInputsByUnit.set(unit, allInputs)
      }
    })

    const rows = getRows()
    if (!isPercentMode) {
      rows.forEach((row, rowIndex) => {
        let infoEl = plannerTemplates.querySelector(`#go-farm-info\\:${rowIndex}`)
        if (!infoEl) {
          const th = row.querySelector('th.train-name')
          if (th) {
            const wrap = document.createElement('div')
            wrap.className = 'float_right go-th-btn'
            wrap.style.marginRight = '6px'
            wrap.innerHTML = `<span id="go-farm-info:${rowIndex}" name="go-farm-info" class="icon info-small"></span>`
            th.appendChild(wrap)
            infoEl = wrap.querySelector('span[name="go-farm-info"]')
          }
        }
        if (!infoEl) return
        let rowFixed = 0
        let rowPopExtra = 0
        let rowHasAll = false
        const inputs = row.querySelectorAll('input.go-unit-input[data-unit]')
        inputs.forEach((input) => {
          const unit = input.dataset.unit
          const raw = String(input.value || '').trim()
          if (raw === '-1' || raw === 'all') {
            rowHasAll = true
            return
          }
          const num = Number(raw)
          if (Number.isNaN(num) || num <= 0) return
          const unitPop = Number(dataUnits?.get?.(unit)?.pop) || 1
          rowFixed += num
          if (unitPop > 1) rowPopExtra += num * (unitPop - 1)
        })
        const rowPop = rowFixed + rowPopExtra
        if (rowFixed > 0 || rowPop > 0 || rowHasAll) {
          const lines = []
          if (rowFixed > 0) lines.push(`total fixo: ${rowFixed.toLocaleString('pt-BR')}`)
          if (rowPop > 0) lines.push(`total pop: ${rowPop.toLocaleString('pt-BR')}`)
          if (rowHasAll) lines.push('*No envio: Total disponível - Total fixo = ALL.')
          infoEl.dataset.title = lines.join('<br>')
          infoEl.classList.add('show')
        } else {
          infoEl.classList.remove('show')
          infoEl.removeAttribute('data-title')
        }
      })
    }

    const farmInfo = plannerTemplates.querySelector('#go-farm-info-total')
    if (!isPercentMode && farmInfo) {
      const totalPop = totalFixed + totalPopExtra
      if (totalFixed > 0 || totalPop > 0 || hasAllAny) {
        const lines = []
        if (totalFixed > 0) lines.push(`total fixo: ${totalFixed.toLocaleString('pt-BR')}`)
        if (totalPop > 0) lines.push(`total pop: ${totalPop.toLocaleString('pt-BR')}`)
        if (hasAllAny) lines.push('*No envio: Total disponível - Total fixo = ALL.')
        farmInfo.dataset.title = lines.join('<br>')
        farmInfo.classList.add('show')
      } else {
        farmInfo.classList.remove('show')
        farmInfo.removeAttribute('data-title')
      }
    }

    return { errorUnits, errorInputsByUnit }
  }

  const computeTemplateStats = () => {
    const rows = getRows()
    const templateType = getTemplateType()
    const commandMode = getCommandMode()
    const selectedBuildTarget = String(
      plannerTemplates
        ?.querySelector?.('.go-template-build-target button.go-build-target.go-btselected[name]')
        ?.getAttribute?.('name') || ''
    )
      .replace(/^building:/, '')
      .trim() || null
    const values = rows.map((row) =>
      units.map((unit) => {
        const input = row.querySelector(`input.go-unit-input[data-unit="${unit}"]`)
        return normalizeValue(input?.value, unit)
      })
    )
    const rowStats = []
    let totalFixed = 0
    let totalPopExtra = 0
    let hasAllAny = false

    rows.forEach((row, rowIndex) => {
      let rowFixed = 0
      let rowPopExtra = 0
      let rowHasAll = false

      units.forEach((unit, unitIndex) => {
        const val = values?.[rowIndex]?.[unitIndex]
        if (val === -1) {
          rowHasAll = true
          hasAllAny = true
          return
        }
        if (!Number.isFinite(val) || val <= 0) return
        const unitPop = Number(dataUnits?.get?.(unit)?.pop) || 1
        rowFixed += val
        totalFixed += val
        if (unitPop > 1) {
          const extra = val * (unitPop - 1)
          rowPopExtra += extra
          totalPopExtra += extra
        }
      })
      rowStats.push({
        index: rowIndex,
        fixed: rowFixed,
        pop: rowFixed + rowPopExtra,
        hasAll: rowHasAll
      })
    })

    return {
      template: {
        commandMode,
        templateType,
        buildTarget: selectedBuildTarget,
        units,
        values
      },
      rows: rowStats,
      totals: {
        fixed: totalFixed,
        pop: totalFixed + totalPopExtra,
        hasAll: hasAllAny
      }
    }
  }

  const computeHasCatapult = () => {
    if (getCommandMode() === 'support') return false
    const percentUnit = isPercentUnit('catapult')
    const inputs = getInputsByUnit('catapult')
    if (!inputs.length) return false
    let sum = 0
    for (const input of inputs) {
      const raw = String(input.value || '').trim()
      if (!percentUnit && (raw === '-1' || raw === 'all')) return true
      if (percentUnit && raw === '100') return true
      if (!raw) continue
      const num = Number(raw)
      if (!Number.isNaN(num)) sum += num
    }
    return sum > 0
  }

  const computePaladinConflict = (rows) => {
    const paladinInputs = []
    let paladinCount = 0
    let paladinConflict = false
    const paladinUnit = 'knight'
    rows.forEach((row) => {
      const input = row.querySelector(`input.go-unit-input[data-unit="${paladinUnit}"]`)
      if (!input) return
      const raw = String(input.value || '').trim()
      if (raw === '' || raw === '0') return
      if (raw === '-1' || raw === 'all') {
        paladinCount += 1
        paladinInputs.push(input)
        return
      }
      const num = Number(raw)
      if (Number.isNaN(num) || num <= 0) return
      paladinCount += num
      paladinInputs.push(input)
      if (num > 1) paladinConflict = true
    })
    if (paladinCount > 1) paladinConflict = true
    return { paladinConflict, paladinInputs }
  }

  const speedConflictUnit = (rows) => {
    let unitSlow = null
    let conflict = false
    let baseSpeed = null

    let unitsSelectedRows = rows.map((row) => {
      const selecteds = getSelectedUnits(row)
      if (!selecteds.length) return null
      return selecteds
        .map((unit) => ({ unit, speed: Number(dataUnits?.get(unit)?.speed) }))
        .filter((item) => Number.isFinite(item.speed))
        .sort((a, b) => a.speed - b.speed) // menor speed = mais lento
    })

    if (unitsSelectedRows.includes(null)) {
      unitsSelectedRows = unitsSelectedRows.filter(Boolean)
      if (!unitsSelectedRows.length) {
        return { unitSlow, isConflictSpeed: false }
      }
      conflict = true
    }

    const baseRow = unitsSelectedRows[0] || []
    const baseSlow = baseRow[0] || null
    baseSpeed = baseSlow?.speed ?? null
    if (baseSpeed !== null) {
      unitsSelectedRows.forEach((row, idx) => {
        const rowSlow = row?.[0]
        if (!rowSlow) {
          if (idx > 0) conflict = true
          return
        }
        if (rowSlow.speed !== baseSpeed) conflict = true
      })
    }

    if (baseSlow?.unit === 'knight') {
      const next = baseRow.find((u) => u.unit !== 'knight')
      unitSlow = next?.unit || baseSlow.unit
    } else {
      unitSlow = baseSlow?.unit || null
    }

    return { unitSlow, isConflictSpeed: conflict }
  }
  
  const computeSpeedConflict = (rows) => {
    const { unitSlow, isConflictSpeed } = speedConflictUnit(rows)
    const speedErrorInputs = []
    if (isConflictSpeed && unitSlow) {
      rows.forEach((row) => {
        const input = row.querySelector(`input.go-unit-input[data-unit="${unitSlow}"]`)
        if (input) speedErrorInputs.push(input)
      })
    }
    return { speedConflict: isConflictSpeed, speedErrorInputs, slowestUnit: unitSlow }
  }

  const computeSnobWarn = (rows) => {
    if (getCommandMode() === 'support') {
      return { hasWarn: false, snobInputs: [] }
    }
    const snobInputs = []
    let hasWarn = false
    rows.forEach((row) => {
      const snobInput = row.querySelector('input.go-unit-input[data-unit="snob"]')
      if (!snobInput) return
      const raw = String(snobInput.value || '').trim()
      const hasSnob =
        raw === '-1' ||
        raw === 'all' ||
        ((!Number.isNaN(Number(raw))) && Number(raw) > 0)
      if (!hasSnob) return
      const selectedUnits = getSelectedUnits(row)
      const hasOtherUnits = selectedUnits.some((unit) => unit !== 'snob')
      if (hasOtherUnits) return
      hasWarn = true
      snobInputs.push(snobInput)
    })
    return { hasWarn, snobInputs }
  }
  const buildValidation = ({ errorUnits, paladinConflict, speedConflict, snobWarn }) => {
    const conflicts = {
      footer: Array.isArray(errorUnits) && errorUnits.length > 0,
      paladin: Boolean(paladinConflict),
      speed: Boolean(speedConflict),
      snobWarn: Boolean(snobWarn)
    }
    return {
      isValid: !(conflicts.footer || conflicts.paladin || conflicts.speed),
      conflicts
    }
  }
  const toStableSignature = (payload) => JSON.stringify({
    template: payload?.template || null,
    rows: payload?.rows || [],
    totals: payload?.totals || null,
    validation: payload?.validation || null
  })

  const computeTotals = () => {
    clearFooterState()
    const { errorUnits, errorInputsByUnit } = computeUnitTotals()
    const hasCatapult = computeHasCatapult()

    const rows = getRows()
    const { paladinConflict, paladinInputs } = computePaladinConflict(rows)
    const { speedConflict, speedErrorInputs, slowestUnit } = computeSpeedConflict(rows)
    const { hasWarn: snobWarn, snobInputs } = computeSnobWarn(rows)

    plannerTemplates.dispatchEvent(
      new CustomEvent('go:footer:error', {
        bubbles: true,
        detail: { errorUnits, errorInputsByUnit }
      })
    )
    plannerTemplates.dispatchEvent(
      new CustomEvent('go:paladin:conflict', {
        bubbles: true,
        detail: { hasConflict: paladinConflict, paladinInputs }
      })
    )
    plannerTemplates.dispatchEvent(
      new CustomEvent('go:speed:conflict', {
        bubbles: true,
        detail: { hasConflict: speedConflict, slowestUnit, speedErrorInputs }
      })
    )
    plannerTemplates.dispatchEvent(
      new CustomEvent('go:snob:warn', {
        bubbles: true,
        detail: { hasWarn: snobWarn, snobInputs }
      })
    )
    plannerTemplates.dispatchEvent(
      new CustomEvent('go:buildtarget:toggle', {
        bubbles: true,
        detail: { show: hasCatapult }
      })
    )
    const stats = computeTemplateStats()
    const validation = buildValidation({
      errorUnits,
      paladinConflict,
      speedConflict,
      snobWarn
    })
    const payload = payloadFactory.next({ stats, validation })
    plannerTemplates.dispatchEvent(
      new CustomEvent('go:template:stats', {
        bubbles: true,
        detail: payload
      })
    )
    if (stableTimer) clearTimeout(stableTimer)
    stableTimer = setTimeout(() => {
      const signature = toStableSignature(payload)
      if (signature === lastStableSignature) return
      lastStableSignature = signature
      consoleDev.debug({
        event: 'go:template:stats:stable',
        meta: payload?.meta || null,
        validation: payload?.validation || null
      }, {
        label: '[planner:template:stable]',
        color: '#2f6feb'
      })
      plannerTemplates.dispatchEvent(
        new CustomEvent('go:template:stats:stable', {
          bubbles: true,
          detail: payload
        })
      )
    }, stableDelayMs)
  }

  const onUnitsChanged = () => computeTotals()
  plannerTemplates.addEventListener('go:units:changed', onUnitsChanged)
  const onCommandModeChanged = () => computeTotals()
  plannerTemplates.addEventListener('go:command-mode:changed', onCommandModeChanged)

  const onInput = (e) => {
    if (!e.target?.closest?.('input.go-unit-input')) return
    plannerTemplates.dispatchEvent(new CustomEvent('go:units:changed', { bubbles: true }))
  }
  plannerTemplates.addEventListener('input', onInput)
  plannerTemplates.addEventListener('change', onInput)

  computeTotals()

  const destroy = () => {
    if (stableTimer) clearTimeout(stableTimer)
    plannerTemplates.removeEventListener('go:units:changed', onUnitsChanged)
    plannerTemplates.removeEventListener('go:command-mode:changed', onCommandModeChanged)
    plannerTemplates.removeEventListener('input', onInput)
    plannerTemplates.removeEventListener('change', onInput)
  }

  return { destroy }
}

export { renderTfootTotals }
