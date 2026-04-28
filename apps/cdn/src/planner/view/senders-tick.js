import { nSecStrTime } from '@toolkit-tw-bot/core'
import { formatDateTime } from '../../components/input-date-time'
import { useGoTiming } from '../../hooks/useGoTiming'
import { calcUnitDateTime } from './table/utils/calcDataSendersForDateTime'

export function updateSendersPerSecond({ rerender } = {}, deps = {}) {
  const cancelEvents = deps?.cancelEvents || {}
  const getActiveDispatchMode = deps?.getActiveDispatchMode
  const getDateTimeValue = deps?.getDateTimeValue
  const updateSenders = () => {
    const mode = typeof getActiveDispatchMode === 'function' ? getActiveDispatchMode() : 'send'
    if (mode === 'send') {
      const now = useGoTiming.getEffectiveServerNowMs()
      const nextItems = document.querySelectorAll('#go-planner-senders td[data-next-seconds]')
      nextItems.forEach((cell) => {
        const seconds = Number(cell.getAttribute('data-next-seconds'))
        if (!Number.isFinite(seconds) || seconds <= 0) return
        const arrivalMs = now + (Math.floor(seconds) * 1000)
        cell.setAttribute('data-next-output', String(arrivalMs))
        const unitLabel = String(cell.getAttribute('data-next-unit-label') || '').trim()
        const content = cell.querySelector(':scope > span')
        if (!content) return
        content.classList.remove('go-red')
        content.classList.remove('go-smaller')
        const formatted = formatTwFromDatetimeLocal(formatDateTime(arrivalMs))
        content.innerHTML = unitLabel
          ? `<span class="go-smaller">${unitLabel}: </span><br><span>${formatted}</span>`
          : `<span>${formatted}</span>`
      })
      return
    }
    const now = useGoTiming.getEffectiveServerNowMs()
    const items = document.querySelectorAll('#go-planner-senders .unit-item.go-green')

    items.forEach((item) => {
      const unit = Number(item.querySelector('span')?.textContent || 0)
      if (unit === 0) return
      const unitName = item.dataset.unit
      const currentDateTimeValue = typeof getDateTimeValue === 'function' ? getDateTimeValue() : null
      if (!unitName || !currentDateTimeValue) return
      const distance = Number(item.dataset.distance)
      if (!Number.isFinite(distance)) return
      const { outputInSec } = calcUnitDateTime(unitName, distance, currentDateTimeValue, now, mode)
      const timerEl = item.querySelector('.go-outin')

      if (!outputInSec) {
        if (timerEl) timerEl.remove()
        item.classList.remove('go-green')
        item.classList.add('go-red')
        return
      }

      if (outputInSec >= 600) return

      const text = nSecStrTime(outputInSec).match(/.{1,5}$/)[0]
      if (timerEl) {
        timerEl.textContent = text
        return
      }

      item.innerHTML = `
        <span>${unit}</span>
        <span class="go-outin">${text}</span>
      `
    })
    void rerender
  }

  if (cancelEvents.unsubscribeSendersTick) cancelEvents.unsubscribeSendersTick()

  cancelEvents.unsubscribeSendersTick = useGoTiming.subscribe(() => {
    updateSenders()
  }, { immediate: true })
}
