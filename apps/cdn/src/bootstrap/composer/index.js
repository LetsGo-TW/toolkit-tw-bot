import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'

import { createBotViewConfigPopover } from '../../components/bot-view-config-popover'
import { createComposerSectionsFromRegistry } from './registry-sections'

const SETTINGS_GEAR_ICON_URL = `chrome-extension://${RELEASE_EXTENSION_ID}/icons/gear.green.svg`
const BOT_VIEW_ROOT_SELECTOR = '#go-extension-bot-view'
const CONFIG_SLOT_SELECTOR = '#go-extension-bot-view-slot-config'
const CONFIG_BUTTON_ID = 'go-slot-config'

const composerRuntime = {
  cleanup: null,
  observer: null,
  syncQueued: false,
  context: null,
  stage: null,
}

function setComposerExecutionStatus(context = {}, value = '') {
  const safeValue = String(value || '').trim()

  if (!safeValue) {
    context?.clearBotViewExecutionStatusText?.()
    return
  }

  context?.setBotViewExecutionStatusText?.(safeValue)
}

function clearComposerExecutionStatus(context = {}) {
  context?.clearBotViewExecutionStatusText?.()
}

function nodeTouchesComposerMount(node) {
  if (!(node instanceof Element)) {
    return false
  }

  return node.matches(BOT_VIEW_ROOT_SELECTOR)
    || node.matches(CONFIG_SLOT_SELECTOR)
    || node.id === CONFIG_BUTTON_ID
    || Boolean(node.querySelector?.(BOT_VIEW_ROOT_SELECTOR))
    || Boolean(node.querySelector?.(CONFIG_SLOT_SELECTOR))
    || Boolean(node.querySelector?.(`#${CONFIG_BUTTON_ID}`))
}

function getConfigSlot(context = {}) {
  const botView = typeof context?.getBotView === 'function'
    ? context.getBotView()
    : null

  if (botView?.configSlot instanceof HTMLElement) {
    return botView.configSlot
  }

  return document.querySelector(CONFIG_SLOT_SELECTOR)
}

async function mountComposer(context = {}) {
  const slotConfig = getConfigSlot(context)

  if (!(slotConfig instanceof HTMLElement)) {
    return null
  }

  const existingButton = document.getElementById(CONFIG_BUTTON_ID)

  if (existingButton instanceof HTMLElement) {
    return {
      destroy() {},
    }
  }

  const btnConfig = document.createElement('button')
  btnConfig.id = CONFIG_BUTTON_ID
  btnConfig.type = 'button'
  btnConfig.setAttribute('aria-label', 'Mostrar/ocultar configurações.')
  btnConfig.setAttribute('data-go-bot-view-tooltip', 'Mostrar/ocultar configurações.')

  const btnConfigImg = document.createElement('img')
  btnConfigImg.src = SETTINGS_GEAR_ICON_URL
  btnConfigImg.alt = ''
  btnConfigImg.width = 16
  btnConfigImg.height = 16
  btnConfig.append(btnConfigImg)

  slotConfig.append(btnConfig)

  const popover = createBotViewConfigPopover({
    btn: btnConfig,
    groups: [
      { id: 'auto', label: 'Auto' },
      { id: 'globals', label: 'Globals' },
      { id: 'others', label: 'Others' },
    ],
    sections: await createComposerSectionsFromRegistry(composerRuntime.stage?.registry, context),
    onOpen: () => {
      setComposerExecutionStatus(context, 'Configurando')
    },
    onClose: () => {
      clearComposerExecutionStatus(context)
    },
  })

  return {
    destroy() {
      clearComposerExecutionStatus(context)
      popover?.destroy?.()
      btnConfig.remove()
    },
  }
}

export async function mountComposerRuntime(context = {}) {
  const registry = Array.isArray(composerRuntime.stage?.registry)
    ? composerRuntime.stage.registry
    : []

  if (!registry.length) {
    return null
  }

  return await mountComposer(context)
}

async function syncComposerRuntime() {
  const context = composerRuntime.context || {}
  const registry = Array.isArray(composerRuntime.stage?.registry)
    ? composerRuntime.stage.registry
    : []
  const slotConfig = getConfigSlot(context)

  if (!registry.length || !(slotConfig instanceof HTMLElement)) {
    composerRuntime.cleanup?.()
    composerRuntime.cleanup = null
    return
  }

  const button = document.getElementById(CONFIG_BUTTON_ID)

  if (button instanceof HTMLElement && slotConfig.contains(button)) {
    return
  }

  composerRuntime.cleanup?.()
  composerRuntime.cleanup = null

  const handle = await mountComposerRuntime(context)

  composerRuntime.cleanup = typeof handle?.destroy === 'function'
    ? () => handle.destroy()
    : null
}

function queueComposerSync() {
  if (composerRuntime.syncQueued) {
    return
  }

  composerRuntime.syncQueued = true

  queueMicrotask(() => {
    composerRuntime.syncQueued = false
    void syncComposerRuntime()
  })
}

function ensureComposerObserver() {
  if (composerRuntime.observer || typeof MutationObserver === 'undefined') {
    return
  }

  composerRuntime.observer = new MutationObserver((records) => {
    const shouldSync = records.some((record) => {
      if (nodeTouchesComposerMount(record.target)) {
        return true
      }

      return Array.from(record.addedNodes || []).some(nodeTouchesComposerMount)
        || Array.from(record.removedNodes || []).some(nodeTouchesComposerMount)
    })

    if (!shouldSync) {
      return
    }

    queueComposerSync()
  })

  composerRuntime.observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })
}

export async function syncComposerRunning(stage = {}, context = {}) {
  composerRuntime.context = context
  composerRuntime.stage = stage

  ensureComposerObserver()
  await syncComposerRuntime()
}

export async function destroyComposerRunning() {
  composerRuntime.observer?.disconnect?.()
  composerRuntime.observer = null
  composerRuntime.cleanup?.()
  composerRuntime.cleanup = null
  composerRuntime.context = null
  composerRuntime.stage = null
}

export default {
  destroyComposerRunning,
  mountComposerRuntime,
  syncComposerRunning,
}
