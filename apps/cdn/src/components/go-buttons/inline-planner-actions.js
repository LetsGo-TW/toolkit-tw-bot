import { createBtnCalendar } from './calendar';
import { createBtnCrossedSwords, ICON_CROSSED_SWORDS_CENTERED } from './crossed-swords';
import './planner-action-buttons.css';

export function createInlinePlannerActionButtons(container, {
  size = 24,
  wrapperClass = 'go-planner-action-buttons-group',
  scheduleIconUri = '',
  scheduleTitle = 'Agendar comandos',
  scheduleDisabled = false,
  scheduleDisabledTitle = 'Agendar em preparação',
  sendTitle = 'Enviar comandos',
  tooltipAttr = 'data-title',
  onSchedule = null,
  onSend = null,
  sendIconUri = ICON_CROSSED_SWORDS_CENTERED
} = {}) {
  if (!container) return null

  const wrap = document.createElement('div')
  wrap.className = wrapperClass

  const btnCal = createBtnCalendar(wrap, {
    size,
    className: 'go-btn-inline go-btn-inline-calendar',
    title: scheduleTitle,
    onClick: typeof onSchedule === 'function' ? onSchedule : undefined
  })

  const btnSword = createBtnCrossedSwords(wrap, {
    size,
    className: 'go-btn-inline go-btn-inline-sword',
    title: sendTitle,
    onClick: typeof onSend === 'function' ? onSend : undefined,
    iconUri: sendIconUri
  })

  if (scheduleIconUri) {
    const scheduleImg = btnCal?.querySelector?.('img')
    if (scheduleImg instanceof HTMLImageElement) {
      scheduleImg.src = scheduleIconUri
    }
  }

  if (scheduleDisabled && btnCal) {
    btnCal.disabled = true
    btnCal.setAttribute('aria-disabled', 'true')
    if (scheduleDisabledTitle) btnCal.setAttribute('title', String(scheduleDisabledTitle))
  }

  ;[btnCal, btnSword].forEach((btn) => {
    const rawTitle = String(btn.getAttribute('title') || '').trim()
    if (rawTitle && tooltipAttr) btn.setAttribute(tooltipAttr, rawTitle)
    btn.removeAttribute('title')
  })

  const setSelected = (mode) => {
    const selected = (!scheduleDisabled && mode === 'schedule') ? 'schedule' : 'send'
    const scheduleSelected = selected === 'schedule'
    const sendSelected = selected === 'send'
    btnCal.classList.toggle('is-selected', scheduleSelected)
    btnSword.classList.toggle('is-selected', sendSelected)
    btnCal.setAttribute('aria-pressed', scheduleSelected ? 'true' : 'false')
    btnSword.setAttribute('aria-pressed', sendSelected ? 'true' : 'false')
  }

  container.insertAdjacentElement('beforeend', wrap)
  return { wrap, btnCal, btnSword, setSelected }
}
