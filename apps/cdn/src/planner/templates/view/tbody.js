import { getGameData } from "@toolkit-tw-bot/document";
import { computeSlowestUnit } from "../../shared/slowestUnit";

let trsEl;
const getCurrentGameData = () => {
  if (typeof window !== "undefined" && typeof window.game_data !== "undefined") {
    return window.game_data
  }

  if (typeof document === "undefined") return null

  return getGameData()
}

const gameData = getCurrentGameData()

function renderTbodyTrSecond(tbodyEl, templateType = 'value') {
  const len = tbodyEl?.querySelectorAll('tr').length || 0
  const farmInfoHtml = () => `
    <div class="float_right  go-th-btn" style="margin-right: 6px;">
      <span id="go-farm-info:${len}" name="go-farm-info" class="icon info-small"></span>
    </div>
  `
  const tbodySecondTrHtml = `
    <tr class="units-row">
      <th class="train-name">
        <span>#${len + 1}</span>
        ${templateType === 'value' ? (`
          <strong data-title="A partir do segundo ataque insira '-1' para enviar todas as tropas de uma unidade." style="color: #ff1493;margin-left: 4px;">[all=-1]</strong>
          `) : ''}
        <img name="go-remove-row" data-title="Inserir Modelo TW" class="float_right go-th-btn" src="https://dsbr.innogamescdn.com/asset/98f3b7c4/graphic/delete_14.png" alt="Excluir">
        ${templateType === 'value' ? (`
          <img name="go-add-model-tw" data-title="Inserir Modelo TW" class="float_right go-th-btn" width="16px" height="16px" src="https://dsbr.innogamescdn.com/asset/985df5a4/graphic/favicon-32x32.webp" alt="tw ico" tabindex="0">
        `) : ''}
        ${farmInfoHtml()}
      </th>
      ${gameData.units.map(id => {
        if (id === 'militia') return '';
        return `
          <td>
            <span class="go-flex">
              <input class="go-unit-input" type="number" min="${templateType === 'percent' ? '0' : '-1'}" ${templateType === 'percent' ? 'max="100"' : ''} data-unit="${id}" name="train[2][${id}]" value="">
            </span>
          </td>
        `
      }).join('\n ')}
    </tr>
  `
  tbodyEl.insertAdjacentHTML('beforeend', tbodySecondTrHtml)
}

function renumber() {
  trsEl.forEach((tr, i) => {
    tr.querySelector('th span').textContent = `#${i + 1}`
    const farmInfo = tr.querySelector('span[name="go-farm-info"]')
    if (farmInfo) farmInfo.id = `go-farm-info:${i}`
  })
}

function renderTbodyTrFirstTd(plannerTemplates, dataUnits) {
  const tbodyTrEl = plannerTemplates.querySelector('tbody tr');
  const tbodyEl = plannerTemplates.querySelector('tbody');
  const btnAdd = tbodyTrEl.querySelector("#go-add-attack");
  const twSelect = plannerTemplates.querySelector('#tw-template');
  const lockedUnits = new Set(['knight', 'snob'])
  const syncSecondaryRowsConstraints = () => {
    const isPercent = plannerTemplates?.dataset?.templateType === 'percent'
    const rows = Array.from(tbodyEl.querySelectorAll('tr'))
    rows.slice(1).forEach((row) => {
      row.querySelectorAll('input.go-unit-input[data-unit]').forEach((input) => {
        const unit = input.dataset.unit
        if (isPercent) {
          if (lockedUnits.has(unit)) {
            input.setAttribute('min', '-1')
            input.removeAttribute('max')
            return
          }
          input.setAttribute('min', '0')
          input.setAttribute('max', '100')
          return
        }
        input.setAttribute('min', '-1')
        input.removeAttribute('max')
      })
    })
  }
  const speedByUnit = () => dataUnits;
  const getFirstRow = () => tbodyEl.querySelector('tr');
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
  const getSlowestUnit = () => {
    const unitData = speedByUnit()
    if (!unitData) return null
    const selected = getSelectedUnits(getFirstRow())
    if (!selected.length) return null
    const { slowest } = computeSlowestUnit(selected, unitData)
    return slowest
  }
  const setAddDisabled = (disabled, reason = '') => {
    if (!btnAdd) return
    if (disabled) {
      btnAdd.setAttribute('aria-disabled', 'true')
      if (reason) btnAdd.dataset.disabledReason = reason
      if (reason === 'conflict' || reason === 'speed' || reason === 'paladin') {
        btnAdd.dataset.title = 'Conflito'
      }
      if (reason === 'empty') {
        btnAdd.dataset.title = 'Preencha o ataque atual'
      }
      if (reason === 'maxRows') {
        btnAdd.dataset.title = 'Máximo 5 ataques'
      }
      return
    }
    if (reason && btnAdd.dataset.disabledReason && btnAdd.dataset.disabledReason !== reason) {
      return
    }
    delete btnAdd.dataset.disabledReason
    if (trsEl?.length === 5) {
      btnAdd.setAttribute('aria-disabled', 'true')
      btnAdd.dataset.title = 'Máximo 5 ataques'
      return
    }
    btnAdd.removeAttribute('aria-disabled')
    btnAdd.dataset.title = 'Inserir ataque'
  }
  const hasAnyUnits = (row) => getSelectedUnits(row).length > 0
  const updateAddAvailability = () => {
    if (!btnAdd) return
    if (btnAdd.dataset.disabledReason && btnAdd.dataset.disabledReason !== 'empty') return
    trsEl = Array.from(tbodyEl.querySelectorAll('tr'))
    if (!trsEl.length) return
    const last = trsEl[trsEl.length - 1]
    if (!hasAnyUnits(last)) {
      setAddDisabled(true, 'empty')
      return
    }
    setAddDisabled(false, 'empty')
  }
  const setInputAllState = (input, checked) => {
    if (!input) return
    const isPercent = plannerTemplates?.dataset?.templateType === 'percent'
    const isPercentUnit = isPercent && !lockedUnits.has(input.dataset.unit)
    if (checked) {
      if (input.dataset.prevType === undefined) input.dataset.prevType = input.type
      if (input.dataset.prevValue === undefined) {
        const cur = String(input.value || '').trim()
        input.dataset.prevValue = (cur === '-1' || cur === 'all' || cur === '100') ? '' : cur
      }
      if (isPercentUnit) {
        input.type = 'number'
        input.value = '100'
        input.disabled = false
        input.classList.add('go-unit-input-all')
        return
      }
      input.type = 'text'
      input.value = 'all'
      input.disabled = true
      input.classList.add('go-unit-input-all')
      return
    }
    input.disabled = false
    input.classList.remove('go-unit-input-all')
    const prevType = input.dataset.prevType || 'number'
    const prevValue = input.dataset.prevValue ?? ''
    const restoredValue =
      input.value !== 'all' &&
      input.value !== '-1' &&
      (!isPercentUnit || input.value !== '100')
        ? input.value
        : prevValue
    input.type = prevType
    input.value = restoredValue
    delete input.dataset.prevType
    delete input.dataset.prevValue
  }

  const remove = (tr) => {
    if (!tr) return
    if (trsEl.length === 5) {
      setAddDisabled(false, 'maxRows')
    }
    tr.remove()
    trsEl = Array.from(tbodyEl.querySelectorAll('tr'))
    renumber()
    updateAddAvailability()
    plannerTemplates.dispatchEvent(new CustomEvent('go:units:changed', { bubbles: true }))
  }

  const insert = () => {
    trsEl = Array.from(tbodyEl.querySelectorAll('tr'))
    const len = trsEl.length
    if (len === 5) return
    if (!len) return

    if (len === 1) {
      renderTbodyTrSecond(tbodyEl, plannerTemplates?.dataset?.templateType || 'value')
      const slowest = getSlowestUnit()
      if (slowest) {
        const secondRow = tbodyEl.querySelectorAll('tr')[1]
        const input = secondRow?.querySelector(`input.go-unit-input[data-unit="${slowest}"]`)
        if (input) input.value = '1'
      }
    } else {
      const last = trsEl[len - 1]
      const clone = last.cloneNode(true)
      const sourceInputs = last.querySelectorAll('input.go-unit-input')
      const cloneInputs = clone.querySelectorAll('input.go-unit-input')
      cloneInputs.forEach((input, idx) => {
        const source = sourceInputs[idx]
        const raw = String(source?.value ?? '').trim()
        const isAll = raw === '-1' || raw === 'all' || raw === '100'
        if (isAll) {
          input.value = ''
          input.disabled = false
          input.classList.remove('go-unit-input-all')
          input.type = 'number'
          delete input.dataset.prevType
          delete input.dataset.prevValue
          return
        }
        input.value = source?.value ?? input.value
      })
      tbodyEl.appendChild(clone)
    }

    trsEl = Array.from(tbodyEl.querySelectorAll('tr'))
    renumber()
    syncSecondaryRowsConstraints()
    updateAddAvailability()
    if (trsEl.length === 5) {
      setAddDisabled(true, 'maxRows')
    }
    plannerTemplates.dispatchEvent(new CustomEvent('go:units:changed', { bubbles: true }))
  }

  const onClickTbody = (e) => {
    const target = e.target
    const tr = target.closest('tr')
    if (!tr) return

    const clearBtn = target.closest('[name="clear"]')
    if (clearBtn) {
      e.preventDefault()
      plannerTemplates.dispatchEvent(
        new CustomEvent('go:template:reset', {
          bubbles: true
        })
      )
      trsEl = Array.from(tbodyEl.querySelectorAll('tr'))
      const firstRow = trsEl[0]
      trsEl.slice(1).forEach((row) => row.remove())
      if (firstRow) {
        const inputs = Array.from(firstRow.querySelectorAll('input.go-unit-input'))
        inputs.forEach((input) => {
          input.value = ''
          input.disabled = false
          input.classList.remove('go-unit-input-all')
          input.type = 'number'
          delete input.dataset.prevType
          delete input.dataset.prevValue
        })
        plannerTemplates.dispatchEvent(
          new CustomEvent('go:template:useall', {
            bubbles: true,
            detail: { units: [] }
          })
        )
      }
      trsEl = Array.from(tbodyEl.querySelectorAll('tr'))
      renumber()
      setAddDisabled(false, 'maxRows')
      updateAddAvailability()
      plannerTemplates.dispatchEvent(new CustomEvent('go:units:changed', { bubbles: true }))
      return
    }

    const removeBtn = target.closest('[name="go-remove-row"]')
    if (removeBtn) {
      e.preventDefault()
      remove(tr)
      return
    }

    const addBtn = target.closest('#go-add-attack')
    if (addBtn) {
      e.preventDefault()
      if (addBtn.getAttribute('aria-disabled') === 'true') return
      insert()
      return
    }

    const addModelBtn = target.closest('[name="go-add-model-tw"]')
    if (addModelBtn) {
      e.preventDefault()
      if (plannerTemplates?.dataset?.templateType === 'percent') return
      const templateId = twSelect?.value
      if (!templateId) return
      const rows = Array.from(tbodyEl.querySelectorAll('tr'))
      const rowIndex = rows.indexOf(tr)
      if (rowIndex < 0) return
      tr.dataset.twTemplateId = templateId
      plannerTemplates.dispatchEvent(
        new CustomEvent('go:twtemplate:apply', {
          bubbles: true,
          detail: { templateId, rowIndex, tr }
        })
      )
      return
    }
  }

  const tbodyTrFirstTdHtml = gameData.units.map(id => {
    if (id === 'militia') return '';
    return `
      <td>
        <span class="go-flex">
          <input class="go-unit-input" type="number" min="0" data-unit="${id}" name="train[1][${id}]" value="">
        </span>
      </td>
    `
  }).join('\n ')
  tbodyTrEl.insertAdjacentHTML('beforeend', tbodyTrFirstTdHtml);

  tbodyEl.addEventListener('click', onClickTbody);
  const onInputChange = (e) => {
    if (!e.target?.closest?.('input.go-unit-input')) return
    const input = e.target.closest('input.go-unit-input')
    const row = input?.closest('tr')
    if (row) {
      const rows = Array.from(tbodyEl.querySelectorAll('tr'))
      const rowIndex = rows.indexOf(row)
      if (rowIndex >= 0) {
        plannerTemplates.dataset.lastChangedRow = String(rowIndex)
        plannerTemplates.dataset.lastChangedUnit = input.dataset.unit || ''
      }
    }
    plannerTemplates.dispatchEvent(new CustomEvent('go:units:changed', { bubbles: true }))
    updateAddAvailability()
  }
  tbodyEl.addEventListener('input', onInputChange)
  tbodyEl.addEventListener('change', onInputChange)
  const onTheadToggle = (e) => {
    const { unit, checked } = e?.detail || {}
    if (!unit) return
    const firstRow = tbodyEl.querySelector('tr')
    if (!firstRow) return
    if (unit === 'all') {
      firstRow
        .querySelectorAll('input.go-unit-input[data-unit]')
        .forEach((input) => setInputAllState(input, checked))
      plannerTemplates.dispatchEvent(new CustomEvent('go:units:changed', { bubbles: true }))
      updateAddAvailability()
      return
    }
    const input = firstRow.querySelector(`input.go-unit-input[data-unit="${unit}"]`)
    setInputAllState(input, checked)
    plannerTemplates.dispatchEvent(new CustomEvent('go:units:changed', { bubbles: true }))
    updateAddAvailability()
  }
  plannerTemplates.addEventListener('go:thead:toggle', onTheadToggle)
  const onTemplateUseAll = (e) => {
    const units = Array.isArray(e?.detail?.units) ? e.detail.units : []
    const unitSet = new Set(units)
    const firstRow = tbodyEl.querySelector('tr')
    if (!firstRow) return
    firstRow
      .querySelectorAll('input.go-unit-input[data-unit]')
      .forEach((input) => {
        const unit = input.dataset.unit
        setInputAllState(input, unitSet.has(unit))
      })
    plannerTemplates.dispatchEvent(new CustomEvent('go:units:changed', { bubbles: true }))
    updateAddAvailability()
  }
  plannerTemplates.addEventListener('go:template:useall', onTemplateUseAll)
  const onFooterError = (e) => {
    const errorUnits = Array.isArray(e?.detail?.errorUnits) ? e.detail.errorUnits : []
    const errorInputsByUnit = e?.detail?.errorInputsByUnit
    tbodyEl.querySelectorAll('input.go-unit-input.go-unit-input-error').forEach((input) => {
      input.classList.remove('go-unit-input-error')
    })
    const hasConflict = errorUnits.length > 0
    setAddDisabled(hasConflict, 'conflict')
    updateAddAvailability()
    if (errorInputsByUnit && typeof errorInputsByUnit.forEach === 'function') {
      errorInputsByUnit.forEach((inputs) => {
        inputs.forEach((input) => input.classList.add('go-unit-input-error'))
      })
      return
    }
    if (!errorUnits.length) return
    errorUnits.forEach((unit) => {
      tbodyEl
        .querySelectorAll(`input.go-unit-input[data-unit="${unit}"]`)
        .forEach((input) => {
          const v = String(input.value || '').trim()
          if (v === '-1' || v === 'all') input.classList.add('go-unit-input-error')
        })
    })
  }
  plannerTemplates.addEventListener('go:footer:error', onFooterError)
  const onSpeedConflict = (e) => {
    const hasConflict = !!e?.detail?.hasConflict
    const speedErrorInputs = Array.isArray(e?.detail?.speedErrorInputs)
      ? e.detail.speedErrorInputs
      : []
    tbodyEl
      .querySelectorAll('input.go-unit-input.go-unit-input-speed-error')
      .forEach((input) => input.classList.remove('go-unit-input-speed-error'))
    speedErrorInputs.forEach((input) => input.classList.add('go-unit-input-speed-error'))
    setAddDisabled(hasConflict, 'speed')
    updateAddAvailability()
  }
  plannerTemplates.addEventListener('go:speed:conflict', onSpeedConflict)
  const onPaladinConflict = (e) => {
    const hasConflict = !!e?.detail?.hasConflict
    const paladinInputs = Array.isArray(e?.detail?.paladinInputs) ? e.detail.paladinInputs : []
    tbodyEl
      .querySelectorAll('input.go-unit-input.go-unit-input-paladin-error')
      .forEach((input) => input.classList.remove('go-unit-input-paladin-error'))
    if (hasConflict) {
      paladinInputs.forEach((input) => input.classList.add('go-unit-input-paladin-error'))
    }
    setAddDisabled(hasConflict, 'paladin')
    updateAddAvailability()
  }
  plannerTemplates.addEventListener('go:paladin:conflict', onPaladinConflict)
  const onSnobWarn = (e) => {
    const hasWarn = !!e?.detail?.hasWarn
    const snobInputs = Array.isArray(e?.detail?.snobInputs) ? e.detail.snobInputs : []
    tbodyEl
      .querySelectorAll('input.go-unit-input.go-unit-input-snob-warn')
      .forEach((input) => input.classList.remove('go-unit-input-snob-warn'))
    if (hasWarn) {
      snobInputs.forEach((input) => input.classList.add('go-unit-input-snob-warn'))
    }
  }
  plannerTemplates.addEventListener('go:snob:warn', onSnobWarn)
  const onTemplateTypeChanged = () => {
    syncSecondaryRowsConstraints()
  }
  plannerTemplates.addEventListener('go:type:changed', onTemplateTypeChanged)

  const setRowCount = (count = 1) => {
    let target = Number(count)
    if (!Number.isFinite(target) || target < 1) target = 1
    trsEl = Array.from(tbodyEl.querySelectorAll('tr'))
    while (trsEl.length < target) {
      insert()
      trsEl = Array.from(tbodyEl.querySelectorAll('tr'))
      if (trsEl.length >= 5) break
    }
    while (trsEl.length > target) {
      const last = trsEl[trsEl.length - 1]
      remove(last)
      trsEl = Array.from(tbodyEl.querySelectorAll('tr'))
    }
  }

  const destroy = () => {
    tbodyEl.removeEventListener('click', onClickTbody)
    tbodyEl.removeEventListener('input', onInputChange)
    tbodyEl.removeEventListener('change', onInputChange)
    plannerTemplates.removeEventListener('go:thead:toggle', onTheadToggle)
    plannerTemplates.removeEventListener('go:template:useall', onTemplateUseAll)
    plannerTemplates.removeEventListener('go:footer:error', onFooterError)
    plannerTemplates.removeEventListener('go:speed:conflict', onSpeedConflict)
    plannerTemplates.removeEventListener('go:paladin:conflict', onPaladinConflict)
    plannerTemplates.removeEventListener('go:snob:warn', onSnobWarn)
    plannerTemplates.removeEventListener('go:type:changed', onTemplateTypeChanged)
  }

  syncSecondaryRowsConstraints()
  updateAddAvailability()
  return { destroy, setRowCount }
}

export { renderTbodyTrFirstTd }
