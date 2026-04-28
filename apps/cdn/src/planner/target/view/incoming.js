import './incoming.css'
import Tooltip from '@toolkit-tw-bot/document/tooltip'
import { nSecStrTime } from '@toolkit-tw-bot/core'
import { getInfoVillage } from '../../../requests/getInfoVillage'
import { renderCommandInfo } from './commandInfo'
import { useGoTiming } from '../../../hooks/useGoTiming'
import { postCancelCommand } from '../../../requests/postCancelCommand'
import { printMessage } from '../../../components/printMessage'

function setIncomingButtonDefault(button) {
  if (button) button.innerHTML = 'Buscar chegando'
}

function setIncomingButtonLoading(button) {
  if (!button) return
  button.innerHTML = `Carregando <img class="go-tw-loading" src="https://dsbr.innogamescdn.com/asset/0be64fad/graphic/loading.gif" alt="loading" width="14px">`
}

function setIncomingButtonOpened(button) {
  if (button) button.innerHTML = 'Fechar'
}

function insertSupportSum(html = document, targetContent = null) {
  const root = targetContent || document
  let supportSumNode = root.querySelector('#go-support-sum')
  const supportSumEl = html?.querySelector('#support_sum')
  if (!supportSumEl) {
    supportSumNode?.remove()
    return
  }
  const targetTablesContent = root.querySelector('.go-target-tables-content')
  if (!targetTablesContent) return
  const sumTitle = html.querySelector(`div[style='clear:both'] h3`)?.textContent
  const helpLinkTitle = html.querySelector(`div[style='clear:both'] a`)?.dataset?.title
    ?? html.querySelector(`div[style='clear:both'] a`)?.title
  if (!supportSumNode) {
    supportSumNode = document.createElement('div')
    supportSumNode.id = 'go-support-sum'
    supportSumNode.className = 'go-content-overflow'
    targetTablesContent.insertAdjacentElement('beforeend', supportSumNode)
  }
  supportSumNode.innerHTML = ''
  supportSumEl?.querySelector('thead')?.insertAdjacentHTML('afterbegin', `
    <tr>
      <th colspan="999" data-title="${helpLinkTitle}">${sumTitle + ' total'}</th>
    </tr>
    `
  )
  supportSumNode?.insertAdjacentElement('beforeend', supportSumEl)
}

function actionCommandInfo(incomingEl) {
  const tooltip = new Tooltip()
  return tooltip.bind(incomingEl, 'span.command_hover_details', renderCommandInfo)
}

function actionCommandCancel(e) {
  e.preventDefault()
  const commandCancel = e.currentTarget
  if (!commandCancel) return
  const { id, home } = commandCancel.dataset

  const row = commandCancel.closest('tr.command-row')
  const fallbackMs = 1000
  const loadingGifPattern = /\/loading.*\.gif$/i
  const loadingImg = commandCancel.querySelector('img')
  const originalImgSrc = loadingImg?.src
  const normalizeSrc = (src) => src?.split('?')[0]?.split('#')[0]
  const isLoading = () => {
    const img = commandCancel.querySelector('img')
    const src = normalizeSrc(img?.src)
    return Boolean(src && loadingGifPattern.test(src))
  }
  const isOriginalImgSrc = () => {
    if (!originalImgSrc) return false
    const img = commandCancel.querySelector('img')
    return normalizeSrc(img?.src) === normalizeSrc(originalImgSrc)
  }
  let observer = null
  const cleanup = () => {
    if (!observer) return
    observer.disconnect()
    observer = null
  }
  let fallbackTimer = null
  const fallback = async () => {
    if (!document.contains(commandCancel)) return
    if (row && !document.contains(row)) return
    if (isLoading()) return
    cleanup()
    try {
      await new Promise(requestAnimationFrame)
      if (isLoading()) return
      if (loadingImg && originalImgSrc) {
        loadingImg.src = 'https://dsbr.innogamescdn.com/asset/1bc739f8/graphic/loading2.gif'
      }
      await postCancelCommand(id, home)
      row?.remove()
    } catch (err) {
      if (loadingImg && originalImgSrc) {
        commandCancel?.remove()
      }
      const message = Array.isArray(err)
        ? err.join('\n')
        : Array.isArray(err?.error)
          ? err.error.join('\n')
          : Array.isArray(err?.message)
            ? err.message.join('\n')
            : err?.message || err?.toString?.() || 'Erro'
      printMessage.error(message, 2000)
    }
  }

  if (row?.parentElement) {
    const parent = row.parentElement
    let sawLoading = false
    observer = new MutationObserver(() => {
      if (isLoading()) {
        sawLoading = true
        if (fallbackTimer) clearTimeout(fallbackTimer)
        cleanup()
        return
      }
      if (sawLoading && isOriginalImgSrc()) {
        if (fallbackTimer) clearTimeout(fallbackTimer)
        cleanup()
        return
      }
      if (!document.contains(commandCancel) || !document.contains(row)) {
        if (fallbackTimer) clearTimeout(fallbackTimer)
        cleanup()
      }
    })
    observer.observe(parent, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
  }

  fallbackTimer = setTimeout(fallback, fallbackMs)
}

async function insertIncomingTarget(village, targetContent) {
  const targetTablesContent = targetContent?.querySelector('.go-target-tables-content')
  if (!targetTablesContent) return null
  let incomingTarget = targetContent.querySelector('#go-incoming-target')
  try {
    const html = await getInfoVillage(village)
    const incomingEl = html.querySelector('#commands_incomings table') ?? html.querySelector('#commands_outgoings table')
    if (!incomingEl) {
      if (!incomingTarget) {
        printMessage.warn('Nenhum comando chegando na villa', 3000)
        return null
      }
      incomingTarget.remove()
      insertSupportSum(html, targetContent)
      return null
    }
    incomingEl.id = 'incoming-target'
    Array.from(incomingEl.querySelectorAll('th')).forEach((th) => { th.className = 'go' })
    Array.from(incomingEl.querySelectorAll('tr.command-row')).forEach((tr) => {
      tr.querySelector('a.rename-icon')?.remove()
      tr.cells?.[2]?.querySelector?.('span')?.classList?.add('endtime')
      const commandCancel = tr.querySelector('a.command-cancel')
      if (commandCancel) {
        if (!commandCancel.dataTitle) {
          const title = commandCancel?.title ?? 'cancel'
          commandCancel.setAttribute('data-title', title)
          if (commandCancel?.title) commandCancel.removeAttribute('title')
        }
        commandCancel.addEventListener('click', actionCommandCancel, { once: true })
      }
    })
    if (!incomingTarget) {
      incomingTarget = document.createElement('div')
      incomingTarget.id = 'go-incoming-target'
      incomingTarget.className = 'go-content-overflow'
      targetTablesContent.insertAdjacentElement('afterbegin', incomingTarget)
    }
    incomingTarget.innerHTML = ''
    incomingTarget.insertAdjacentElement('beforeend', incomingEl)
    const showTimeHandler = () => {
      const now = useGoTiming.getEffectiveServerNowMs()
      incomingEl.querySelectorAll('.endtime').forEach((e, i) => {
        const endtime = Number(e.dataset.endtime)
        const timeDiffSec = endtime - Math.ceil(now / 1000)
        if (timeDiffSec < 0) {
          incomingEl.querySelectorAll('tr.command-row')[i]?.remove()
        } else {
          e.textContent = nSecStrTime(timeDiffSec)
        }
      })
    }
    const unsubscribeShowTimeHandlerTick = useGoTiming.subscribe(showTimeHandler, { immediate: true })
    insertSupportSum(html, targetContent)
    const unbindActionCommandInfo = actionCommandInfo(incomingEl)
    return () => {
      unsubscribeShowTimeHandlerTick()
      unbindActionCommandInfo()
    }
  } catch (error) {
    printMessage.error(error?.message ?? error?.toString?.() ?? 'Erro')
    return null
  }
}

export function createIncomingTargetController({ targetContent, button = null, getVillage = null } = {}) {
  let currentVillage = (typeof getVillage === 'function' ? getVillage() : null) || null
  let unbindIncomingTarget = null

  const resolveVillage = () => {
    const nextVillage = typeof getVillage === 'function' ? getVillage() : null
    if (nextVillage && typeof nextVillage === 'object') currentVillage = nextVillage
    return currentVillage
  }

  const closeIncomingTargetView = () => {
    targetContent?.querySelector?.('#go-incoming-target')?.remove()
    targetContent?.querySelector?.('#go-support-sum')?.remove()
    if (unbindIncomingTarget) {
      unbindIncomingTarget()
      unbindIncomingTarget = null
    }
    setIncomingButtonDefault(button)
  }

  const refreshIncomingTarget = async () => {
    const incomingTarget = targetContent?.querySelector?.('#go-incoming-target')
    if (!incomingTarget) return
    const village = resolveVillage()
    if (!village || typeof village !== 'object') return
    setIncomingButtonLoading(button)
    if (unbindIncomingTarget) {
      unbindIncomingTarget()
      unbindIncomingTarget = null
    }
    unbindIncomingTarget = await insertIncomingTarget(village, targetContent)
    if (!unbindIncomingTarget) {
      setIncomingButtonDefault(button)
      return
    }
    setIncomingButtonOpened(button)
  }

  const updateIncomingTarget = async () => {
    const incomingTarget = targetContent?.querySelector?.('#go-incoming-target')
    if (!incomingTarget) return
    const commandsCount = incomingTarget.querySelector('span.commands-command-count')
    const count = Number(commandsCount?.textContent.match(/[0-9]{1,}/)?.[0] ?? 0)
    const commands = incomingTarget.querySelectorAll('.command-row')
    if (commands.length === count) return
    if (commandsCount) commandsCount.textContent = commandsCount.textContent.replace(count, commands.length)
    if (!commands.length) {
      printMessage.warn('Nenhum comando chegando na villa', 3000)
    }
    await refreshIncomingTarget()
  }

  const toggle = async () => {
    const incomingTarget = targetContent?.querySelector?.('#go-incoming-target')
    const supportSum = targetContent?.querySelector?.('#go-support-sum')
    if (incomingTarget) {
      incomingTarget.remove()
      supportSum?.remove()
      if (unbindIncomingTarget) {
        unbindIncomingTarget()
        unbindIncomingTarget = null
      }
      setIncomingButtonDefault(button)
      return
    }

    const village = resolveVillage()
    if (!village || typeof village !== 'object') return
    setIncomingButtonLoading(button)
    unbindIncomingTarget = await insertIncomingTarget(village, targetContent)
    if (!unbindIncomingTarget) {
      setIncomingButtonDefault(button)
      return
    }
    setIncomingButtonOpened(button)
  }

  const onVillageChange = (village) => {
    if (village && typeof village === 'object') currentVillage = village
    closeIncomingTargetView()
  }

  const unbindUpdateIncomingTarget = useGoTiming.subscribe(updateIncomingTarget, { immediate: true })

  const destroy = () => {
    unbindUpdateIncomingTarget()
    closeIncomingTargetView()
  }

  return {
    toggle,
    refresh: refreshIncomingTarget,
    onVillageChange,
    destroy
  }
}
