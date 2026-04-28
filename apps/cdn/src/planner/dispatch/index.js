import './style.css'
import dispatchButtonsHtml from './index.html'
import { ICON_CALENDAR } from '../../components/go-buttons/calendar'
import { ICON_CROSSED_SWORDS } from '../../components/go-buttons/crossed-swords'

const normalizeMode = (mode) => mode === 'send' ? 'send' : 'schedule'
const UNIT_ICON_BASE = 'https://dsbr.innogamescdn.com/asset/540228b3/graphic/unit'

function getCommandPreviewLabels(commandType) {
  const isSupport = String(commandType || '').trim().toLowerCase() === 'support'
  return isSupport
    ? { singular: 'apoio', plural: 'apoios', short: 'SUP' }
    : { singular: 'ataque', plural: 'ataques', short: 'ATK' }
}

function getExecuteActionLabel(mode, commandType) {
  const normalizedMode = normalizeMode(mode)
  const labels = getCommandPreviewLabels(commandType)
  const action = normalizedMode === 'schedule' ? 'Agendar' : 'Enviar'
  const target = labels.singular.charAt(0).toUpperCase() + labels.singular.slice(1)
  return `${action} ${target}(s)`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatUnitEstimateValue(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return ''
  const roundedInt = Math.round(num)
  const isIntLike = Math.abs(num - roundedInt) < 0.0000001
  if (isIntLike) return roundedInt.toLocaleString('pt-BR')
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })
}

function formatUnitEstimateIntValue(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return ''
  return Math.floor(num).toLocaleString('pt-BR')
}

function renderEstimateUnitGrid(title, units = {}, unitOrder = [], summary = {}, options = {}) {
  const integerOnly = Boolean(options?.integerOnly)
  const formatValue = integerOnly ? formatUnitEstimateIntValue : formatUnitEstimateValue
  const valuePrefix = String(options?.valuePrefix || '')
  const titleHint = String(options?.titleHint || '').trim()
  const items = (Array.isArray(unitOrder) ? unitOrder : [])
    .map((unit) => {
      const raw = Number(units?.[unit])
      if (!Number.isFinite(raw) || raw <= 0) return ''
      const value = formatValue(raw)
      if (!value) return ''
      const safeUnit = escapeHtml(unit)
      return `
        <div class="go-dispatch-estimate-unit" data-unit="${safeUnit}">
          <img src="${UNIT_ICON_BASE}/unit_${safeUnit}.webp" alt="${safeUnit}">
          <span>${escapeHtml(valuePrefix)}${value}</span>
        </div>
      `
    })
    .filter(Boolean)

  return `
    <div class="go-dispatch-estimate-card">
      <div class="go-dispatch-estimate-card-title"${titleHint ? ` data-title="${escapeHtml(titleHint)}"` : ''}>${escapeHtml(title)}</div>
      <div class="go-dispatch-estimate-unit-grid">
        ${items.length ? items.join('') : '<div class="go-dispatch-estimate-empty">Sem tropas</div>'}
      </div>
      <div class="go-dispatch-estimate-card-footer">
        <div class="go-dispatch-estimate-total-line">
          <span>Total unidades:</span>
          <strong>${escapeHtml(valuePrefix)}${formatValue(summary?.units) || '0'}</strong>
        </div>
        <div class="go-dispatch-estimate-total-line">
          <span>Total fazenda:</span>
          <strong>${escapeHtml(valuePrefix)}${formatValue(summary?.farm) || '0'}</strong>
        </div>
      </div>
    </div>
  `
}

function isPromiseLike(value) {
  return Boolean(value) && typeof value.then === 'function'
}

function getExecuteConfirmEstimateCandidate(context = {}) {
  return (
    typeof context?.selectionFirstAttackEstimateBuilder === 'function'
      ? context.selectionFirstAttackEstimateBuilder(context?.executeConfirmOptions || {})
      : context?.selectionFirstAttackEstimate
  )
}

function renderExecuteConfirmEstimate(context = {}, estimate = null) {
  if (!estimate) return ''
  const unitOrder = Array.isArray(estimate?.unitOrder) ? estimate.unitOrder : []
  const isMulti = String(context?.targetScope || '') === 'multi'
  const labels = getCommandPreviewLabels(context?.commandType)
  const singularTitle = `${labels.singular.charAt(0).toUpperCase()}${labels.singular.slice(1)}`
  if (isMulti) {
    const avgAttacksPerTarget = Number(estimate?.multi?.avgAttacksPerTarget || 0)
    const totalCard = renderEstimateUnitGrid(
      '~ Total/Alvo',
      estimate?.multi?.unitsApproxTotalPerTarget || {},
      unitOrder,
      {
        units: estimate?.multi?.approxTotalTroopsPerTarget || 0,
        farm: estimate?.multi?.approxTotalFarmPerTarget || 0
      },
      {
        integerOnly: true,
        valuePrefix: '~ ',
        titleHint: `Estimado pela média de ${labels.plural} por alvo (total comandos ÷ alvos ativos) x média do 1º ${labels.singular} do modelo.`
      }
    )
    const avgCard = renderEstimateUnitGrid(
      `Média/${singularTitle} (1º ${labels.short})`,
      estimate?.unitsAverage || {},
      unitOrder,
      {
        units: estimate?.averageTroops || 0,
        farm: estimate?.averageFarm || 0
      },
      { integerOnly: true, valuePrefix: '~ ' }
    )
    const avgAttacksLabel = formatUnitEstimateValue(avgAttacksPerTarget) || '0'
    return `
      <div class="go-dispatch-confirm-line">
        <strong>~ Média ${escapeHtml(labels.plural)}/alvo:</strong> ${avgAttacksLabel}
      </div>
      <div class="go-dispatch-estimate-wrap">
        ${totalCard}
        ${avgCard}
      </div>
    `
  }
  const totalCard = renderEstimateUnitGrid(
    `Total (1º ${labels.short})`,
    estimate?.unitsTotal || {},
    unitOrder,
    {
      units: estimate?.totalTroops || 0,
      farm: estimate?.totalFarm || 0
    }
  )
  const avgCard = renderEstimateUnitGrid(
    `Média/${singularTitle} (1º ${labels.short})`,
    estimate?.unitsAverage || {},
    unitOrder,
    {
      units: estimate?.averageTroops || 0,
      farm: estimate?.averageFarm || 0
    },
    { integerOnly: true }
  )
  return `
    <div class="go-dispatch-estimate-wrap">
      ${totalCard}
      ${avgCard}
    </div>
  `
}

export function createDispatch(el, config = {}) {
  if (!el) return null
  if (el.querySelector('.go-dispatch')) return null

  const {
    actions = {},
    getContext = () => ({}),
    getMode = () => 'schedule',
    getExecuteConfirmSchema = () => []
  } = config

  const dispatchEl = document.createElement('div')
  dispatchEl.classList.add('go-dispatch')
  dispatchEl.insertAdjacentHTML('beforeend', dispatchButtonsHtml)

  const buttonsByCommand = new Map(
    Array.from(dispatchEl.querySelectorAll('[data-command-dispatch]')).map((button) => {
      return [button.dataset.commandDispatch, button]
    })
  )
  const executeButton = buttonsByCommand.get('execute') || null
  const executeButtonIcon = executeButton?.querySelector?.('[data-dispatch-icon]') || null
  const executeButtonLabel = executeButton?.querySelector?.('[data-dispatch-label]') || null
  const executeConfirmEl = document.createElement('div')
  executeConfirmEl.className = 'go-dispatch-confirm go-dd'
  executeConfirmEl.hidden = true
  executeConfirmEl.innerHTML = `
    <div class="go-dispatch-confirm-body" data-dispatch-confirm-body></div>
    <div class="go-dispatch-confirm-actions">
      <button type="button" class="go-dispatch-confirm-btn is-confirm" data-dispatch-confirm-action="confirm">Confirmar</button>
      <button type="button" class="go-dispatch-confirm-btn is-cancel" data-dispatch-confirm-action="cancel">Cancelar</button>
    </div>
  `
  dispatchEl.insertAdjacentElement('beforeend', executeConfirmEl)
  const executeConfirmBodyEl = executeConfirmEl.querySelector('[data-dispatch-confirm-body]') || null
  const manualDisabled = new Map()
  const manualDisabledTitle = new Map()
  const defaultTitle = new Map()
  buttonsByCommand.forEach((button, command) => {
    defaultTitle.set(command, button.getAttribute('data-title') || '')
  })
  let busy = false
  let executeConfirmOpen = false
  let executeConfirmEstimateSeq = 0
  const executeConfirmFieldValues = new Map()

  const findScrollableAncestor = (startEl) => {
    const popupContent = startEl?.closest?.('.popup_box_content')
    if (popupContent) return popupContent
    let node = startEl?.parentElement || null
    while (node && node !== document.body && node !== document.documentElement) {
      const style = window.getComputedStyle(node)
      const overflowY = String(style?.overflowY || '').toLowerCase()
      const canScroll = (
        (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
        && node.scrollHeight > node.clientHeight
      )
      if (canScroll) return node
      node = node.parentElement
    }
    return document.scrollingElement || document.documentElement || null
  }

  const getSelectedMode = () => normalizeMode(getMode?.())

  const normalizeConfirmFieldValue = (field, rawValue) => {
    const type = String(field?.type || '').trim().toLowerCase()
    if (type === 'boolean') return Boolean(rawValue)
    if (type === 'number') {
      const fallback = Number(field?.defaultValue)
      const min = Number(field?.min)
      const max = Number(field?.max)
      let next = Number(rawValue)
      if (!Number.isFinite(next)) next = Number.isFinite(fallback) ? fallback : 0
      next = Math.floor(next)
      if (Number.isFinite(min)) next = Math.max(Math.floor(min), next)
      if (Number.isFinite(max)) next = Math.min(Math.floor(max), next)
      return next
    }
    if (type === 'choice') {
      const options = Array.isArray(field?.options) ? field.options : []
      const fallback = options.length ? String(options[0]?.value ?? '') : ''
      const allowed = new Set(options.map((opt) => String(opt?.value ?? '')))
      const next = String(rawValue ?? '')
      return allowed.has(next) ? next : fallback
    }
    return rawValue
  }

  const getConfirmFieldSchemaForMode = (mode, context = null) => {
    const list = getExecuteConfirmSchema?.(mode, context || getContext(mode) || {})
    return Array.isArray(list) ? list.filter(Boolean) : []
  }

  const ensureConfirmFieldDefaults = (mode, context = null) => {
    const schema = getConfirmFieldSchemaForMode(mode, context)
    schema.forEach((field) => {
      const key = String(field?.key || '').trim()
      if (!key) return
      if (executeConfirmFieldValues.has(key)) {
        executeConfirmFieldValues.set(key, normalizeConfirmFieldValue(field, executeConfirmFieldValues.get(key)))
        return
      }
      executeConfirmFieldValues.set(key, normalizeConfirmFieldValue(field, field?.defaultValue))
    })
    return schema
  }

  const readExecuteConfirmFieldValuesFromDom = () => {
    const mode = getSelectedMode()
    const context = getContext(mode) || {}
    const schema = ensureConfirmFieldDefaults(mode, context)
    const schemaByKey = new Map(schema.map((field) => [String(field.key), field]))
    executeConfirmEl.querySelectorAll('[data-dispatch-confirm-field]').forEach((fieldEl) => {
      const key = String(fieldEl.getAttribute('data-dispatch-confirm-field') || '').trim()
      if (!key || !schemaByKey.has(key)) return
      const field = schemaByKey.get(key)
      const type = String(field?.type || '').trim().toLowerCase()
      if (type === 'boolean') {
        const input = fieldEl.querySelector('input[type="checkbox"]')
        executeConfirmFieldValues.set(key, normalizeConfirmFieldValue(field, !!input?.checked))
        return
      }
      if (type === 'choice') {
        const checkedRadio = fieldEl.querySelector('input[type="radio"]:checked')
        if (checkedRadio) {
          executeConfirmFieldValues.set(key, normalizeConfirmFieldValue(field, checkedRadio.value))
          return
        }
        const select = fieldEl.querySelector('select')
        executeConfirmFieldValues.set(key, normalizeConfirmFieldValue(field, select?.value))
        return
      }
      if (type === 'number') {
        const input = fieldEl.querySelector('input[type="number"]')
        executeConfirmFieldValues.set(key, normalizeConfirmFieldValue(field, input?.value))
      }
    })
  }

  const collectExecuteConfirmValuesFromSchema = (schema = []) => {
    const values = {}
    ;(Array.isArray(schema) ? schema : []).forEach((field) => {
      const key = String(field?.key || '').trim()
      if (!key) return
      values[key] = normalizeConfirmFieldValue(field, executeConfirmFieldValues.get(key))
    })
    return values
  }

  const buildContextWithExecuteConfirmOptions = (mode) => {
    const baseContext = getContext(mode) || {}
    const baseSchema = ensureConfirmFieldDefaults(mode, baseContext)
    const baseValues = collectExecuteConfirmValuesFromSchema(baseSchema)
    const nextContext = Object.keys(baseValues).length > 0
      ? { ...baseContext, executeConfirmOptions: baseValues }
      : baseContext
    const finalSchema = ensureConfirmFieldDefaults(mode, nextContext)
    const finalValues = collectExecuteConfirmValuesFromSchema(finalSchema)
    return {
      context: Object.keys(finalValues).length > 0
        ? { ...baseContext, executeConfirmOptions: finalValues }
        : baseContext,
      schema: finalSchema
    }
  }

  const getExecuteConfirmOptionsValues = (mode) => {
    const { schema } = buildContextWithExecuteConfirmOptions(mode)
    if (!schema.length) return {}
    return collectExecuteConfirmValuesFromSchema(schema)
  }

  const renderExecuteConfirmOptions = (mode, context = {}) => {
    if (!executeConfirmBodyEl) return
    const schema = ensureConfirmFieldDefaults(mode, context)
    if (!schema.length) return

    const wrap = document.createElement('div')
    wrap.className = 'go-dispatch-confirm-options'

    schema.forEach((field) => {
      const key = String(field?.key || '').trim()
      if (!key) return
      const type = String(field?.type || '').trim().toLowerCase()
      const row = document.createElement('div')
      row.className = 'go-dispatch-confirm-field'
      row.setAttribute('data-dispatch-confirm-field', key)

      const labelEl = document.createElement('div')
      labelEl.className = 'go-dispatch-confirm-field-label'
      labelEl.textContent = String(field?.label || key)
      row.appendChild(labelEl)

      if (type === 'boolean') {
        const toggle = document.createElement('label')
        toggle.className = 'go-dispatch-confirm-check'
        const input = document.createElement('input')
        input.type = 'checkbox'
        input.checked = Boolean(executeConfirmFieldValues.get(key))
        const text = document.createElement('span')
        text.textContent = String(field?.checkboxLabel || 'Ativar')
        toggle.appendChild(input)
        toggle.appendChild(text)
        row.appendChild(toggle)
      } else if (type === 'choice') {
        const options = Array.isArray(field?.options) ? field.options.filter(Boolean) : []
        const currentValue = String(executeConfirmFieldValues.get(key) ?? '')
        if (options.length <= 3) {
          const radioGroup = document.createElement('div')
          radioGroup.className = 'go-dispatch-confirm-radio-group'
          options.forEach((option, index) => {
            const value = String(option?.value ?? '')
            const radioLabel = document.createElement('label')
            radioLabel.className = 'go-dispatch-confirm-radio'
            const input = document.createElement('input')
            input.type = 'radio'
            input.name = `go-dispatch-confirm-${key}`
            input.value = value
            input.checked = value === currentValue || (!currentValue && index === 0)
            const text = document.createElement('span')
            text.textContent = String(option?.label || value)
            radioLabel.appendChild(input)
            radioLabel.appendChild(text)
            radioGroup.appendChild(radioLabel)
          })
          row.appendChild(radioGroup)
        } else {
          const select = document.createElement('select')
          select.className = 'go-dispatch-confirm-select'
          options.forEach((option) => {
            const value = String(option?.value ?? '')
            const optionEl = document.createElement('option')
            optionEl.value = value
            optionEl.textContent = String(option?.label || value)
            if (value === currentValue) optionEl.selected = true
            select.appendChild(optionEl)
          })
          row.appendChild(select)
        }
      } else if (type === 'number') {
        const controls = document.createElement('div')
        controls.className = 'go-dispatch-confirm-number-row'
        const input = document.createElement('input')
        input.type = 'number'
        input.className = 'go-dispatch-confirm-number'
        input.inputMode = 'numeric'
        input.step = '1'
        if (Number.isFinite(Number(field?.min))) input.min = String(Math.floor(Number(field.min)))
        if (Number.isFinite(Number(field?.max))) input.max = String(Math.floor(Number(field.max)))
        input.value = String(normalizeConfirmFieldValue(field, executeConfirmFieldValues.get(key)))
        controls.appendChild(input)

        const buttons = Array.isArray(field?.buttons) ? field.buttons.filter((button) => button && button.hidden !== true) : []
        if (buttons.length) {
          const actions = document.createElement('div')
          actions.className = 'go-dispatch-confirm-number-actions'
          buttons.forEach((button) => {
            const actionBtn = document.createElement('button')
            actionBtn.type = 'button'
            actionBtn.className = `go-dispatch-confirm-pill${button?.variant ? ` is-${button.variant}` : ''}`
            actionBtn.setAttribute('data-dispatch-confirm-fill', key)
            actionBtn.setAttribute('data-dispatch-confirm-fill-value', String(button?.value ?? ''))
            actionBtn.textContent = String(button?.label || button?.value || '')
            actions.appendChild(actionBtn)
          })
          controls.appendChild(actions)
        }
        row.appendChild(controls)
      }

      if (field?.hint) {
        const hintEl = document.createElement('div')
        hintEl.className = 'go-dispatch-confirm-field-hint'
        hintEl.textContent = String(field.hint)
        row.appendChild(hintEl)
      }

      wrap.appendChild(row)
    })

    if (wrap.childElementCount > 0) {
      executeConfirmBodyEl.appendChild(wrap)
    }
  }

  const applyButtonState = (command) => {
    const button = buttonsByCommand.get(command)
    if (!button) return
    const isManualDisabled = manualDisabled.get(command) === true
    const isDisabled = busy || isManualDisabled
    button.disabled = isDisabled
    const title = isManualDisabled ? String(manualDisabledTitle.get(command) || '').trim() : ''
    if (title) {
      button.setAttribute('data-title', title)
      return
    }
    const fallbackTitle = String(defaultTitle.get(command) || '').trim()
    if (fallbackTitle) button.setAttribute('data-title', fallbackTitle)
    else button.removeAttribute('data-title')
  }

  const closeExecuteConfirm = () => {
    executeConfirmEstimateSeq += 1
    executeConfirmOpen = false
    executeConfirmEl.hidden = true
    dispatchEl.classList.remove('is-confirm-open')
    executeButton?.setAttribute('aria-expanded', 'false')
  }

  const renderExecuteConfirmEstimateAsync = async (context = {}, seq = 0) => {
    if (!executeConfirmBodyEl) return
    const slot = executeConfirmBodyEl.querySelector('[data-dispatch-estimate-slot]')
    if (!slot) return
    const estimateCandidate = getExecuteConfirmEstimateCandidate(context)
    if (!estimateCandidate) {
      slot.innerHTML = ''
      return
    }
    if (!isPromiseLike(estimateCandidate)) {
      slot.innerHTML = renderExecuteConfirmEstimate(context, estimateCandidate)
      ensureExecuteConfirmVisible()
      return
    }
    slot.innerHTML = '<div class="go-dispatch-confirm-line"><strong>Estimativa:</strong> calculando...</div>'
    try {
      const resolvedEstimate = await estimateCandidate
      if (seq !== executeConfirmEstimateSeq) return
      if (!executeConfirmBodyEl?.isConnected) return
      slot.innerHTML = renderExecuteConfirmEstimate(context, resolvedEstimate)
      positionExecuteConfirmByExecuteButton()
      ensureExecuteConfirmVisible()
    } catch (_) {
      if (seq !== executeConfirmEstimateSeq) return
      if (!executeConfirmBodyEl?.isConnected) return
      slot.innerHTML = ''
    }
  }

  const positionExecuteConfirmByExecuteButton = () => {
    if (!executeConfirmEl || executeConfirmEl.hidden || !dispatchEl || !executeButton) return
    const dispatchRect = dispatchEl.getBoundingClientRect()
    const buttonRect = executeButton.getBoundingClientRect()
    const panelWidth = executeConfirmEl.offsetWidth || 0
    if (!dispatchRect.width || !buttonRect.width || !panelWidth) return

    // Ancora pela direita para o painel crescer para a esquerda quando a largura variar.
    const preferredRight = Math.max(0, dispatchRect.right - buttonRect.right)
    const minRight = 4
    const maxRight = Math.max(minRight, dispatchRect.width - panelWidth - 4)
    const right = Math.min(Math.max(preferredRight, minRight), maxRight)

    executeConfirmEl.style.right = `${Math.round(right)}px`
    executeConfirmEl.style.left = 'auto'
  }

  const ensureExecuteConfirmVisible = () => {
    if (!executeConfirmOpen || !executeConfirmEl || executeConfirmEl.hidden) return
    const scrollContainer = findScrollableAncestor(dispatchEl)
    if (!scrollContainer || typeof scrollContainer.getBoundingClientRect !== 'function') return
    const panelRect = executeConfirmEl.getBoundingClientRect()
    const containerRect = scrollContainer.getBoundingClientRect()
    const margin = 8
    if (panelRect.bottom > containerRect.bottom) {
      const delta = Math.ceil(panelRect.bottom - containerRect.bottom + margin)
      scrollContainer.scrollTop += delta
    } else if (panelRect.top < containerRect.top) {
      const delta = Math.ceil(containerRect.top - panelRect.top + margin)
      scrollContainer.scrollTop -= delta
    }
  }

  const renderExecuteConfirmSummary = () => {
    if (!executeConfirmBodyEl) return
    const seq = ++executeConfirmEstimateSeq
    const mode = getSelectedMode()
    const { context } = buildContextWithExecuteConfirmOptions(mode)
    const scope = context?.targetScope === 'multi' ? 'Todos os Alvos' : 'Alvo Atual'
    const multiPlan = context?.multiTargetsPlan || { totalCommands: 0, activeTargets: 0 }
    const selectedRows = Array.isArray(context?.selectedVillageIds) ? context.selectedVillageIds.length : 0
    const rowsLine = `<span><strong>Selecionadas:</strong> ${selectedRows}</span>`
    if (scope === 'Todos os Alvos') {
      executeConfirmBodyEl.innerHTML = `
        <div class="go-dispatch-confirm-line"><strong>Escopo:</strong> ${scope}</div>
        <div class="go-dispatch-confirm-line"><strong>Alvos ativos:</strong> ${Number(multiPlan?.activeTargets || 0)}</div>
        <div class="go-dispatch-confirm-line"><strong>Total comandos:</strong> ${Number(multiPlan?.totalCommands || 0)}</div>
        <div class="go-dispatch-confirm-line">${rowsLine}</div>
      `
      renderExecuteConfirmOptions(mode, context)
      executeConfirmBodyEl.insertAdjacentHTML('beforeend', '<div data-dispatch-estimate-slot></div>')
      void renderExecuteConfirmEstimateAsync(context, seq)
      return
    }
    executeConfirmBodyEl.innerHTML = `
      <div class="go-dispatch-confirm-line"><strong>Escopo:</strong> ${scope}</div>
      <div class="go-dispatch-confirm-line">${rowsLine}</div>
    `
    renderExecuteConfirmOptions(mode, context)
    executeConfirmBodyEl.insertAdjacentHTML('beforeend', '<div data-dispatch-estimate-slot></div>')
    void renderExecuteConfirmEstimateAsync(context, seq)
  }

  const openExecuteConfirm = () => {
    if (!executeButton || executeButton.disabled || busy) return
    renderExecuteConfirmSummary()
    executeConfirmOpen = true
    executeConfirmEl.hidden = false
    positionExecuteConfirmByExecuteButton()
    ensureExecuteConfirmVisible()
    dispatchEl.classList.add('is-confirm-open')
    executeButton?.setAttribute('aria-expanded', 'true')
  }

  const toggleExecuteConfirm = () => {
    if (executeConfirmOpen) closeExecuteConfirm()
    else openExecuteConfirm()
  }

  const updateExecuteLabel = () => {
    if (!executeButton) return
    const mode = getSelectedMode()
    const isSchedule = mode === 'schedule'
    const context = getContext(mode) || {}
    const nextLabel = getExecuteActionLabel(mode, context?.commandType)
    const nextIcon = isSchedule ? ICON_CALENDAR : ICON_CROSSED_SWORDS

    if (executeButtonIcon) executeButtonIcon.setAttribute('src', nextIcon)
    if (executeButtonIcon) executeButtonIcon.classList.toggle('is-dispatch-sword', !isSchedule)
    if (executeButtonLabel) executeButtonLabel.textContent = nextLabel
    if (!executeButtonIcon || !executeButtonLabel) executeButton.textContent = nextLabel
  }

  const refreshButtons = () => {
    buttonsByCommand.forEach((_, command) => applyButtonState(command))
    updateExecuteLabel()
  }

  const setDisabled = (command, disabled, title = '') => {
    if (!buttonsByCommand.has(command)) return
    const isDisabled = Boolean(disabled)
    manualDisabled.set(command, isDisabled)
    if (isDisabled) manualDisabledTitle.set(command, String(title || '').trim())
    else manualDisabledTitle.delete(command)
    applyButtonState(command)
  }

  const setAllDisabled = (disabled, title = '') => {
    buttonsByCommand.forEach((_, command) => {
      const isDisabled = Boolean(disabled)
      manualDisabled.set(command, isDisabled)
      if (isDisabled) manualDisabledTitle.set(command, String(title || '').trim())
      else manualDisabledTitle.delete(command)
      applyButtonState(command)
    })
  }

  const setBusy = (nextBusy) => {
    busy = Boolean(nextBusy)
    if (busy) closeExecuteConfirm()
    dispatchEl.classList.toggle('is-busy', busy)
    refreshButtons()
  }

  const runCommandAction = async ({ button, command }) => {
    const action = actions?.[command]
    if (typeof action !== 'function') return
    if (button.disabled || busy) return
    const mode = getSelectedMode()
    const getActionContext = () => {
      const context = getContext(mode) || {}
      const executeConfirmOptions = getExecuteConfirmOptionsValues(mode)
      if (!executeConfirmOptions || Object.keys(executeConfirmOptions).length === 0) return context
      return {
        ...context,
        executeConfirmOptions
      }
    }
    try {
      setBusy(true)
      button.classList.add('is-loading')
      await action({
        command,
        mode,
        getContext: getActionContext,
        setDisabled,
        setAllDisabled,
        root: dispatchEl
      })
    } finally {
      button.classList.remove('is-loading')
      setBusy(false)
    }
  }

  const onClick = async (e) => {
    const fillButton = e.target?.closest?.('[data-dispatch-confirm-fill]')
    if (fillButton && executeConfirmEl.contains(fillButton)) {
      e.preventDefault?.()
      e.stopPropagation?.()
      const key = String(fillButton.getAttribute('data-dispatch-confirm-fill') || '').trim()
      const rawValue = fillButton.getAttribute('data-dispatch-confirm-fill-value')
      if (key) {
        const mode = getSelectedMode()
        const context = getContext(mode) || {}
        const schema = ensureConfirmFieldDefaults(mode, context)
        const field = schema.find((entry) => String(entry?.key || '').trim() === key)
        executeConfirmFieldValues.set(key, normalizeConfirmFieldValue(field, rawValue))
        renderExecuteConfirmSummary()
        positionExecuteConfirmByExecuteButton()
        ensureExecuteConfirmVisible()
      }
      return
    }
    const confirmActionBtn = e.target?.closest?.('[data-dispatch-confirm-action]')
    if (confirmActionBtn && dispatchEl.contains(confirmActionBtn)) {
      const kind = confirmActionBtn.getAttribute('data-dispatch-confirm-action')
      if (kind === 'cancel') {
        closeExecuteConfirm()
        return
      }
      if (kind === 'confirm' && executeButton) {
        readExecuteConfirmFieldValuesFromDom()
        closeExecuteConfirm()
        await runCommandAction({ button: executeButton, command: 'execute' })
        return
      }
    }

    const button = e.target?.closest?.('[data-command-dispatch]')
    if (!button || !dispatchEl.contains(button)) return

    const command = button.dataset.commandDispatch
    if (!command) return
    if (command === 'execute') {
      toggleExecuteConfirm()
      return
    }
    await runCommandAction({ button, command })
  }

  const onDocumentPointerDown = (e) => {
    if (!executeConfirmOpen) return
    const target = e.target
    if (target && executeConfirmEl.contains(target)) return
    if (target && executeButton && executeButton.contains(target)) return
    closeExecuteConfirm()
  }

  const onWindowResize = () => {
    if (!executeConfirmOpen) return
    positionExecuteConfirmByExecuteButton()
    ensureExecuteConfirmVisible()
  }

  const onConfirmFormChange = () => {
    readExecuteConfirmFieldValuesFromDom()
    renderExecuteConfirmSummary()
    positionExecuteConfirmByExecuteButton()
    ensureExecuteConfirmVisible()
  }

  const destroy = () => {
    dispatchEl.removeEventListener('click', onClick)
    executeConfirmEl.removeEventListener('change', onConfirmFormChange)
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
    window.removeEventListener('resize', onWindowResize)
  }

  dispatchEl.addEventListener('click', onClick)
  executeConfirmEl.addEventListener('change', onConfirmFormChange)
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  window.addEventListener('resize', onWindowResize)
  el.insertAdjacentElement('beforeend', dispatchEl)
  refreshButtons()
  return {
    destroy,
    setDisabled,
    setAllDisabled,
    closeConfirm: closeExecuteConfirm,
    getMode: getSelectedMode,
    refreshButtons,
    root: dispatchEl
  }
}
