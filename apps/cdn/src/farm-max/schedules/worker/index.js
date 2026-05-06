import Service from "./service"

const service = Service.create()

onmessage = async({ data: { actionName, ...params } }) => {
  service.process[actionName]({
    data: { ...params },
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

postMessage({ eventName: 'alive' })
