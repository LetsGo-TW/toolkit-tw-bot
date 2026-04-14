import { createEventBus } from './event-bus'
import {
  SERVICE_WORKER_CONTROLLER_EVENTS,
  type ServiceWorkerControllerConfig,
  type ServiceWorkerControllerListener,
  type ServiceWorkerControllerTask,
} from './contract'

export * from './contract'

export function createServiceWorkerController(
  config: ServiceWorkerControllerConfig = {},
) {
  const {
    listeners = [],
    startupTasks = [],
  } = config

  // O controller usa o bus só para publicar o ciclo de vida dele mesmo.
  const bus = createEventBus()
  let started = false

  const registerListener = ({
    label,
    event,
    handler,
  }: ServiceWorkerControllerListener) => {
    if (!event?.addListener || typeof handler !== 'function') {
      return false
    }

    // Evita duplicar listener quando o SW é recarregado.
    if (event.hasListener?.(handler)) {
      bus.emit(SERVICE_WORKER_CONTROLLER_EVENTS.LISTENER_SKIPPED, {
        label,
      })
      return false
    }

    event.addListener(handler)
    bus.emit(SERVICE_WORKER_CONTROLLER_EVENTS.LISTENER_REGISTERED, {
      label,
    })
    return true
  }

  const runStartupTask = ({ label, run }: ServiceWorkerControllerTask) => {
    if (typeof run !== 'function') {
      return
    }

    bus.emit(SERVICE_WORKER_CONTROLLER_EVENTS.TASK_STARTED, {
      label,
    })

    Promise.resolve()
      .then(() => run())
      .then((result) => {
        bus.emit(SERVICE_WORKER_CONTROLLER_EVENTS.TASK_COMPLETED, {
          label,
          result: result === undefined ? null : result,
        })
      })
      .catch((error) => {
        // O erro vira evento para o bootstrap decidir como logar/tratar.
        bus.emit(SERVICE_WORKER_CONTROLLER_EVENTS.TASK_ERROR, {
          label,
          error,
        })
      })
  }

  const start = () => {
    if (started) {
      return api
    }

    started = true

    // Primeiro publica o estado de boot, depois registra listeners e dispara tarefas.
    bus.emit(SERVICE_WORKER_CONTROLLER_EVENTS.BOOT_START, {
      listenerCount: listeners.length,
      startupTaskCount: startupTasks.length,
    })

    listeners.forEach(registerListener)
    startupTasks.forEach(runStartupTask)

    bus.emit(SERVICE_WORKER_CONTROLLER_EVENTS.BOOT_READY, {
      listenerCount: listeners.length,
      startupTaskCount: startupTasks.length,
    })

    return api
  }

  const api = {
    start,
    emit: bus.emit,
    on: bus.on,
    off: bus.off,
    isStarted: () => started,
  }

  return api
}

export default createServiceWorkerController
