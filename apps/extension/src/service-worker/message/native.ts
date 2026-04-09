/// <reference types="chrome" />

import { normalizeNumber, normalizeString } from '../normalize'
import type { SWMessage } from '../../types'
import { ARM_NATIVE_MESSAGE_TYPE, NATIVE_MESSAGE_TYPE } from './types'

const NATIVE_CLICK_ARM_TTL_MS = 4_000
const nativeClickArmByTabId = new Map<number, {
  expiresAt: number
  source: string | null
}>()

type NativeClickRequest = Partial<SWMessage> & {
  coords?: {
    x?: unknown
    y?: unknown
  } | null
  logKey?: unknown
}

type NativeClickArmRequest = Partial<SWMessage> & {
  source?: unknown
}

type NativeClickResult = {
  success: boolean
  error?: string
  message?: string
}

type CleanupAttachedNativeDebuggersOptions = {
  reason?: string
  tabId?: number | null
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim()) {
    return error.message
  }

  return String(error || 'Unknown error')
}

function getArmState(tabId: number) {
  const armed = nativeClickArmByTabId.get(tabId) || null

  if (!armed) {
    return null
  }

  if (armed.expiresAt < Date.now()) {
    nativeClickArmByTabId.delete(tabId)
    return null
  }

  return armed
}

function consumeArmState(tabId: number) {
  const armed = getArmState(tabId)

  if (!armed) {
    return null
  }

  nativeClickArmByTabId.delete(tabId)
  return armed
}

export async function cleanupAttachedNativeDebuggers(
  {
    reason = 'unknown',
    tabId = null,
  }: CleanupAttachedNativeDebuggersOptions = {},
) {
  try {
    const targets = await chrome.debugger.getTargets()
    const attachedTargets = targets.filter((target) => {
      if (target.type !== 'page') {
        return false
      }

      if (target.attached !== true) {
        return false
      }

      if (typeof target.tabId !== 'number') {
        return false
      }

      if (typeof tabId === 'number' && target.tabId !== tabId) {
        return false
      }

      return true
    })

    for (const target of attachedTargets) {
      try {
        await chrome.debugger.detach({ tabId: target.tabId })
        console.warn('[SW][NativeClick] cleaned attached debugger', {
          reason,
          tabId: target.tabId,
          title: target.title,
          url: target.url,
        })
      } catch (error) {
        console.warn('[SW][NativeClick] cleanup detach failed', {
          reason,
          tabId: target.tabId,
          error: getErrorMessage(error),
        })
      }
    }

    return attachedTargets.length
  } catch (error) {
    console.warn('[SW][NativeClick] cleanup getTargets failed', {
      reason,
      tabId,
      error: getErrorMessage(error),
    })
    return 0
  }
}

export async function armNativeClick(
  received: NativeClickArmRequest,
  sender: chrome.runtime.MessageSender,
) {
  const tabId = sender?.tab?.id

  if (typeof tabId !== 'number') {
    return {
      ok: false,
      type: ARM_NATIVE_MESSAGE_TYPE,
      error: 'Missing sender tab id',
    }
  }

  const source = normalizeString(received?.source) ?? null
  const expiresAt = Date.now() + NATIVE_CLICK_ARM_TTL_MS

  nativeClickArmByTabId.set(tabId, {
    expiresAt,
    source,
  })

  console.log('[SW][NativeClick] armed', {
    tabId,
    source,
    expiresAt,
  })

  return {
    ok: true,
    type: ARM_NATIVE_MESSAGE_TYPE,
    tabId,
    source,
    expiresAt,
  }
}

export async function onNativeClick(
  received: NativeClickRequest,
  sender: chrome.runtime.MessageSender,
): Promise<NativeClickResult> {
  const tabId = sender?.tab?.id
  const logKey = normalizeString(received?.logKey) ?? 'hcaptcha_logs'
  const rawX = normalizeNumber(received?.coords?.x)
  const rawY = normalizeNumber(received?.coords?.y)

  const addLogSW = async (step: string, details: Record<string, unknown> = {}) => {
    try {
      const res = await chrome.storage.session.get([logKey])
      const logs = Array.isArray(res[logKey]) ? res[logKey] : []
      logs.push({
        time: new Date().toLocaleTimeString('pt-BR'),
        source: 'SW',
        step,
        ...details,
      })
      await chrome.storage.session.set({ [logKey]: logs })
    } catch {
      // Ignore session log storage failures.
    }
  }

  if (typeof tabId !== 'number') {
    return {
      success: false,
      error: 'Missing sender tab id',
    }
  }

  if (rawX === null || rawY === null) {
    return {
      success: false,
      error: 'Missing native click coordinates',
    }
  }

  const armed = consumeArmState(tabId)

  if (!armed) {
    console.warn('[SW][NativeClick] ignored unarmed request', {
      type: NATIVE_MESSAGE_TYPE,
      tabId,
      senderUrl: sender?.url ?? null,
      received,
    })
    void addLogSW('Ignored unarmed native click', {
      tabId,
      senderUrl: sender?.url ?? null,
    })
    return {
      success: false,
      error: 'Native click request was not armed',
    }
  }

  console.log('[SW][NativeClick] received', {
    tabId,
    senderUrl: sender?.url ?? null,
    source: armed.source,
    received,
  })

  const targetX = Math.round(rawX)
  const targetY = Math.round(rawY)
  const debuggee: chrome.debugger.Debuggee = { tabId }

  await cleanupAttachedNativeDebuggers({
    reason: 'before-native-click',
    tabId,
  })

  console.log(`[Debugger] Anexando aba ${tabId} para clique em X:${targetX}, Y:${targetY}`)
  void addLogSW('Attaching debugger', {
    tabId,
    x: targetX,
    y: targetY,
    source: armed.source,
  })

  const attachDebugger = () => new Promise<void>((resolve, reject) => {
    chrome.debugger.attach(debuggee, '1.3', () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }

      resolve()
    })
  })

  const detachDebugger = () => new Promise<void>((resolve) => {
    chrome.debugger.detach(debuggee, () => {
      resolve()
    })
  })

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

  const sendCommand = <TResult = unknown>(
    method: string,
    params: Record<string, unknown>,
  ) => new Promise<TResult>((resolve, reject) => {
    chrome.debugger.sendCommand(debuggee, method, params, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }

      resolve((result ?? null) as TResult)
    })
  })

  let attached = false

  try {
    await attachDebugger()
    attached = true

    console.log('[Debugger] Sucesso ao anexar. Iniciando comandos...')
    void addLogSW('Debugger attached successfully')

    const angle = Math.random() * Math.PI * 2
    const distance = Math.floor(Math.random() * 300) + 300

    const startX = Math.max(10, targetX + Math.cos(angle) * distance)
    const startY = Math.max(10, targetY + Math.sin(angle) * distance)

    const dx = targetX - startX
    const dy = targetY - startY
    const midX = (startX + targetX) / 2
    const midY = (startY + targetY) / 2
    const perpX = -dy
    const perpY = dx
    const arcFactor = (Math.random() * 0.5) - 0.25
    const controlX = midX + (perpX * arcFactor)
    const controlY = midY + (perpY * arcFactor)

    const steps = Math.floor(Math.random() * 20) + 35

    console.log(`[Debugger] Movendo mouse em curva de X:${Math.round(startX)}, Y:${Math.round(startY)}`)
    void addLogSW('Moving mouse trajectory', { startX, startY, controlX, controlY, steps })

    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps
      const easeT = 1 - Math.pow(1 - t, 3)
      const invT = 1 - easeT

      let currentX = (invT * invT * startX) + (2 * invT * easeT * controlX) + (easeT * easeT * targetX)
      let currentY = (invT * invT * startY) + (2 * invT * easeT * controlY) + (easeT * easeT * targetY)

      if (i < steps) {
        const jitterAmount = (1 - easeT) * 4
        currentX += (Math.random() - 0.5) * jitterAmount
        currentY += (Math.random() - 0.5) * jitterAmount
      }

      await sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: Math.round(currentX),
        y: Math.round(currentY),
      })

      await sleep(Math.random() * 8 + 4)
    }

    await sleep(Math.random() * 80 + 70)
    console.log('[Debugger] Rastro concluído. Disparando click!')
    void addLogSW('Mouse hover complete, dispatching click')

    await sendCommand('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: targetX,
      y: targetY,
      button: 'left',
      clickCount: 1,
    })

    await sleep(Math.random() * 40 + 50)

    await sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: targetX,
      y: targetY,
      button: 'left',
      clickCount: 1,
    })

    return {
      success: true,
      message: 'Native click efetuado',
    }
  } catch (error) {
    const message = getErrorMessage(error)
    console.error('Erro no debugger CDP:', error)
    void addLogSW('Error dispatching events', { error: message })

    return {
      success: false,
      error: message,
    }
  } finally {
    if (attached) {
      console.log('[Debugger] Desanexando...')
      void addLogSW('Native click done, detaching')
      await detachDebugger()
    }

    await cleanupAttachedNativeDebuggers({
      reason: 'after-native-click',
      tabId,
    })
  }
}
