import { emitter } from ".."
import Service from "./service"

export default class Controller {
  #service
  #worker

  constructor(worker, service) {
    this.#worker = this.#configureWorker(worker, service)
  }

  static create(worker, service, emitter) {
    const controller = new Controller(worker, emitter, service)

    controller.#init()

    return controller
  }

  #init () {
    emitter.on('startProcess', (data) => {
      if (this.#worker) {
        // O objeto Headers não pode ser clonado para o worker.
        // É necessário convertê-lo para um objeto simples antes de enviar.
        if (data.dataRequests) {
          for (const request of data.dataRequests) {
            if (request.init && request.init.headers instanceof Headers) {
              request.init.headers = Object.fromEntries(request.init.headers.entries());
            }
          }
        }
        this.#worker.postMessage({ ...data });
      } else {
        this.#executeInPage(data);
      }
    })

    emitter.on('stopProcess', (data) => {
      this.#worker ? (
        this.#worker.postMessage({ ...data })
      ) : (
        this.#executeInPage(data)
      )
    })
  }

  #configureWorker(worker) {
    if (worker) {
      worker.onmessage = ({ data }) => emitter.emit(data.eventName, data)
    } else {
      this.#service = Service.create()

      if (this.#service) {
        emitter.emit('alive')
      }
    }

    return worker
  }

  #executeInPage({ actionName, ...params }) {
    this.#service.process[actionName]({
      ...params,
      onUpdated: (args) => {
        postMessage({ eventName: 'updated', actionName, ...args })
      },
      onFinished: (args) => {
        postMessage({ eventName: 'finished', actionName, ...args })
      },
      onStoped: (args) => {
        postMessage({ eventName: 'stoped', actionName, ...args })
      },
      onError: (args) => {
        postMessage({ eventName: 'error', actionName, ...args })
      }
    })
  }
}
