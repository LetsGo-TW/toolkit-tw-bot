import './style.css'

const createEl = (tag, className) => {
  const el = document.createElement(tag)
  if (className) el.className = className
  return el
}

export function createInputUnitGroup({
  unitId,
  iconUrl,
  available = null,
  value = '',
  checked = false,
  disabled = false,
  inputName = 'unit',
  min = 0,
  step = 1,
  onChange,
  onToggle,
  onPickAvailable
} = {}) {
  const group = createEl('div', 'go-input-unit-group')
  if (unitId) group.dataset.unit = unitId

  const toggle = createEl('button', 'go-unit-toggle')
  toggle.type = 'button'
  toggle.setAttribute('aria-pressed', checked ? 'true' : 'false')
  toggle.textContent = checked ? '✓' : ''

  const iconLabel = createEl('label', 'go-unit-icon-label')
  const icon = createEl('img', 'go-unit-icon')
  if (iconUrl) icon.src = `https://dsbr.innogamescdn.com/asset/540228b3/graphic/${iconUrl}`
  // `https://dsbr.innogamescdn.com/asset/540228b3/graphic/unit/unit_${unitId}.webp`
  icon.alt = unitId || 'unit'
  iconLabel.appendChild(icon)

  const input = createEl('input', 'go-unit-input')
  input.type = 'number'
  input.name = inputName
  input.min = String(min)
  input.step = String(step)
  input.value = value ?? ''
  if (unitId) {
    input.id = `go-unit-${unitId}`
    iconLabel.setAttribute('for', input.id)
  }

  const availableBtn = createEl('button', 'go-unit-available')
  availableBtn.type = 'button'
  if (available === null || available === undefined) {
    availableBtn.classList.add('is-hidden')
  } else {
    availableBtn.textContent = String(available)
  }

  const setSelected = (next) => {
    const isSelected = !!next
    group.classList.toggle('is-selected', isSelected)
    toggle.setAttribute('aria-pressed', isSelected ? 'true' : 'false')
    toggle.textContent = isSelected ? '✓' : ''
    input.disabled = isSelected || disabled
    availableBtn.disabled = isSelected
    if (isSelected) input.value = ''
  }

  toggle.addEventListener('click', () => {
    const next = toggle.getAttribute('aria-pressed') !== 'true'
    setSelected(next)
    if (typeof onToggle === 'function') onToggle(next, group)
  })

  input.addEventListener('input', (e) => {
    if (typeof onChange === 'function') onChange(e.target.value, group)
  })

  availableBtn.addEventListener('click', () => {
    if (availableBtn.classList.contains('is-hidden')) return
    input.disabled = false
    const current = Number(input.value || 0)
    const total = Number(available ?? 0)
    if (current >= total) {
      input.value = ''
    } else {
      input.value = String(total)
    }
    if (typeof onPickAvailable === 'function') onPickAvailable(input.value, group)
    if (typeof onChange === 'function') onChange(input.value, group)
  })

  group.appendChild(iconLabel)
  group.appendChild(input)
  group.appendChild(availableBtn)
  group.appendChild(toggle)

  if (disabled) input.disabled = true
  setSelected(checked)

  return group
}
