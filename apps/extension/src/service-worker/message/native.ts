/// <reference types="chrome" />

import { normalizeNumber, normalizeString } from '../normalize'
import type { SWMessage } from '../../types'

type NativeClickRequest = Partial<SWMessage> & {
  coords?: {
    x?: unknown
    y?: unknown
  } | null
  logKey?: unknown
}

type NativeClickResult = {
  success: boolean
  error?: string
  message?: string
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim()) {
    return error.message
  }

  return String(error || 'Unknown error')
}

export async function onNativeClick(
  received: NativeClickRequest,
  sender: chrome.runtime.MessageSender,
): Promise<NativeClickResult> {
  console.log('[SW][NativeClick] Recebido', received)
  const tabId = sender?.tab?.id
  const rawX = normalizeNumber(received?.coords?.x)
  const rawY = normalizeNumber(received?.coords?.y)

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

  const targetX = Math.round(rawX)
  const targetY = Math.round(rawY)
  const logKey = normalizeString(received?.logKey) ?? 'hcaptcha_logs'

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

  const debuggee: chrome.debugger.Debuggee = { tabId }

  console.log(`[Debugger] Anexando aba ${tabId} para clique em X:${targetX}, Y:${targetY}`)
  void addLogSW('Attaching debugger', { tabId, x: targetX, y: targetY })

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
  }
}
