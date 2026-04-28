import './style.css'
import textHtml from './index.html'
import { renderDropdown } from './dropdown';
import { renderTheadTh } from './thead';
import { renderTbodyTrFirstTd } from './tbody';
import { createBuildTargetRadio } from './buildTarget';
import { plannerTemplates, getTemplates, setTemplates, getState, setState, readyPlannerTemplatesStorage } from '../index';
import { renderTroopTemplatesTW } from './troopTemplates';
import { renderTfootTotals } from './tfoot';
import { createTemplateError } from './templateError';
import { getGameData } from '@toolkit-tw-bot/document';
import { createActionDropdown } from '../../../components/dropdown';
import { printMessage } from '../../../components/printMessage';
import { extensionId } from '@toolkit-tw-bot/release';

const getCurrentGameData = () => {
  if (typeof window !== "undefined" && typeof window.game_data !== "undefined") {
    return window.game_data
  }

  if (typeof document === "undefined") return null

  return getGameData()
}

const gameData = getCurrentGameData()
const DEFAULT_BOT_ICON_URL = `chrome-extension://${extensionId}/icons/ico.green.128.png`;

let selectedTemplateId = null

function normalizeSafeIconUrl(value = '') {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^chrome-extension:\/\/invalid\/?/i.test(url)) return ''
  if (/^chrome-extension:\/\/[a-p]{32}\//i.test(url)) return url
  if (/^https?:\/\//i.test(url)) return url
  if (/^data:image\//i.test(url)) return url
  return ''
}

export async function plannerTemplatesView(popUpBoxContent, dataUnits, options = {}) {
  await readyPlannerTemplatesStorage()
  const plannerTemplatesEl = document.createElement('div');
  plannerTemplatesEl.insertAdjacentHTML('beforeend', textHtml);
  plannerTemplatesEl.classList.add('go-unit-content');
  const titleGoLogoEl = popUpBoxContent?.querySelector?.('.go-village-content #go-logo') || null
  const safeTemplateLogo = normalizeSafeIconUrl(
    titleGoLogoEl?.getAttribute?.('src') || titleGoLogoEl?.src || ''
  ) || normalizeSafeIconUrl(window?.ICON_48_GREEN_URL || window?.ICON_48_URL)
    || DEFAULT_BOT_ICON_URL
  const templateLogoEl = plannerTemplatesEl.querySelector('#go-logo')
  if (templateLogoEl) {
    templateLogoEl.setAttribute('src', safeTemplateLogo)
    templateLogoEl.onerror = () => {
      templateLogoEl.onerror = null
      templateLogoEl.setAttribute('src', DEFAULT_BOT_ICON_URL)
    }
  }
  const initialComponentStateExternal = (options?.initialComponentState && typeof options.initialComponentState === 'object')
    ? options.initialComponentState
    : null
  const onComponentStateChange = typeof options?.onComponentStateChange === 'function'
    ? options.onComponentStateChange
    : null

  let twTemplatesById = new Map()
  const units = (gameData?.units || []).filter((id) => id !== 'militia')
  const lockedUnits = new Set(['knight', 'snob'])
  let isTypeLocked = false
  let lastTemplateStats = null
  let lastTemplateStatsAny = null
  let lastTemplateSeq = 0
  const modeTitleEl = plannerTemplatesEl.querySelector('.go-template-mode .go-btn-link h4')
  const templateNameInput = plannerTemplatesEl.querySelector('#go-input-template-name')
  const twSelect = plannerTemplatesEl.querySelector('#tw-template')
  let saveTimer = null
  let isRestoring = false
  const supportModeBtn = plannerTemplatesEl.querySelector('button[name="commandMode"][data-command-mode="support"]')

  const getComponentState = () => getState('templates-component', null)
  const setComponentState = (state) => setState('templates-component', state)
  const modeButtons = Array.from(plannerTemplatesEl.querySelectorAll('button[name="commandMode"][data-command-mode]'))
  const normalizeCommandMode = (mode) => {
    const raw = String(mode || '').trim().toLowerCase()
    if (raw === 'support' || raw === 'defense') return 'support'
    return 'attack'
  }
  const getCommandModeLabel = (mode) => (normalizeCommandMode(mode) === 'support' ? 'Apoio' : 'Ataque')
  const isPaladinInputEl = (input) => input?.matches?.('input.go-unit-input[data-unit="paladin"], input.go-unit-input[data-unit="knight"]')
  const normalizePaladinValue = (raw) => {
    const text = String(raw ?? '').trim()
    if (!text) return ''
    if (text === '-1' || text === 'all') return '1'
    const num = Number(text)
    if (!Number.isFinite(num)) return ''
    if (num <= 0) return '0'
    return String(Math.min(1, Math.floor(num)))
  }
  const setCommandMode = (mode) => {
    const next = normalizeCommandMode(mode)
    modeButtons.forEach((btn) => {
      const selected = btn.dataset.commandMode === next
      btn.classList.toggle('is-selected', selected)
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false')
    })
    plannerTemplatesEl.dataset.commandMode = next
    plannerTemplatesEl.classList.toggle('go-mode-support', next === 'support')
    if (modeTitleEl) modeTitleEl.textContent = `>>> Modelo de Tropas (${getCommandModeLabel(next)})`
    return next
  }
  const getCommandMode = () => {
    const selected = modeButtons.find((btn) => btn.classList.contains('is-selected'))
    return selected?.dataset?.commandMode || plannerTemplatesEl.dataset.commandMode || 'attack'
  }
  const extractTemplateIdFromDocId = (docId) => {
    const raw = String(docId || '').trim()
    if (!raw) return null
    const tail = raw.split(':').pop() || ''
    return tail || null
  }
  const getTemplateMode = (tpl) => {
    const mode = String(tpl?.commandMode || '').trim().toLowerCase()
    if (mode === 'attack' || mode === 'support') return mode
    if (mode === 'defense') return 'support'
    const legacyType = String(tpl?.commandType || '').trim().toLowerCase()
    if (legacyType === 'support' || legacyType === 'defense') return 'support'
    return 'attack'
  }
  const normalizeStoredTemplates = (list = []) => {
    let changed = false
    const normalized = (Array.isArray(list) ? list : [])
      .map((tpl) => {
        if (!tpl || typeof tpl !== 'object') {
          changed = true
          return null
        }
        const next = { ...tpl }
        const mode = getTemplateMode(next)
        if (next.commandMode !== mode) {
          next.commandMode = mode
          changed = true
        }
        if (!Array.isArray(next.units)) {
          next.units = [...units]
          changed = true
        }
        if (!Array.isArray(next.values)) {
          next.values = []
          changed = true
        }
        return next
      })
      .filter(Boolean)
    return { normalized, changed }
  }
  const { normalized: initialTemplates, changed: initialTemplatesChanged } =
    normalizeStoredTemplates(getTemplates())
  let storedTemplates = initialTemplates
  if (initialTemplatesChanged) {
    setTemplates(storedTemplates)
  }
  const applyCommandModeRules = ({ emitUnitsChanged = false } = {}) => {
    let changed = false
    const paladinInputs = Array.from(
      plannerTemplatesEl.querySelectorAll('input.go-unit-input[data-unit="paladin"], input.go-unit-input[data-unit="knight"]')
    )
    paladinInputs.forEach((input) => {
      input.setAttribute('min', '0')
      input.setAttribute('max', '1')
      const nextValue = normalizePaladinValue(input.value)
      if (String(input.value ?? '') !== nextValue) {
        input.value = nextValue
        changed = true
      }
    })
    if (changed && emitUnitsChanged) {
      plannerTemplatesEl.dispatchEvent(new CustomEvent('go:units:changed', { bubbles: true }))
    }
  }

  const ensureTypeDefault = () => {
    const selected = plannerTemplatesEl.querySelector('button.go-radio.go-btselected[data-type]')
    if (selected) {
      plannerTemplatesEl.dataset.templateType = selected.dataset.type || 'value'
      return
    }
    const defaultBtn = plannerTemplatesEl.querySelector('button.go-radio[data-type="value"]')
    if (defaultBtn) defaultBtn.classList.add('go-btselected')
    plannerTemplatesEl.dataset.templateType = 'value'
  }
  const getTemplateType = () => {
    const selected = plannerTemplatesEl.querySelector('button.go-radio.go-btselected[data-type]')
    return selected?.dataset?.type || plannerTemplatesEl.dataset.templateType || 'value'
  }
  const setTemplateType = (type) => {
    const next = type === 'percent' ? 'percent' : 'value'
    const btns = Array.from(plannerTemplatesEl.querySelectorAll('button.go-radio[data-type]'))
    btns.forEach((btn) => {
      btn.classList.toggle('go-btselected', btn.dataset.type === next)
    })
    plannerTemplatesEl.dataset.templateType = next
  }
  const updateInputConstraints = (type) => {
    const inputs = plannerTemplatesEl.querySelectorAll('input.go-unit-input[data-unit]')
    const twLabel = plannerTemplatesEl.querySelector('label[for="tw-template"]')
    const twSelectEl = plannerTemplatesEl.querySelector('#tw-template')
    const twIcon = plannerTemplatesEl.querySelector('img[name="go-add-model-tw"]')
    inputs.forEach((input) => {
      const unit = input.dataset.unit
      if (input.dataset.minDefault === undefined) {
        input.dataset.minDefault = input.getAttribute('min') ?? ''
      }
      if (type === 'percent') {
        if (lockedUnits.has(unit)) {
          if (input.dataset.prevTitle === undefined) {
            input.dataset.prevTitle = input.dataset.title ?? ''
          }
          input.dataset.title = 'Paladino e nobre são sempre valor'
          input.classList.add('go-unit-percent-locked')
          const minDefault = input.dataset.minDefault
          if (minDefault !== '') input.setAttribute('min', minDefault)
          else input.removeAttribute('min')
          input.removeAttribute('max')
        } else {
          input.setAttribute('min', '0')
          input.setAttribute('max', '100')
        }
      } else {
        const minDefault = input.dataset.minDefault
        if (minDefault !== '') input.setAttribute('min', minDefault)
        else input.removeAttribute('min')
        input.removeAttribute('max')
        if (lockedUnits.has(unit)) {
          input.classList.remove('go-unit-percent-locked')
          if (input.dataset.prevTitle !== undefined) {
            if (input.dataset.prevTitle) {
              input.dataset.title = input.dataset.prevTitle
            } else {
              delete input.dataset.title
            }
            delete input.dataset.prevTitle
          }
        }
      }
    })
    const disableTw = type === 'percent'
    if (twSelectEl) {
      twSelectEl.disabled = disableTw
      if (disableTw) {
        if (twSelectEl.dataset.prevTitle === undefined) {
          twSelectEl.dataset.prevTitle = twSelectEl.dataset.title ?? ''
        }
        twSelectEl.dataset.title = 'Não aceita %'
      } else if (twSelectEl.dataset.prevTitle !== undefined) {
        if (twSelectEl.dataset.prevTitle) {
          twSelectEl.dataset.title = twSelectEl.dataset.prevTitle
        } else {
          delete twSelectEl.dataset.title
        }
        delete twSelectEl.dataset.prevTitle
      }
    }
    if (twLabel) {
      if (disableTw) {
        twLabel.setAttribute('aria-disabled', 'true')
        if (twLabel.dataset.prevTitle === undefined) {
          twLabel.dataset.prevTitle = twLabel.dataset.title ?? ''
        }
        twLabel.dataset.title = 'Não aceita %'
      } else {
        twLabel.removeAttribute('aria-disabled')
        if (twLabel.dataset.prevTitle !== undefined) {
          if (twLabel.dataset.prevTitle) {
            twLabel.dataset.title = twLabel.dataset.prevTitle
          } else {
            delete twLabel.dataset.title
          }
          delete twLabel.dataset.prevTitle
        }
      }
    }
    if (twIcon) {
      const disableTwIcon = type === 'percent'
      if (disableTwIcon) {
        if (twIcon.dataset.prevTitle === undefined) {
          twIcon.dataset.prevTitle = twIcon.dataset.title ?? ''
        }
        twIcon.dataset.title = 'Não aceita %'
        twIcon.setAttribute('aria-disabled', 'true')
      } else {
        twIcon.removeAttribute('aria-disabled')
        if (twIcon.dataset.prevTitle !== undefined) {
          if (twIcon.dataset.prevTitle) {
            twIcon.dataset.title = twIcon.dataset.prevTitle
          } else {
            delete twIcon.dataset.title
          }
          delete twIcon.dataset.prevTitle
        }
      }
    }
  }
  const updateTypeAvailability = (force = false) => {
    const rows = plannerTemplatesEl.querySelectorAll('tbody tr')
    const locked = rows.length > 1
    if (!force && locked === isTypeLocked) return
    isTypeLocked = locked
    plannerTemplatesEl.classList.toggle('go-type-locked', locked)
  }
  const getFirstRowMeta = () => {
    const rows = Array.from(plannerTemplatesEl.querySelectorAll('tbody tr'))
    if (rows.length !== 1) return null
    const firstRow = rows[0]
    const inputs = Array.from(firstRow.querySelectorAll('input.go-unit-input[data-unit]'))
    return { inputs }
  }
  const clearFirstRowValues = (inputs) => {
    inputs.forEach((input) => {
      input.value = ''
      input.disabled = false
      input.classList.remove('go-unit-input-all')
      input.type = 'number'
      delete input.dataset.prevType
      delete input.dataset.prevValue
    })
    plannerTemplatesEl.dispatchEvent(
      new CustomEvent('go:template:useall', {
        bubbles: true,
        detail: { units: [] }
      })
    )
  }
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
  const collectValues = () => {
    const rows = Array.from(plannerTemplatesEl.querySelectorAll('tbody tr'))
    return rows.map((row) =>
      units.map((unit) => {
        const input = row.querySelector(`input.go-unit-input[data-unit="${unit}"]`)
        return normalizeValue(input?.value, unit)
      })
    )
  }
  const clearOrConvertFirstRow = () => {
    const meta = getFirstRowMeta()
    if (!meta) return false
    clearFirstRowValues(meta.inputs)
    return true
  }
  const buildTemplate = (name, existingId = null, existingCreatedAt = null) => {
    const templateId = existingId || crypto.randomUUID()
    const nowIso = new Date().toISOString()
    const commandMode = getCommandMode()
    return {
      _id: `player:${gameData.player.id}:command:template:${commandMode}:${templateId}`,
      type: 'command:template',
      schemaVersion: 1,
      playerId: gameData.player.id,
      commandMode,
      name,
      templateType: getTemplateType(),
      buildTarget: (buildTarget.getSelected?.() || '').replace(/^building:/, '') || 'place',
      units,
      values: collectValues(),
      createdAt: existingCreatedAt || nowIso,
      updatedAt: nowIso,
    }
  }
  const isSameTemplate = (tpl) => {
    if (!tpl) return false
    const name = templateNameInput?.value?.trim() || ''
    if (name !== String(tpl.name || '')) return false
    const commandMode = getCommandMode()
    const tplCommandMode = getTemplateMode(tpl)
    if (commandMode !== tplCommandMode) return false
    const type = getTemplateType()
    const tplType = tpl.templateType || 'value'
    if (type !== tplType) return false
    const currentBuildTarget = (buildTarget.getSelected?.() || '').replace(/^building:/, '') || 'place'
    const tplBuildTarget = tpl.buildTarget || 'place'
    if (currentBuildTarget !== tplBuildTarget) return false
    const tplUnits = Array.isArray(tpl.units) ? tpl.units : []
    if (tplUnits.length !== units.length) return false
    for (let i = 0; i < units.length; i += 1) {
      if (tplUnits[i] !== units[i]) return false
    }
    const currentValues = collectValues()
    const tplValues = Array.isArray(tpl.values) ? tpl.values : []
    if (currentValues.length !== tplValues.length) return false
    for (let r = 0; r < currentValues.length; r += 1) {
      const row = currentValues[r]
      const tplRow = tplValues[r] || []
      if (row.length !== tplRow.length) return false
      for (let c = 0; c < row.length; c += 1) {
        if (Number(row[c]) !== Number(tplRow[c])) return false
      }
    }
    return true
  }
  const getRowsValues = () =>
    Array.from(plannerTemplatesEl.querySelectorAll('tbody tr')).map((row) =>
      units.map((unit) => {
        const input = row.querySelector(`input.go-unit-input[data-unit="${unit}"]`)
        return input ? String(input.value ?? '') : ''
      })
    )
  const buildComponentStateSnapshot = () => ({
    // name: templateNameInput?.value || '',
    commandMode: getCommandMode(),
    type: getTemplateType(),
    units: [...units],
    values: getRowsValues().map((row) => [...row]),
    buildTarget: (buildTarget.getSelected?.() || '').replace(/^building:/, '') || null,
    twTemplateId: twSelect?.value || '',
    selectedTemplateId
  })
  const saveComponentState = () => {
    if (abortCtrl.signal.aborted || isRestoring) return
    const state = buildComponentStateSnapshot()
    setComponentState(state)
    onComponentStateChange?.(state)
  }
  const scheduleSave = () => {
    if (isRestoring) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(saveComponentState, 50)
  }
  const restoreComponentState = (tbodyApi) => {
    const state = initialComponentStateExternal || getComponentState()
    if (!state) return
    isRestoring = true
    selectedTemplateId = state?.selectedTemplateId || null
    setCommandMode(state?.commandMode || 'attack')
    if (state.type) {
      setTemplateType(state.type)
      updateInputConstraints(state.type)
    }
    if (templateNameInput && typeof state.name === 'string') {
      templateNameInput.value = state.name
    }
    const restoredMode = normalizeCommandMode(state?.commandMode)
    const stateUnits = Array.isArray(state.units) ? state.units : units
    const rawStateValues = Array.isArray(state.values) ? state.values : []
    const stateValues = restoredMode === 'support' ? rawStateValues.slice(0, 1) : rawStateValues
    if (stateValues.length) {
      tbodyApi?.setRowCount?.(stateValues.length)
      const rows = Array.from(plannerTemplatesEl.querySelectorAll('tbody tr'))
      rows.forEach((row, rowIndex) => {
        const rowValues = stateValues[rowIndex] || []
        units.forEach((unit, unitIndex) => {
          const input = row.querySelector(`input.go-unit-input[data-unit="${unit}"]`)
          if (!input) return
          const idx = stateUnits.indexOf(unit)
          const raw = idx >= 0 ? rowValues[idx] : ''
          input.value = raw ?? ''
        })
      })
      const firstRowValues = stateValues[0] || []
      const currentType = state.type || getTemplateType()
      const allUnits = units.filter((unit) => {
        const idx = stateUnits.indexOf(unit)
        const raw = String(idx >= 0 ? firstRowValues[idx] : '').trim()
        if (currentType === 'percent') return raw === '100'
        return raw === '-1' || raw === 'all'
      })
      plannerTemplatesEl.dispatchEvent(
        new CustomEvent('go:template:useall', {
          bubbles: true,
          detail: { units: allUnits }
        })
      )
    }
    applyCommandModeRules({ emitUnitsChanged: false })
    const targetName = state.buildTarget ? `building:${state.buildTarget}` : 'building:place'
    buildTarget.select?.(targetName)
    if (twSelect && state.twTemplateId) {
      twSelect.value = state.twTemplateId
    }
    if (selectedTemplateId) {
      const tpl = storedTemplates.find((t) => t._id === selectedTemplateId)
      if (!tpl || !isSameTemplate(tpl)) {
        selectedTemplateId = null
        if (templateNameInput) templateNameInput.value = ''
      }
    } else if (state.name) {
      const hasMatch = storedTemplates.some((t) => isSameTemplate(t))
      if (!hasMatch && templateNameInput) {
        templateNameInput.value = ''
      }
    }
    plannerTemplatesEl.dispatchEvent(new CustomEvent('go:units:changed', { bubbles: true }))
    updateSaveDisabled()
    isRestoring = false
    updateTypeAvailability(true)
  }

  const applyTemplateToRow = (tr, template, options = {}) => {
    if (!tr || !template) return
    const inputs = tr.querySelectorAll('input.go-unit-input[data-unit]')
    inputs.forEach((input) => {
      const unit = input.dataset.unit
      const val = template?.[unit]
      input.value = val === undefined || val === null ? '' : String(val)
    })
    if (options.useAllAsMinusOne && Array.isArray(template.use_all)) {
      const unitSet = new Set(template.use_all)
      inputs.forEach((input) => {
        const unit = input.dataset.unit
        if (unitSet.has(unit)) input.value = '-1'
      })
    }
  }
  const applyStoredTemplate = (template) => {
    if (!template) return
    const templateMode = getTemplateMode(template)
    setCommandMode(templateMode)
    const type = template.templateType || 'value'
    setTemplateType(type)
    updateInputConstraints(type)
    const tplUnits = Array.isArray(template.units) ? template.units : []
    const rawValues = Array.isArray(template.values) ? template.values : []
    const values = templateMode === 'support' ? rawValues.slice(0, 1) : rawValues
    if (!values.length) return
    tbodyApi?.setRowCount?.(values.length)
    const rows = Array.from(plannerTemplatesEl.querySelectorAll('tbody tr'))
    rows.forEach((row, rowIndex) => {
      const rowValues = values[rowIndex] || []
      units.forEach((unit) => {
        const input = row.querySelector(`input.go-unit-input[data-unit="${unit}"]`)
        if (!input) return
        const idx = tplUnits.indexOf(unit)
        const raw = idx >= 0 ? rowValues[idx] : ''
        input.value = raw ?? ''
      })
    })
    const firstRowValues = values[0] || []
    const allUnits = units.filter((unit) => {
      const idx = tplUnits.indexOf(unit)
      const raw = String(idx >= 0 ? firstRowValues[idx] : '').trim()
      if (type === 'percent') return raw === '100'
      return raw === '-1' || raw === 'all'
    })
    plannerTemplatesEl.dispatchEvent(
      new CustomEvent('go:template:useall', {
        bubbles: true,
        detail: { units: allUnits }
      })
    )
    applyCommandModeRules({ emitUnitsChanged: false })
    const templateBuildTarget = template?.buildTarget || 'place'
    buildTarget.select?.(`building:${templateBuildTarget}`)
    plannerTemplatesEl.dispatchEvent(new CustomEvent('go:units:changed', { bubbles: true }))
  }

  renderTheadTh(plannerTemplatesEl, dataUnits);
  const tbodyApi = renderTbodyTrFirstTd(plannerTemplatesEl, dataUnits);
  const buildTarget = createBuildTargetRadio(plannerTemplatesEl);
  const abortCtrl = new AbortController();
  setCommandMode(getCommandMode())
  ensureTypeDefault()
  updateInputConstraints(getTemplateType())
  applyCommandModeRules({ emitUnitsChanged: false })
  updateTypeAvailability()
  const onBuildTargetToggle = (event) => {
    if (abortCtrl.signal.aborted) return
    if (getCommandMode() === 'support') {
      buildTarget.hidden()
      return
    }
    const show = !!event?.detail?.show
    if (show) {
      buildTarget.show()
    } else {
      buildTarget.hidden()
    }
  }
  plannerTemplatesEl.addEventListener('go:buildtarget:toggle', onBuildTargetToggle)
  const tfootApi = renderTfootTotals(plannerTemplatesEl, dataUnits);
  const errorApi = createTemplateError(plannerTemplatesEl);
  const errorState = { footer: false, speed: false, paladin: false, snobWarn: false }
  const updateError = () => {
    if (errorState.footer) {
      errorApi.show('footer')
    } else {
      errorApi.hide('footer')
    }
    if (errorState.speed) {
      errorApi.show('speed')
    } else {
      errorApi.hide('speed')
    }
    if (errorState.paladin) {
      errorApi.show('paladin')
    } else {
      errorApi.hide('paladin')
    }
    if (errorState.snobWarn) {
      errorApi.show('snob')
    } else {
      errorApi.hide('snob')
    }
  }
  const dropdownApi = renderDropdown(plannerTemplatesEl);
  dropdownApi?.setTemplates?.(storedTemplates)
  const twTemplatesApi = renderTroopTemplatesTW(plannerTemplatesEl);
  const updateBtn = plannerTemplatesEl.querySelector('#go-btn-update')
  const saveNewBtn = plannerTemplatesEl.querySelector('#go-btn-save-new')
  const setBtnDisabledState = (btn, disabled) => {
    if (!btn) return
    if (disabled) {
      btn.setAttribute('aria-disabled', 'true')
      btn.disabled = true
      return
    }
    btn.removeAttribute('aria-disabled')
    btn.disabled = false
  }
  const updateSaveDisabled = () => {
    if (!updateBtn && !saveNewBtn) return
    const name = templateNameInput?.value?.trim() || ''
    if (templateNameInput) {
      templateNameInput.classList.toggle('go-input-invalid', name.length > 0 && name.length < 3)
    }
    const hasContent = (() => {
      const inputs = Array.from(plannerTemplatesEl.querySelectorAll('input.go-unit-input[data-unit]'))
      return inputs.some((input) => {
        const raw = String(input.value || '').trim()
        if (!raw || raw === '0') return false
        return true
      })
    })()
    const hasConflict = !!(errorState.footer || errorState.speed || errorState.paladin)
    const selectedTpl = selectedTemplateId
      ? storedTemplates.find((t) => t._id === selectedTemplateId)
      : null
    const isSameSelected = selectedTpl ? isSameTemplate(selectedTpl) : false
    const currentMode = getCommandMode()
    const selectedIndex = selectedTemplateId
      ? storedTemplates.findIndex((tpl) => tpl._id === selectedTemplateId)
      : -1
    const anyNameConflictIndex = storedTemplates.findIndex((tpl) => {
      if (tpl?.name !== name) return false
      return getTemplateMode(tpl) === currentMode
    })
    const hasNameConflictForUpdate = anyNameConflictIndex >= 0 && anyNameConflictIndex !== selectedIndex
    const hasNameConflictForNew = anyNameConflictIndex >= 0
    const commonReady = name.length >= 3 && hasContent && !hasConflict

    const canUpdate = Boolean(selectedTpl) && commonReady && !isSameSelected && !hasNameConflictForUpdate
    const canSaveNew = commonReady && !hasNameConflictForNew

    setBtnDisabledState(updateBtn, !canUpdate)
    setBtnDisabledState(saveNewBtn, !canSaveNew)
  }
  updateSaveDisabled()

  const onTemplates = (event) => {
    if (abortCtrl.signal.aborted) return
    const list = event?.detail?.templates || []
    twTemplatesById = new Map(list.map((t) => [String(t.id), t]))
    twTemplatesApi?.render?.(list)
    const state = getComponentState()
    if (state?.twTemplateId && twSelect) {
      twSelect.value = state.twTemplateId
    }
  }
  plannerTemplatesEl.addEventListener('go:templates:tw', onTemplates)
  if (twSelect) {
    const closeTwSelect = () => {
      setTimeout(() => {
        twSelect.blur()
        const lastRowBtn = plannerTemplatesEl.querySelector('tbody tr:last-child [name="go-add-model-tw"]')
        lastRowBtn?.focus?.()
      }, 0)
    }
    twSelect.addEventListener('change', closeTwSelect)
  }

  const onApplyTwTemplate = (event) => {
    if (abortCtrl.signal.aborted) return
    const { templateId, tr } = event?.detail || {}
    if (!templateId || !tr) return
    const tpl = twTemplatesById.get(String(templateId))
    if (!tpl) return
    const tbody = tr.closest('tbody')
    const firstRow = tbody?.querySelector('tr')
    const isFirstRow = firstRow && tr === firstRow
    applyTemplateToRow(tr, tpl, { useAllAsMinusOne: !isFirstRow })
    applyCommandModeRules({ emitUnitsChanged: false })
    plannerTemplatesEl.dispatchEvent(new CustomEvent('go:units:changed', { bubbles: true }))
    if (isFirstRow) {
      const units = Array.isArray(tpl.use_all) ? tpl.use_all : []
      plannerTemplatesEl.dispatchEvent(
        new CustomEvent('go:template:useall', {
          bubbles: true,
          detail: { units }
        })
      )
    }
  }
  plannerTemplatesEl.addEventListener('go:twtemplate:apply', onApplyTwTemplate);

  const onFooterError = (event) => {
    const errorUnits = Array.isArray(event?.detail?.errorUnits) ? event.detail.errorUnits : []
    errorState.footer = errorUnits.length > 0
    updateError()
    updateSaveDisabled()
  }
  plannerTemplatesEl.addEventListener('go:footer:error', onFooterError)
  const onSpeedConflict = (event) => {
    errorState.speed = !!event?.detail?.hasConflict
    updateError()
    updateSaveDisabled()
  }
  plannerTemplatesEl.addEventListener('go:speed:conflict', onSpeedConflict)
  const onPaladinConflict = (event) => {
    errorState.paladin = !!event?.detail?.hasConflict
    updateError()
    updateSaveDisabled()
  }
  plannerTemplatesEl.addEventListener('go:paladin:conflict', onPaladinConflict)
  const onSnobWarn = (event) => {
    errorState.snobWarn = !!event?.detail?.hasWarn
    updateError()
  }
  plannerTemplatesEl.addEventListener('go:snob:warn', onSnobWarn)
  const onTemplateStats = (event) => {
    const payload = event?.detail || null
    const seq = Number(payload?.meta?.seq || 0)
    if (seq && seq <= lastTemplateSeq) return
    if (seq) lastTemplateSeq = seq
    lastTemplateStatsAny = payload
    if (!payload?.validation?.isValid) return
    lastTemplateStats = payload
  }
  plannerTemplatesEl.addEventListener('go:template:stats:stable', onTemplateStats)
  restoreComponentState(tbodyApi)

  const onTemplateSave = (event) => {
    if (abortCtrl.signal.aborted) return
    const name = event?.detail?.name?.trim()
    if (!name) return
    const requestedAction = String(event?.detail?.action || '').trim().toLowerCase()
    const currentMode = getCommandMode()
    const selectedIndex = selectedTemplateId
      ? storedTemplates.findIndex((tpl) => tpl._id === selectedTemplateId)
      : -1
    const nameConflictIndex = storedTemplates.findIndex((tpl) => {
      if (tpl?.name !== name) return false
      return getTemplateMode(tpl) === currentMode
    })
    const wantsUpdate = requestedAction === 'update'
    const wantsNew = requestedAction === 'new'

    if (wantsUpdate && selectedIndex < 0) return

    if (wantsNew) {
      if (nameConflictIndex >= 0) return
    } else {
      const hasNameConflict = nameConflictIndex >= 0 && nameConflictIndex !== selectedIndex
      if (hasNameConflict) return
    }

    let template;
    const shouldUpdateExisting = wantsUpdate || (!wantsNew && selectedIndex >= 0)
    if (shouldUpdateExisting && selectedIndex >= 0) {
      const current = storedTemplates[selectedIndex]
      const currentTemplateId = extractTemplateIdFromDocId(current?._id)
      template = buildTemplate(name, currentTemplateId, current?.createdAt || null)
      storedTemplates[selectedIndex] = template
    } else {
      template = buildTemplate(name)
      storedTemplates.push(template)
    }

    setTemplates(storedTemplates)
    dropdownApi?.setTemplates?.(storedTemplates)
    selectedTemplateId = template._id
    const successMsg = (shouldUpdateExisting && selectedIndex >= 0)
      ? `Modelo "${name}" atualizado com sucesso!`
      : `Modelo "${name}" salvo com sucesso!`
    printMessage.success(successMsg, 2000)
    updateSaveDisabled()
  }
  const onTemplateDelete = (event) => {
    if (abortCtrl.signal.aborted) return
    const id = event?.detail?.id
    if (!id) return
    storedTemplates = storedTemplates.filter((tpl) => tpl._id !== id)
    setTemplates(storedTemplates)
    dropdownApi?.setTemplates?.(storedTemplates)
  }
  const onTemplateSelect = (event) => {
    if (abortCtrl.signal.aborted) return
    const id = event?.detail?.id
    if (!id) return
    const tpl = storedTemplates.find((t) => t._id === id)
    if (!tpl) return
    selectedTemplateId = id
    applyStoredTemplate(tpl)
    updateSaveDisabled()
  }
  plannerTemplatesEl.addEventListener('go:template:save', onTemplateSave)
  plannerTemplatesEl.addEventListener('go:template:delete', onTemplateDelete)
  plannerTemplatesEl.addEventListener('go:template:select', onTemplateSelect)
  const onTemplateStateInput = (event) => {
    const target = event?.target
    if (!target) return
    if (target.closest?.('input.go-unit-input')) {
      if (isPaladinInputEl(target)) {
        const nextValue = normalizePaladinValue(target.value)
        if (String(target.value ?? '') !== nextValue) {
          target.value = nextValue
          plannerTemplatesEl.dispatchEvent(new CustomEvent('go:units:changed', { bubbles: true }))
        }
      }
      return scheduleSave()
    }
    if (target.id === 'go-input-template-name') return scheduleSave()
  }
  const onTemplateNameInput = (event) => {
    const target = event?.target
    if (!target || target.id !== 'go-input-template-name') return
    updateSaveDisabled()
  }
  const onTemplateStateChange = (event) => {
    const target = event?.target
    if (!target) return
    if (target.id === 'tw-template') return scheduleSave()
    if (target.closest?.('input.go-unit-input') && isPaladinInputEl(target)) {
      const nextValue = normalizePaladinValue(target.value)
      if (String(target.value ?? '') !== nextValue) {
        target.value = nextValue
      }
      plannerTemplatesEl.dispatchEvent(new CustomEvent('go:units:changed', { bubbles: true }))
      return scheduleSave()
    }
  }
  const setTemplateSectionOpen = (isOpen) => {
    const section = plannerTemplatesEl.querySelector('section.section-template')
    if (!section) return
    section.classList.toggle('show', Boolean(isOpen))
  }
  const toggleTemplateSection = () => {
    const section = plannerTemplatesEl.querySelector('section.section-template')
    if (!section) return
    section.classList.toggle('show')
  }
  const applyCommandModeChange = (nextMode) => {
    const next = normalizeCommandMode(nextMode)
    if (next === getCommandMode()) return
    setCommandMode(next)
    if (next === 'support') {
      tbodyApi?.setRowCount?.(1)
    }
    applyCommandModeRules({ emitUnitsChanged: false })
    selectedTemplateId = null
    if (templateNameInput) templateNameInput.value = ''
    updateSaveDisabled()
    scheduleSave()
    plannerTemplatesEl.dispatchEvent(
      new CustomEvent('go:command-mode:changed', {
        bubbles: true,
        detail: { mode: next }
      })
    )
  }
  const modeConfirmDropdown = supportModeBtn
    ? createActionDropdown({
      btn: supportModeBtn,
      title: 'Confirma a EXCLUSÃO?',
      message: 'TW não aceita mais de um APOIO por comando.',
      actions: [
        { value: 'confirm', label: 'Continuar', color: 'primary' },
        { value: 'cancel', label: 'Cancelar', color: 'neutral' }
      ],
      toggleOnButtonClick: false,
      onSelect: ({ value }) => {
        if (value === 'confirm') {
          applyCommandModeChange('support')
        }
      }
    })
    : null
  const onCommandModeClick = (event) => {
    const btn = event?.target?.closest?.('button[name="commandMode"][data-command-mode]')
    if (!btn) return
    const section = plannerTemplatesEl.querySelector('section.section-template')
    const isOpen = Boolean(section?.classList?.contains('show'))
    const next = normalizeCommandMode(btn.dataset.commandMode)
    if (next === getCommandMode()) {
      if (isOpen) setTemplateSectionOpen(false)
      else setTemplateSectionOpen(true)
      return
    }
    setTemplateSectionOpen(true)
    if (next === 'support') {
      const rowsCount = plannerTemplatesEl.querySelectorAll('tbody tr').length
      if (rowsCount > 1) {
        const removableRows = Math.max(0, rowsCount - 1)
        modeConfirmDropdown?.setTitle?.('Confirma a EXCLUSÃO?')
        modeConfirmDropdown?.setMessage?.(
          `TW não aceita mais de um APOIO por comando. Atualmente existem ${removableRows} ataques no comando que serão excluídos.`
        )
        event.preventDefault?.()
        modeConfirmDropdown?.open?.()
        return
      }
    }
    applyCommandModeChange(next)
  }
  const onTemplateStateUnitsChanged = () => scheduleSave()
  const onBuildTargetSelected = () => {
    updateSaveDisabled()
    scheduleSave()
  }
  const onTemplateTypeClick = (event) => {
    const btn = event?.target?.closest?.('button.go-radio[data-type]')
    if (!btn) return
    if (isTypeLocked) return
    const type = btn.dataset.type
    const rows = plannerTemplatesEl.querySelectorAll('tbody tr')
    if (rows.length !== 1) return
    const current = getTemplateType()
    if (current === type) return
    const changed = clearOrConvertFirstRow()
    if (!changed) return
    selectedTemplateId = null
    if (templateNameInput) templateNameInput.value = ''
    setTemplateType(type)
    updateInputConstraints(type)
    plannerTemplatesEl.dispatchEvent(
      new CustomEvent('go:type:changed', {
        bubbles: true,
        detail: { type }
      })
    )
    plannerTemplatesEl.dispatchEvent(new CustomEvent('go:units:changed', { bubbles: true }))
    scheduleSave()
  }
  plannerTemplatesEl.addEventListener('input', onTemplateStateInput)
  plannerTemplatesEl.addEventListener('input', onTemplateNameInput)
  plannerTemplatesEl.addEventListener('go:units:changed', updateSaveDisabled)
  plannerTemplatesEl.addEventListener('change', onTemplateStateChange)
  plannerTemplatesEl.addEventListener('click', onCommandModeClick)
  plannerTemplatesEl.addEventListener('go:units:changed', onTemplateStateUnitsChanged)
  plannerTemplatesEl.addEventListener('go:units:changed', updateTypeAvailability)
  plannerTemplatesEl.addEventListener('go:buildtarget:selected', onBuildTargetSelected)
  plannerTemplatesEl.addEventListener('click', onTemplateTypeClick)
  const onTemplateReset = () => {
    selectedTemplateId = null
    if (templateNameInput) templateNameInput.value = ''
    updateSaveDisabled()
  }
  plannerTemplatesEl.addEventListener('go:template:reset', onTemplateReset)
  const onPopupClose = () => abortCtrl.abort()
  document.addEventListener('go:popup:close', onPopupClose, true)

  plannerTemplates({ target: plannerTemplatesEl, signal: abortCtrl.signal });
  const openCloseTemplateEl = plannerTemplatesEl.querySelector("button.go-btn-link");
  const openCloseTemplate = () => toggleTemplateSection()
  openCloseTemplateEl.addEventListener('click', openCloseTemplate)

  popUpBoxContent.insertAdjacentElement('beforeend', plannerTemplatesEl)
  const unbindPlannerTemplates = () => {
    abortCtrl.abort()
    plannerTemplatesEl.removeEventListener('go:templates:tw', onTemplates)
    plannerTemplatesEl.removeEventListener('go:twtemplate:apply', onApplyTwTemplate)
    plannerTemplatesEl.removeEventListener('go:footer:error', onFooterError)
    plannerTemplatesEl.removeEventListener('go:speed:conflict', onSpeedConflict)
    plannerTemplatesEl.removeEventListener('go:paladin:conflict', onPaladinConflict)
    plannerTemplatesEl.removeEventListener('go:snob:warn', onSnobWarn)
    plannerTemplatesEl.removeEventListener('go:buildtarget:toggle', onBuildTargetToggle)
    plannerTemplatesEl.removeEventListener('go:template:stats:stable', onTemplateStats)
    plannerTemplatesEl.removeEventListener('go:template:save', onTemplateSave)
    plannerTemplatesEl.removeEventListener('go:template:delete', onTemplateDelete)
    plannerTemplatesEl.removeEventListener('go:template:select', onTemplateSelect)
    plannerTemplatesEl.removeEventListener('input', onTemplateStateInput)
    plannerTemplatesEl.removeEventListener('input', onTemplateNameInput)
    plannerTemplatesEl.removeEventListener('change', onTemplateStateChange)
    plannerTemplatesEl.removeEventListener('click', onCommandModeClick)
    plannerTemplatesEl.removeEventListener('go:units:changed', onTemplateStateUnitsChanged)
    plannerTemplatesEl.removeEventListener('go:units:changed', updateTypeAvailability)
    plannerTemplatesEl.removeEventListener('go:buildtarget:selected', onBuildTargetSelected)
    plannerTemplatesEl.removeEventListener('click', onTemplateTypeClick)
    plannerTemplatesEl.removeEventListener('go:template:reset', onTemplateReset)
    document.removeEventListener('go:popup:close', onPopupClose, true)
    openCloseTemplateEl.removeEventListener('click', openCloseTemplate)
    dropdownApi?.destroy?.();
    modeConfirmDropdown?.destroy?.();
    // sem destroy no select por enquanto
    buildTarget.destroy();
    tbodyApi?.destroy?.();
    tfootApi?.destroy?.();
    errorApi?.destroy?.();
  }
  return {
    unbind: unbindPlannerTemplates,
    getTemplateStats: () => lastTemplateStats,
    getTemplateStatsAny: () => lastTemplateStatsAny,
    getComponentStateSnapshot: () => buildComponentStateSnapshot()
  };
}
