export type EventBusEventDetail = Record<string, unknown> | null

export type EventBusEvent = {
  type: string
  detail: EventBusEventDetail
  at: number
}

export type EventBusHandler = (event: EventBusEvent) => void

export function createEventBus() {
  // Cada tipo de evento mantém sua própria lista de listeners.
  const handlersByType = new Map<string, Set<EventBusHandler>>()

  const off = (type: string, handler: EventBusHandler) => {
    const handlers = handlersByType.get(type)
    if (!handlers) return

    handlers.delete(handler)

    if (!handlers.size) {
      handlersByType.delete(type)
    }
  }

  const on = (type: string, handler: EventBusHandler) => {
    if (!handlersByType.has(type)) {
      handlersByType.set(type, new Set())
    }

    handlersByType.get(type)?.add(handler)

    // Retorna um disposer para facilitar unsubscribe no futuro.
    return () => {
      off(type, handler)
    }
  }

  const emit = (type: string, detail: EventBusEventDetail = null) => {
    const handlers = handlersByType.get(type)
    if (!handlers?.size) {
      return
    }

    const event: EventBusEvent = {
      type,
      detail,
      at: Date.now(),
    }

    // Snapshot da lista atual para não quebrar a iteração se algum handler fizer off().
    Array.from(handlers).forEach((handler) => {
      try {
        handler(event)
      } catch (error) {
        // Um listener não pode impedir os outros de rodarem.
        console.error('[SW][EVENT_BUS]', type, error)
      }
    })
  }

  return {
    on,
    off,
    emit,
  }
}

export default createEventBus
