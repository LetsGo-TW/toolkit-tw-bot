// planner/templates/view/thead.js
import { nSecStrTime } from '@toolkit-tw-bot/core'
import { getGameData } from '@toolkit-tw-bot/document'

const getCurrentGameData = () => {
  if (typeof window !== "undefined" && typeof window.game_data !== "undefined") {
    return window.game_data
  }

  if (typeof document === "undefined") return null

  return getGameData()
}

const gameData = getCurrentGameData()

function renderTheadTh(plannerTemplates, dataUnits) {
  const theadTrEl = plannerTemplates.querySelector('thead tr');
  const theadThHtml = gameData.units.map(id => {
    if (id === 'militia') return '';
    return `
      <th width="50">
        <div class="go-th-unit-all">
          <label for="first:${id}">
            <img src="https://dsbr.innogamescdn.com/asset/98f3b7c4/graphic/unit/unit_${id}.webp" class="" data-title="${dataUnits.get(id).name}: ${nSecStrTime(1/dataUnits.get(id).speed)}/campo">
          </label>
          <input data-title="Marcar todo(all) ${dataUnits.get(id).name} do primeiro ataque." id="first:${id}" type="checkbox" class="go-unit-toggle">
        </div>
      </th>
    `
  }).join('\n ')

  theadTrEl.insertAdjacentHTML('beforeend', theadThHtml);

  const label = theadTrEl.querySelector('label.go-flex.go-th-btn')
  const select = theadTrEl.querySelector('#tw-template')

  const openSelect = (e) => {
    e.preventDefault()
    if (!select) return
    if (select.disabled || label?.getAttribute('aria-disabled') === 'true') return
    select.focus()
    if (typeof select.showPicker === 'function') {
      select.showPicker()
    } else {
      select.click()
    }
  }

  label.addEventListener('click', openSelect);

  const allCheckbox = theadTrEl.querySelector('input#first\\:all');
  const getUnitCheckboxes = () =>
    Array.from(theadTrEl.querySelectorAll('input.go-unit-toggle[id^="first:"]'))
      .filter((input) => input.id !== 'first:all');
  const updateAllState = () => {
    if (!allCheckbox) return
    const units = getUnitCheckboxes();
    const total = units.length;
    const checked = units.filter((input) => input.checked).length;
    allCheckbox.indeterminate = checked > 0 && checked < total;
    allCheckbox.checked = total > 0 && checked === total;
  }
  const onChange = (e) => {
    const { id, checked } = e.target;
    if (!id || !id.includes('first:')) return;
    const unit = id.split(':')?.[1];
    if (unit === 'all') {
      getUnitCheckboxes().forEach((input) => {
        input.checked = checked;
      })
      if (allCheckbox) allCheckbox.indeterminate = false;
    } else {
      updateAllState();
    }
    plannerTemplates.dispatchEvent(
      new CustomEvent('go:thead:toggle', {
        bubbles: true,
        detail: { unit, checked }
      })
    )
  }
  theadTrEl.addEventListener('change', onChange);
  const onTemplateUseAll = (e) => {
    const units = Array.isArray(e?.detail?.units) ? e.detail.units : []
    const unitSet = new Set(units)
    getUnitCheckboxes().forEach((input) => {
      const unit = input.id.split(':')?.[1]
      input.checked = unitSet.has(unit)
    })
    updateAllState()
  }
  plannerTemplates.addEventListener('go:template:useall', onTemplateUseAll)
  updateAllState();
  const destroy = () => {
    theadTrEl.removeEventListener('change', onChange);
    label.removeEventListener('click', openSelect);
    plannerTemplates.removeEventListener('go:template:useall', onTemplateUseAll)
  }

  return { destroy }
}

export { renderTheadTh }
