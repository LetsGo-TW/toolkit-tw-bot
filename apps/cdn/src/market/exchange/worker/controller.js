import { emitter } from ".."
import Service from "./service"

export default class Controller {
  #service
  #worker

  constructor(worker) {
    this.#worker = this.#configureWorker(worker)
  }

  static create(worker) {
    const controller = new Controller(worker)

    controller.#init()

    return controller
  }

  #init () {
    emitter.on('startProcess', ({ urls, type }) => {
      this.#worker ? (
        this.#worker.postMessage({ urls, type })
      ) : (
        this.#executeInPage({ urls, type })
      )
    })

    emitter.on('stopProcess', ({ type, cause }) => {
      this.#worker ? (
        this.#worker.postMessage({ type, cause })
      ) : (
        this.#executeInPage({ type, cause })
      )
    })
  }

  #configureWorker(worker) {
    if (worker) {
      worker.onmessage = ({ data }) => emitter.emit(data.eventType, data)
    } else {
      this.#service = Service.create()

      if (this.#service) {
        emitter.emit('alive')
      }
    }

    return worker
  }

  #executeInPage(data) {
    const { type } = data

    this.#service.process[type]({
      ...data,
      type,
      onOcurrenceUpdate: (args) => {
        postMessage({ eventType: 'ocurrenceUpdate', ...args, type })
      },
      onFinishedProcess: () => {
        postMessage({ eventType: 'finishedProcess', type })
      },
      onStopedProcess: (args) => {
        postMessage({ eventType: 'terminate', ...args, type })
      }
    })
  }

  
}
