export default class Service {
  #running

  constructor() {}

  static create() {
    const service = new Service()

    return service
  }

  process = {
    stop: ({ cause, onStopedProcess }) => {
      this.#running = false

      onStopedProcess({ cause })
    },
  }
}
